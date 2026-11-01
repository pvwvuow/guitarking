/* Live-sync helpers (engine v7).

   The sheet follows the song on two clocks:
   - LYRICS: a segment's `t` is when its words start; inside the active
     segment the words light up one by one (exact `w` word times when the
     alignment provides them, else spread by character weight);
   - CHORDS: a segment's `ct` is the beat-exact moment its chord starts
     (python/sheet_sync.py). Without `ct` the lyric time is used.
   Engine beats/downbeats drive the beat pulse in the player. */
import type { SongEntry } from "./songs";

declare module "./songs" {
  interface SheetSeg {
    /** beat-exact chord change time (s); `t` stays the lyric start */
    ct?: number;
    /** optional per-word start times (s) for exact karaoke */
    w?: number[];
  }
  interface SongEntry {
    /** engine beat grid (python/sheet_sync.py output) */
    beats?: number[];
    downbeats?: number[];
    bpb?: number;
  }
}

/** index of the last value <= t in an ascending list, -1 if none */
export function lastAtOrBefore(starts: ArrayLike<number>, t: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= t + 1e-4) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

/** bar position (0 = downbeat) of every beat */
export function beatPositions(
  beats: number[],
  downbeats: number[] | undefined,
  bpb: number
): number[] {
  const n = beats.length;
  const pos = new Array<number>(n).fill(0);
  if (!downbeats || !downbeats.length) {
    for (let i = 0; i < n; i++) pos[i] = i % bpb;
    return pos;
  }
  let j = 0;
  let last = -1;
  let first = -1;
  for (let i = 0; i < n; i++) {
    while (j < downbeats.length && downbeats[j] < beats[i] - 0.01) j++;
    if (j < downbeats.length && Math.abs(downbeats[j] - beats[i]) <= 0.01) {
      last = i;
      if (first < 0) first = i;
    }
    pos[i] = last < 0 ? 0 : (i - last) % bpb;
  }
  for (let i = 0; i < first; i++) pos[i] = (((i - first) % bpb) + bpb) % bpb;
  return pos;
}

export interface BeatState {
  index: number;
  inBar: number;
}

export function beatState(
  beats: number[],
  pos: number[],
  t: number
): BeatState | null {
  const i = lastAtOrBefore(beats, t);
  if (i < 0) return null;
  return { index: i, inBar: pos[i] ?? 0 };
}

/** whole beats from t until `target` (0 when target is on/before t) */
export function beatsBetween(beats: number[], t: number, target: number): number {
  if (!beats.length) return 0;
  return Math.max(0, lastAtOrBefore(beats, target) - lastAtOrBefore(beats, t));
}

const SEC_PER_CHAR = 0.16;

export interface WordTiming {
  words: string[];
  starts: number[];
}

/** Whisper word stamps on Persian songs are often broken: identical
    stamps for a whole line, ten words squeezed into one second, or the
    first word seconds after the line lit up. Accept them only when they
    look like real singing; small runs of duplicates are spread out. */
export function cleanWordTimes(
  exact: number[] | undefined,
  nWords: number,
  t0: number,
  tNext: number
): number[] | null {
  if (!exact || exact.length !== nWords || !nWords) return null;
  const lo = t0 - 0.6;
  const hi = tNext + 0.3;
  let dupes = 0;
  for (let i = 0; i < exact.length; i++) {
    const s = exact[i];
    if (!Number.isFinite(s) || s < lo || s > hi) return null;
    if (i > 0) {
      if (s < exact[i - 1] - 1e-3) return null;
      if (s - exact[i - 1] < 0.05) dupes++;
    }
  }
  if (exact[0] - t0 > 1.0) return null;
  if (nWords > 1 && dupes / (nWords - 1) > 0.25) return null;
  const span = exact[nWords - 1] - exact[0];
  if (nWords >= 4 && span / (nWords - 1) < 0.12) return null;
  // spread short runs of identical stamps up to the next distinct one
  const out = exact.slice();
  let i = 0;
  while (i < nWords) {
    let j = i;
    while (j + 1 < nWords && out[j + 1] - out[i] < 0.05) j++;
    if (j > i) {
      const end = j + 1 < nWords ? out[j + 1] : Math.min(tNext, out[i] + 0.4 * (j - i + 1));
      const step = (end - out[i]) / (j - i + 1);
      for (let k = i + 1; k <= j; k++) out[k] = out[i] + step * (k - i);
    }
    i = j + 1;
  }
  return out;
}

/** word start times inside one lyric segment */
export function wordTimes(
  text: string,
  t0: number,
  tNext: number,
  exact?: number[]
): WordTiming {
  const words = text.split(/\s+/).filter(Boolean);
  const clean = cleanWordTimes(exact, words.length, t0, tNext);
  if (clean) return { words, starts: clean };
  const chars = words.reduce((n, w) => n + w.length, 0) || 1;
  const sung = Math.min(
    Math.max(tNext - t0, 0.3),
    Math.max(1.2, chars * SEC_PER_CHAR)
  );
  let acc = 0;
  const starts = words.map((w) => {
    const s = t0 + (acc / chars) * sung;
    acc += w.length;
    return s;
  });
  return { words, starts };
}

/** true when a song carries beat-exact sync data */
export function hasBeatSync(song: SongEntry): boolean {
  return Array.isArray(song.beats) && song.beats.length > 1;
}
