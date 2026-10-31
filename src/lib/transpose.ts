/* Chord transposition + automatic guitar fingering (barre) shapes */

const SHARP = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

const CHORD_RE = /^([A-G])(#|b)?(.*)$/;

/** Transpose a chord like "Am7" / "F#m" / "Bb" by n semitones. */
export function transposeChord(chord: string, semi: number): string {
  if (semi === 0) return chord;
  const m = chord.match(CHORD_RE);
  if (!m) return chord;
  const [, letter, acc, suffix] = m;
  const name = letter + (acc ?? "");
  const idx = Math.max(SHARP.indexOf(name), FLAT.indexOf(name));
  if (idx < 0) return chord;
  const next = (idx + semi + 120) % 12;
  // keep the accidental family of the source chord
  return (acc === "b" ? FLAT : SHARP)[next] + suffix;
}

export function chordRootIndex(chord: string): number {
  const m = chord.match(CHORD_RE);
  if (!m) return -1;
  const name = m[1] + (m[2] ?? "");
  return Math.max(SHARP.indexOf(name), FLAT.indexOf(name));
}

/* ── fingering shapes ──────────────────────────────────────────────────── */

export interface ChordShape {
  /** fret per string, low E → high e; -1 = muted, 0 = open */
  frets: number[];
  /** fret of the barre (0 = no barre) */
  barre: number;
  /** lowest fret shown in the diagram window */
  base: number;
}

type FretVec = number[]; // 6 values, relative offsets or absolute

// open-position chord dictionary (low E → high e)
const OPEN: Record<string, FretVec> = {
  C: [-1, 3, 2, 0, 1, 0],
  Cmaj7: [-1, 3, 2, 0, 0, 0],
  C7: [-1, 3, 2, 3, 1, 0],
  D: [-1, -1, 0, 2, 3, 2],
  Dm: [-1, -1, 0, 2, 3, 1],
  D7: [-1, -1, 0, 2, 1, 2],
  Dmaj7: [-1, -1, 0, 2, 2, 2],
  Dm7: [-1, -1, 0, 2, 1, 1],
  E: [0, 2, 2, 1, 0, 0],
  Em: [0, 2, 2, 0, 0, 0],
  E7: [0, 2, 0, 1, 0, 0],
  Em7: [0, 2, 0, 0, 0, 0],
  Emaj7: [0, -1, 1, 1, 0, -1],
  F: [1, 3, 3, 2, 1, 1],
  Fmaj7: [-1, 3, 3, 2, 1, 0],
  G: [3, 2, 0, 0, 0, 3],
  G7: [3, 2, 0, 0, 0, 1],
  Gmaj7: [3, 2, 0, 0, 0, 2],
  A: [-1, 0, 2, 2, 2, 0],
  Am: [-1, 0, 2, 2, 1, 0],
  A7: [-1, 0, 2, 0, 2, 0],
  Am7: [-1, 0, 2, 0, 1, 0],
  Amaj7: [-1, 0, 2, 1, 2, 0],
  B7: [-1, 2, 1, 2, 0, 2],
  Bm: [-1, 2, 4, 4, 3, 2],
  Bm7: [-1, 2, 0, 2, 0, 2],
  Bb: [-1, 1, 3, 3, 2, 1],
  Bbmaj7: [-1, 1, 3, 2, 2, 1],
};

// moveable barre shapes: offsets added to the barre fret
// strings: [E, A, D, G, B, e]  (A-shape first string muted via E_MUTE marker)
const E_SHAPE: Record<string, FretVec> = {
  "": [0, 2, 2, 1, 0, 0],
  m: [0, 2, 2, 0, 0, 0],
  "7": [0, 2, 0, 1, 0, 0],
  m7: [0, 2, 0, 0, 0, 0],
};
const A_SHAPE: Record<string, FretVec> = {
  "": [-1, 0, 2, 2, 2, 0],
  m: [-1, 0, 2, 2, 1, 0],
  "7": [-1, 0, 2, 0, 2, 0],
  m7: [-1, 0, 2, 0, 1, 0],
  maj7: [-1, 0, 2, 1, 2, 0],
};

const QUALITY_RE = /^(maj7|m7|maj|sus4|sus2|dim|aug|5|m|7|\+)?(.*)$/;

/** Build a playable fingering for any maj/m/7/m7/maj7 chord. */
export function chordShape(chord: string): ChordShape | null {
  const m = chord.match(CHORD_RE);
  if (!m) return null;
  const [, letter, acc, rest] = m;
  const qm = rest.match(QUALITY_RE);
  if (!qm) return null;
  const quality = qm[1] ?? "";

  const rootName = letter + (acc ?? "");
  const k = Math.max(SHARP.indexOf(rootName), FLAT.indexOf(rootName));
  if (k < 0) return null;

  if (OPEN[chord]) {
    const frets = OPEN[chord];
    const played = frets.filter((f) => f > 0);
    if (!played.length) return null;
    const maxF = Math.max(...played);
    return { frets, barre: 0, base: maxF <= 4 ? 0 : Math.min(...played) };
  }

  // E-shape: root on low E string → barre at (k - 4) mod 12
  const ePos = (k - 4 + 12) % 12;
  // A-shape: root on A string → barre at (k - 9) mod 12
  const aPos = (k - 9 + 12) % 12;

  const eVec = E_SHAPE[quality];
  const aVec = A_SHAPE[quality];

  const candidates: { pos: number; vec: FretVec; from: "E" | "A" }[] = [];
  if (eVec) candidates.push({ pos: ePos === 0 ? 0 : ePos, vec: eVec, from: "E" });
  if (aVec) candidates.push({ pos: aPos === 0 ? 0 : aPos, vec: aVec, from: "A" });
  if (!candidates.length) return null;

  // prefer positions inside a comfortable window (barre ≤ 7), then lower
  candidates.sort(
    (a, b) => (a.pos > 7 ? 100 : a.pos) - (b.pos > 7 ? 100 : b.pos)
  );
  const best = candidates[0];

  const frets = best.vec.map((off) => (off < 0 ? -1 : off + best.pos));
  const played = frets.filter((f) => f > 0);
  if (!played.length) return null;
  const maxF = Math.max(...played);
  return {
    frets,
    barre: best.pos > 0 ? best.pos : 0,
    base: maxF <= 4 ? 0 : Math.min(...played),
  };
}
