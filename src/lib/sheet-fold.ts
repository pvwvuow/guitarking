/* Repeats are written once.

   The owner: "if a chorus or a verse comes back with the SAME chords,
   don't write it twice". A section whose lines (lyric + chord changes)
   equal an earlier section is not drawn again:
   - right after its twin (همخوان, همخوان دوم): the drawn block gets "×2";
   - later in the song: one compact "↻ repeat" card (chords + the first
     words), with "×N" when it is played several times in a row;
   - a section that equals a run of >= 2 lines inside an earlier section
     (bazi «پایان» = the last three lines of «بند دوم») is a repeat too.
   Equality ignores small word-position differences of the chords (the
   singer lands a little earlier in one chorus): same words + the same
   chord changes in the same order = the same thing to play.
   While a folded repeat plays, the player lights the drawn original word
   by word (lineAlias / mapWord / mapChord). Instrumental sections (no
   sung words) are never folded. */
import type { SheetSeg, SheetSection } from "./songs";

declare module "./songs" {
  interface SheetSeg {
    /** sheet_sync v7.7 --place: words sung before the line's first chord
        change, still on the previous line's chord - drawn without a
        chord label and never a chord change */
    carry?: boolean;
  }
}

export function isSilent(text: string | undefined) {
  const t = (text || "").trim();
  return !t || t === "—";
}

/** a segment drawn without a chord label: the previous line's chord
    (carry), or the same chord as the piece before it in the line */
export function hidesChord(line: SheetSeg[], si: number): boolean {
  const seg = line[si];
  if (!seg) return false;
  if (seg.carry) return true;
  return si > 0 && !!line[si - 1] && line[si - 1].chord === seg.chord;
}

export function segWords(seg: SheetSeg): string[] {
  return isSilent(seg.text) ? [] : seg.text.split(/\s+/).filter(Boolean);
}

/** first word index (in the line) of every segment + the line's total */
export function wordOffsets(line: SheetSeg[]): number[] {
  const out: number[] = [];
  let n = 0;
  for (const seg of line) {
    out.push(n);
    n += segWords(seg).length;
  }
  out.push(n);
  return out;
}

