# Engine benchmark — round 4 (v7.3) status

Per docs/BENCH_ROUND4.md. Audio stays local (gitignored). Defaults NOT
changed: KEEP_GAIN=1, REPEAT_W=0.5, MIN_BEATS=4 ship as released.
Sweep half 2 (REPEAT_W=1) was dropped by decision — see below.

## summary_clean v7.2 vs v7.3 (28 trusted refs)

| ver  | root  | majmin | change_f | seq_root | seq_majmin | seq_change_ratio |
|------|-------|--------|----------|----------|------------|------------------|
| v7.2 | .6024 | .5294  | .5588    | .4232    | .3987      | 1.6105           |
| v7.3 | .5987 | .5258  | .5552    | .4259    | .4005      | 1.6000           |

30 songs, 0 errors (results-v73.json). Frame metrics dip ~0.004 — expected:
the sheets under-write half-bar chords (round-4 brief), so keeping real
short chords reads as "wrong" against them. Sequence metrics and the change
ratio both improve.

## Sweep, structural knobs (12 combos; half 1 done = 9/13 rows incl. baseline)

| score  | change x | knobs                                        |
|--------|----------|----------------------------------------------|
| 0.4161 | 1.478    | KEEP_GAIN=99, REPEAT_W=0 (= v7.2.1 merge-all) |
| 0.4140 | 1.474    | KEEP_GAIN=99, REPEAT_W=0.5                   |
| 0.4053 | 1.588    | KEEP_GAIN=2, REPEAT_W=0                      |
| 0.4048 | 1.582    | KEEP_GAIN=2, REPEAT_W=0.5                    |
| 0.4025 | 1.600    | defaults (KEEP_GAIN=1, REPEAT_W=0.5)         |
| 0.4024 | 1.606    | KEEP_GAIN=1, REPEAT_W=0                      |
| 0.4018 | 1.600    | KEEP_GAIN=0.5, REPEAT_W=0.5                  |
| 0.4016 | 1.611    | KEEP_GAIN=0.5, REPEAT_W=0                    |
| —      | —        | KEEP_GAIN 0.5/1/2/99 × REPEAT_W=1 → dropped   |

Read (half 1):

* KEEP_GAIN=99 (merge every short chord, the v7.2.1 world) tops the table
  and reproduces round 3's winner exactly (0.4161, x1.478). Against the
  same REPEAT_W, KEEP_GAIN=1 costs 0.0137 (REPEAT_W=0) / 0.0115
  (REPEAT_W=0.5) — above the brief's ~0.005 tolerance. But the brief itself
  warns the sheets under-write half-bar chords, so this number is an upper
  bound; the synthetic loop says the true musical cost of KEEP_GAIN=99 is
  huge (95% -> 61% frame accuracy on real half-bar changes).
* KEEP_GAIN=2 is the middle ground: +0.003 over default with change x1.58,
  while still keeping strongly-evidenced short chords.
* REPEAT_W is a wash on the sheets: at KEEP_GAIN=1, REPEAT_W=0.5 scores
  0.4025 vs 0.4024 for 0 (stays, per the brief's ">= 0" criterion, barely);
  it turns slightly negative when the merge is aggressive (99: -0.0021).

Decision stays with the maintainer; per instruction nothing was changed.

## Sweep half 2 (REPEAT_W=1): dropped by decision

Half 2 was never run. Decision (2026-11-09): keep the v7.3 defaults
(KEEP_GAIN=1, REPEAT_W=0.5) and stop engine work here for now. Half 1
already covers REPEAT_W 0 vs 0.5, which was a wash on the sheets, so the
REPEAT_W=1 rows would not change the call. No further engine rounds are
planned; bench/ holds results-v73.json and sweep-v73.json as the final
record.

## Round 3 (v7.2) archive

v7.2 shipped MIN_BEATS=4 (round-3 sweep winner 0.402 -> 0.416) and the
fast-grid 8-beat bars; results-v72.json, 30 songs, 0 errors, seq_majmin
0.3987, seq_change_ratio 1.61. Outlier sheet-vs-engine sequences
(babayebaroon x6.2, raazim x3.05, divooneh x2.74, oonrooza x1.1) are in
bench/four-outliers.json with the analysis in the round-3 README history.
