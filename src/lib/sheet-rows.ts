/* Beyt rows: two short lyric lines (the two halves of a beyt) share ONE
   row of the sheet, so a song reads like a poem instead of a long list.

   Rules (per section only - a verse line never joins a chorus line, and
   pairing restarts at every section):
   - two lines join when each is short (<= MISRA_MAX characters of lyric)
     and together they still fit (<= BEYT_MAX);
   - a line that is already a whole beyt (long) stays alone, and the
     pairing restarts after it;
   - two instrumental lines (only "—" / no words) join each other, never a
     sung line.
   No rhyme guessing: sung Persian often ends both halves on the same
   sound (میمیری / میگیری) across beyts, so a rhyme test splits real beyts. */
import type { SheetSeg } from "./songs";

export const MISRA_MAX = 48;
export const BEYT_MAX = 92;

function isSilent(text: string) {
  const t = (text || "").trim();
  return !t || t === "—";
}

/** the sung words of a line (instrumental placeholders excluded) */
export function lineLyric(line: SheetSeg[]): string {
  return line
    .map((s) => s.text)
    .filter((t) => !isSilent(t))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function canJoin(a: string, b: string): boolean {
  if (!a && !b) return true; // two instrumental lines
  if (!a || !b) return false; // never an instrumental with a sung line
  return a.length <= MISRA_MAX && b.length <= MISRA_MAX && a.length + b.length <= BEYT_MAX;
}

/** groups of line indexes (in order) that share one row */
export function beytRows(lines: SheetSeg[][]): number[][] {
  const text = lines.map(lineLyric);
  const rows: number[][] = [];
  let i = 0;
  while (i < lines.length) {
    if (i + 1 < lines.length && canJoin(text[i], text[i + 1])) {
      rows.push([i, i + 1]);
      i += 2;
    } else {
      rows.push([i]);
      i += 1;
    }
  }
  return rows;
}
