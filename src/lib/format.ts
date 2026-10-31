import type { AnalysisResult } from "./types";

const NOTE_FA: Record<string, string> = {
  C: "دو", "C#": "دو دیز", D: "ر", "D#": "ر دیز", E: "می",
  F: "فا", "F#": "فا دیز", G: "سل", "G#": "سل دیز",
  A: "لا", "A#": "لا دیز", B: "سی",
};

/** Format seconds as m:ss (latin digits, standard for players). */
export function fmtTime(t: number): string {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Root note (latin) of a chord label like "Am7" -> "A", "C#" -> "C#". */
export function chordRoot(chord: string): string {
  const m = chord.match(/^([A-G]#?)/);
  return m ? m[1] : "";
}

/** Persian note name of a chord root. */
export function chordRootFa(chord: string): string {
  const root = chordRoot(chord);
  return NOTE_FA[root] ?? "";
}

/** Display label for a chord ("N" means no chord). */
export function chordDisplay(chord: string): string {
  return chord === "N" ? "—" : chord;
}

export function isNoChord(chord: string): boolean {
  return chord === "N";
}

/** Human-readable quality suffix of a chord. */
export function chordQuality(chord: string): string {
  if (chord === "N") return "بدون آکورد";
  if (chord.endsWith("m7")) return "مینور هفتم";
  if (chord.endsWith("maj7")) return "ماژور هفتم";
  if (chord.endsWith("7")) return "دومینانت هفتم";
  if (chord.endsWith("m")) return "مینور";
  return "ماژور";
}

export function keyLabelFa(key: { tonic: string; mode: string }): string {
  const mode = key.mode === "minor" ? "مینور" : "ماژور";
  return `${NOTE_FA[key.tonic] ?? key.tonic} ${mode}`;
}

export function keyLabelLatin(key: { tonic: string; mode: string }): string {
  return `${key.tonic} ${key.mode}`;
}

/** Build a plain-text chord sheet for copy/download. */
export function buildChordSheet(fileName: string, r: AnalysisResult): string {
  const lines: string[] = [];
  lines.push("🎸 گیتارکینگ — برگه آکورد");
  lines.push("──────────────────────────────");
  lines.push(`آهنگ: ${fileName}`);
  lines.push(
    `مدت: ${fmtTime(r.duration)}   |   تمپو: ${Math.round(r.tempo)} BPM   |   کلید: ${keyLabelFa(r.key)} (${keyLabelLatin(r.key)})`
  );
  lines.push("");
  for (const sec of r.sections) {
    lines.push(
      `■ بخش ${sec.label}  (${fmtTime(sec.start)} تا ${fmtTime(sec.end)})`
    );
    // rows of 8 chords, prefixed with the start time of the row's first chord
    const segs = sec.segments;
    for (let i = 0; i < segs.length; i += 8) {
      const row = segs.slice(i, i + 8);
      const names = row
        .map((s) => (s.chord === "N" ? "—" : s.chord).padEnd(6, " "))
        .join(" ");
      lines.push(`${fmtTime(row[0].start).padStart(5, " ")}  |  ${names.trimEnd()}`);
    }
    lines.push("");
  }
  lines.push("── خلاصه آکوردها ──");
  for (const u of r.chordSeconds.slice(0, 10)) {
    lines.push(`${u.chord.padEnd(7, " ")} ${String(Math.round(u.percent)).padStart(3, " ")}٪`);
  }
  return lines.join("\n");
}
