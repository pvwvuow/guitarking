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

/** word start times inside one lyric segment */
export function wordTimes(
  text: string,
  t0: number,
  tNext: number,
  exact?: number[]
): WordTiming {
  const words = text.split(/\s+/).filter(Boolean);
  if (exact && exact.length === words.length) return { words, starts: exact };
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
