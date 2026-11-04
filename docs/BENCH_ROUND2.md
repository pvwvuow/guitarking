# Benchmark round 2 (engine v7.1)

Round 1 (`bench/results-v7.json`) was useful, but most of the "worst
songs" were broken references, not engine errors. Read this first, then
run the steps below. Do NOT edit `src/lib/songs.ts` chords.

## What round 1 really showed

1. **Broken sequence refs.** Several akord.ir extractions kept only the
   FIRST chord of every lyric line, e.g. `yeganeh-behetgholmidam` =
   `Em Em Em Em Em Em Em Em` (the real sheet loops Em D C B),
   `hamayoon-alborz` = only Am/Em in a song in F, `zand-royaye` = 6 chords
   for a whole song. Scoring 160 engine changes against 10 is meaningless.
   `python/bench.py` now flags these refs (`"suspect"`) and keeps them out
   of `summary_clean`. Flagged in the current manifest:
   yeganeh-behetgholmidam, hamayoon-alborz, sadeghi-soltangholbha,
   farzad-atish, zand-royaye, sirvan-bargard, masih-aroom,
   sadeghi-babayebaroon, talischi-biamanoboobin, plus the 5 proxy labs.
2. **The 5 labs are not ground truth.** They were made by an algorithm
   (bass chroma on a beat grid), not by ear. Keep them for debugging, but
   they never count as references (bench.py flags notes with "proxy").
3. **Real engine problems** (fixed in v7.1, see below): non-commensurate
   tempo (sad-gozashtam 123 BPM on a 94/47 BPM song puts chord changes
   BETWEEN beats), fast triple grids (129-161 BPM, bpb 3) allowing a change
   every half bar, moderate over-segmentation (1.3-2.3x the sheet's
   changes on the good refs), OOM on songs longer than ~4.5 min.

## What changed in v7.1

* `python/meter.py`: tempo competition (x2, x1/2, x3/2, x2/3, x4/3, x3/4)
  scored by how well harmony changes + low-band onsets lock to the grid;
  6/8 meter; mid-bar change cost raised; every knob has an env override.
  On a synthetic 94 BPM ballad librosa alone says 123 BPM (the exact
  round-1 artifact); v7.1 picks 95.7 and gets 99.5% frame accuracy.
* `python/chordnet/model.py` + `chunking.py`: the nets run in 47 s windows
  with 3.7 s overlap, so memory stays flat on long songs.
* `python/chordnet/engine.py`: network probabilities cached per song in
  `GK_CACHE_DIR` (sweeps don't re-run the nets), vectorized beat
  emissions, env knobs `GK_EM_TEMP`, `GK_KEY_PENALTY`, `GK_KEY_SLACK`.
* `python/bench.py`: ref sanity flags, `summary_clean`, change ratios,
  `engine_ver`, tempo candidates per song, `--only a,b`.
* `python/sweep.py`: grid search of decode knobs on trusted refs only.

## Steps for Z

1. `git pull` (main). Use a NEW result cache: round-1 `--cache` JSONs
   are v7 output. Simplest: no `--cache` flag at all.
2. **Fix the refs** (most valuable step). For every song flagged suspect,
   reopen the sheet and copy EVERY chord in reading order: all chords of
   each line, left to right, every line, repeats included. If the page
   itself only shows one chord per line, find the song on laminor.org or
   another site; if nothing complete exists, remove the song (don't
   invent). Aim for 30+ trusted songs; add new ones the same way.
   Re-run `python3 python/bench.py bench/manifest.json --json /tmp/x.json`
   and check that `suspect` is empty for every song you fixed.
3. **Timed refs (optional, high value):** only real human annotations.
   If you can get audio for songs with published hand-made .lab files
   (Isophonics Beatles / Queen / Carole King, McGill Billboard), add 5-10
   as timed refs. No algorithmic labs.
4. Run the benchmark:
   `python3 python/bench.py bench/manifest.json --json bench/results-v71.json`
   The 6 long songs should now finish. If one still dies, re-run with
   `GK_CHUNK=1024` and note it.
5. Run the sweep (fills the prob cache on the first combo, then fast):
   ```
   python3 python/sweep.py bench/manifest.json --json bench/sweep-v71.json \
     --grid "GK_EM_TEMP=0.5,0.6,0.7;GK_CP4=0.30/0.008/0.05/0.008,0.30/0.012/0.08/0.012,0.25/0.005/0.03/0.005;GK_KEY_PENALTY=0.3,0.45"
   ```
   19 combos. Don't change any defaults yourself.
6. Commit `bench/results-v71.json`, `bench/sweep-v71.json`, the fixed
   manifest, and a short `bench/README.md` update: summary_clean, the
   top-5 sweep table, the tempo chosen for sad-gozashtam / koo-beheshtemoon
   / the 129-161 BPM songs, and anything that still crashed. Never commit
   audio or `~/.cache/guitarking`.

## Reading the numbers

* `seq_majmin` on clean refs is the main score. `seq_change_ratio` /
  `change_ratio` = engine changes / ref changes. Human sheets under-write
  chords, so ~1.2-1.5 is normal; 3+ means over-segmentation.
* `*_shift` != 0 means the sheet is in another key/capo position (fine) or
  the engine picked the wrong key (look at it).
