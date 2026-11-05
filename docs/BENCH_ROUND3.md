# Benchmark round 3 (engine v7.2)

## What round 2 said

* Clean refs (28): seq_majmin 0.389, seq_change_ratio 1.65.
* The decode-knob sweep is FLAT: 6 combos spread 0.3909-0.3941. EM_TEMP /
  CP4 / KEY_PENALTY are not the bottleneck, so the remaining 13 combos of
  the round-2 grid are dropped. v7.2 adopts the round-2 leader as default
  (EM_TEMP 0.5, CP4 0.25/0.005/0.03/0.005, KEY_PENALTY 0.3).
* The over-segmentation follows the grid speed: songs decoded at 129-161
  BPM wrote ~1.7-2.3x the sheet's changes (sange, atish, alborz, baron,
  aroom, soltangholbha), songs at 89-123 BPM mostly 0.9-1.3x (akhmat,
  setare, delvapasi, dobare, bepanahi, rangkhoda). A fast grid offers
  twice the change slots.
* Outliers to read by eye: sadeghi-babayebaroon x6.3 (127 engine chords
  vs 21), talischi-raazim x3.3, farzad-divooneh x2.8, and
  sirvan-oonrooza x0.28 (only 12 engine chords vs 41: stuck).

## What changed in v7.2

* Fast grids (> GK_FAST_BPM, default 125) decode with 8-beat bars (cheap
  change on 1, moderate on 5, rare elsewhere) or 6/8; the player still
  gets 4/4 bars.
* Chord runs shorter than GK_MIN_BEATS beats (default 2) are absorbed by
  the neighbour chord that explains them best (1-beat melody blips).
* bench rows carry `seq_est` (engine chord order) next to the sheet.

## Steps for Z

1. `git pull`. Close the Next.js dev server before running (OOM).
2. `python3 python/bench.py bench/manifest.json --json bench/results-v72.json`
3. Sweep, structural knobs only (7 combos, ~40 min with a cold cache):
   ```
   python3 python/sweep.py bench/manifest.json --json bench/sweep-v72.json \
     --grid "GK_FAST_BPM=125,999;GK_MIN_BEATS=1,2,4"
   ```
   `GK_FAST_BPM=999` = fast-grid rule off, `GK_MIN_BEATS=1` = merge off,
   so the table shows what each change is worth on its own.
   If the session is short, run it in two halves with
   `--grid "GK_FAST_BPM=125;GK_MIN_BEATS=1,2,4"` then `...=999...`.
4. In bench/README.md: summary_clean v7.1 vs v7.2, the sweep table, and
   for babayebaroon, raazim, divooneh and oonrooza paste the sheet
   sequence and `seq_est` side by side (first ~40 chords each). Don't
   change defaults.