function normWord(w: string) {
  return w.replace(/[\u200c،,.!?؟:;«»"'()…]/g, "").trim();
}

/** chord-change segment indexes of a line (hidden labels skipped) */
export function changeIndexes(line: SheetSeg[]): number[] {
  const out: number[] = [];
  line.forEach((_s, si) => {
    if (!hidesChord(line, si)) out.push(si);
  });
  return out;
}

export function lineKey(line: SheetSeg[]): string {
  const words = line.flatMap(segWords).map(normWord).filter(Boolean);
  const chords = changeIndexes(line).map((si) => line[si].chord);
  return `${words.join(" ")}|${chords.join(" ")}`;
}

function sungWords(sec: SheetSection) {
  return sec.lines.reduce(
    (n, ln) => n + ln.reduce((m, sg) => m + segWords(sg).length, 0),
    0
  );
}

export type SectionView =
  /** drawn in full; `times` = how often it is played in a row */
  | { kind: "full"; s: number; times: number }
  /** a later repeat: lines [from, from + count) of drawn section `of` */
  | { kind: "repeat"; s: number; of: number; from: number; count: number; times: number }
  /** played again right after the view at index `view` (no rows) */
  | { kind: "again"; s: number; view: number };

export interface FoldModel {
  views: SectionView[];
  /** flat line index -> flat line index of the drawn line it plays */
  alias: number[];
  /** flat line index -> index of the view it belongs to */
  viewOfLine: number[];
  /** first flat line index of every section */
  base: number[];
  folded: boolean;
}

const MIN_WORDS = 6; // a section this short is cheaper to read than a card

export function foldSections(sections: SheetSection[], fold = true): FoldModel {
  const keys = sections.map((sec) => sec.lines.map(lineKey));
  const base: number[] = [];
  let acc = 0;
  for (const sec of sections) {
    base.push(acc);
    acc += sec.lines.length;
  }
  const alias = Array.from({ length: acc }, (_v, i) => i);
  const viewOfLine = new Array<number>(acc).fill(0);
  const views: SectionView[] = [];
  /** section index -> [drawn section, first line] it plays */
  const root: [number, number][] = [];
  /** section index -> view index */
  const viewOf: number[] = [];

  const sameAs = (s: number, a: number, from: number) =>
    keys[s].length > 0 &&
    from + keys[s].length <= keys[a].length &&
    keys[s].every((k, i) => k === keys[a][from + i]);

  sections.forEach((sec, s) => {
    const n = sec.lines.length;
    const foldable = fold && n > 0 && sungWords(sec) >= MIN_WORDS;
    let placed = false;
    if (foldable && s > 0 && keys[s].length === keys[s - 1].length && sameAs(s, s - 1, 0)) {
      // played again right away: ×2 on the block before
      const v = viewOf[s - 1];
      const pv = views[v];
      if (pv.kind === "full" || pv.kind === "repeat") pv.times += 1;
      views.push({ kind: "again", s, view: v });
      root[s] = root[s - 1];
      viewOf[s] = v;
      placed = true;
    }
    if (!placed && foldable) {
      for (let a = 0; a < s && !placed; a++) {
        const va = views[viewOf[a]];
        if (va.kind !== "full") continue; // compare with drawn sections only
        for (let from = 0; from + n <= keys[a].length; from++) {
          if (from > 0 || n !== keys[a].length) {
            if (n < 2) break; // a partial repeat needs >= 2 lines
          }
          if (sameAs(s, a, from)) {
            views.push({ kind: "repeat", s, of: a, from, count: n, times: 1 });
            root[s] = [a, from];
            viewOf[s] = views.length - 1;
            placed = true;
            break;
          }
        }
      }
    }
    if (!placed) {
      views.push({ kind: "full", s, times: 1 });
      root[s] = [s, 0];
      viewOf[s] = views.length - 1;
    }
    const [rs, rf] = root[s];
    for (let l = 0; l < n; l++) {
      alias[base[s] + l] = base[rs] + rf + l;
      viewOfLine[base[s] + l] = viewOf[s];
    }
  });
  return { views, alias, viewOfLine, base, folded: fold };
}

/** the segment + word of drawn line `to` that plays word `wi` of segment
    `si` of line `from` (same words, maybe split differently) */
export function mapWord(
  from: SheetSeg[],
  si: number,
  wi: number,
  to: SheetSeg[]
): { si: number; g: number } {
  if (from === to) {
    const off = wordOffsets(from);
    return { si, g: off[si] + Math.max(wi, 0) };
  }
  const offF = wordOffsets(from);
  const offT = wordOffsets(to);
  const nF = offF[si + 1] - offF[si];
  if (nF === 0) {
    // a silent piece: the k-th chord change maps to the k-th
    return { si: mapChord(from, si, to), g: offF[si] };
  }
  const g = offF[si] + Math.max(wi, 0);
  for (let k = 0; k < to.length; k++) {
    if (offT[k + 1] > offT[k] && g >= offT[k] && g < offT[k + 1]) return { si: k, g };
  }
  return { si: Math.max(0, to.length - 1), g };
}

/** the segment of drawn line `to` showing the chord of segment `si` of
    line `from` (the k-th chord change of a line maps to the k-th) */
export function mapChord(from: SheetSeg[], si: number, to: SheetSeg[]): number {
  if (from === to) return si;
  const cf = changeIndexes(from);
  const ct = changeIndexes(to);
  let k = cf.indexOf(si);
  if (k < 0) {
    // a hidden label: the change it continues
    k = cf.filter((x) => x <= si).length - 1;
  }
  return ct[Math.max(0, Math.min(k, ct.length - 1))] ?? 0;
}

/** chord changes of a section run, in order (for the repeat card) */
export function runChords(lines: SheetSeg[][]): string[] {
  const out: string[] = [];
  for (const ln of lines)
    for (const si of changeIndexes(ln)) {
      const c = ln[si].chord;
      if (c && c !== "N" && out[out.length - 1] !== c) out.push(c);
    }
  return out;
}

/** first sung words of a run (card preview) */
export function runPreview(lines: SheetSeg[][], max = 42): string {
  const txt = lines
    .flatMap((ln) => ln.flatMap(segWords))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  return txt.length > max ? `${txt.slice(0, max).replace(/\s+\S*$/, "")} …` : txt;
}

export function faNum(n: number): string {
  return n.toLocaleString("fa-IR");
}
