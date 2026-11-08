# Benchmark round 4 (engine v7.3)

## Why v7.3

* MIN_BEATS=4 won round 3 (0.402 -> 0.416) but it deletes EVERY chord
  shorter than a bar, real ones included. On a synthetic loop with real
  half-bar changes (Am | F G | C | Dm E) frame accuracy fell 95% -> 61%.
  The benchmark cannot see that: akord sheets write about one chord per
  lyric line, so they reward deleting half-bar chords.
  v7.3 keeps a short chord when the audio clearly prefers it over its
  neighbour (GK_KEEP_GAIN, default 1.0): the synthetic loop is back to 95%.
* Repeated sections now share chord evidence before decoding
  (GK_REPEAT_W, default 0.5; GK_REPEAT_THR 0.75): one noisy chorus can no
  longer flip its chords (synthetic: 92% -> 98%; a bridge only matches
  the other bridge, never the verse).

## Steps for Z

1. `git pull`, close the Next.js dev server.
2. `python3 python/bench.py bench/manifest.json --json bench/results-v73.json`
3. Sweep (12 combos; run in two halves if the session is short, e.g.
   `GK_REPEAT_W=0,0.5` then `GK_REPEAT_W=1`):
   ```
   python3 python/sweep.py bench/manifest.json --json bench/sweep-v73.json \
     --grid "GK_KEEP_GAIN=0.5,1,2,99;GK_REPEAT_W=0,0.5,1"
   ```
   `GK_KEEP_GAIN=99` = old v7.2.1 behaviour (every short chord merged),
   `GK_REPEAT_W=0` = repeat pooling off.
4. bench/README.md: summary_clean v7.2 vs v7.3, the sweep table, and the
   change ratio per combo. Don't change defaults.

## How I will read it

KEEP_GAIN=99 will probably score a little higher, because the sheets
under-write half-bar chords. If KEEP_GAIN=1 costs less than ~0.005 it
stays (real half-bar chords matter more than matching a simplified
sheet); REPEAT_W stays only if it scores >= REPEAT_W=0.
