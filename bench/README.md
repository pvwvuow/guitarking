# Engine benchmark — round 3 (v7.2) status

Per docs/BENCH_ROUND3.md. Audio stays local (gitignored). Defaults not
changed; the sweep suggests MIN_BEATS=4 but v7.2 ships MIN_BEATS=2 and we
left it as released.

## summary_clean v7.1 vs v7.2 (28 trusted refs)

| ver  | root  | majmin | change_f | seq_root | seq_majmin | seq_change_ratio |
|------|-------|--------|----------|----------|------------|------------------|
| v7.1 | .5784 | .5054  | .5623    | .4153    | .3887      | 1.6485           |
| v7.2 | .6024 | .5294  | .5588    | .4232    | .3987      | 1.6105           |

30 songs, 0 errors (results-v72.json). oonrooza un-stuck: x0.28 -> x1.1
(45 engine chords vs 41 sheet).

## Sweep, structural knobs only (7 combos, trusted refs)

| score  | change x | knobs                                     |
|--------|----------|-------------------------------------------|
| 0.4161 | 1.478    | GK_FAST_BPM=125, GK_MIN_BEATS=4           |
| 0.4146 | 1.452    | GK_FAST_BPM=999 (fast-grid off), MIN_BEATS=4 |
| 0.4020 | 1.611    | defaults (FAST=125, MIN_BEATS=2)          |
| 0.4020 | 1.611    | FAST=125, MIN_BEATS=1                     |
| 0.4020 | 1.611    | FAST=125, MIN_BEATS=2                     |
| 0.3997 | 1.624    | FAST=999, MIN_BEATS=1                     |
| 0.3997 | 1.624    | FAST=999, MIN_BEATS=2                     |

Read: the short-chord merge only pays off at MIN_BEATS=4 (+0.014, change
x1.61 -> ~1.46-1.48); at 1 and 2 beats it is a no-op on this grid (identical
scores). The fast-grid rule itself is near-neutral (0.4161 with vs 0.4146
without), so keep it. MIN_BEATS=4 is the obvious next default candidate.

## Outliers, sheet vs engine (first ~40 collapsed chords each)

The raw sequences are in bench/four-outliers.json.

farzad-divooneh (x2.74, sheet Cm):
  SHEET : Cm Bb Ab Gm Bb Cm Bb Ab Gm Bb Gm Cm Ab G Bb Cm Ab Cm G Fm Cm Bb Ab Bb
  ENGINE: Cm Bb Cm Ab Bb Gm Cm Bb Ab Bb Gm Cm Abmaj7 Bb Gm Ab Fm7 Bb Gm7 Cm Gm7
          Abmaj7 Bb Gm Cm Ab Bb Gm Ab Fm7 Gsus4 G Cm Bb Ab Bb Cm Ab Bb Ab
  Read: same Cm-Ab-Bb-Gm loop, engine adds 7ths + passing Gsus4/Fm7 per line
  half -> the x2.7 is change-count, not wrong harmony.

sadeghi-babayebaroon (x6.2, sheet Bm shape):
  SHEET : C Bm C Am C Bm C Am Bm Am C D Bm Am C D Bm C Am C D
  ENGINE: Cm Fm Eb C# C Fm Eb C# Bbm Cm Fm Eb C# C Fm Eb C# Bbm Cm C# Cm C#
          Bbm Eb/C# Cm C# Bbm C# Cm Eb C# Bbm Cm Eb C# Bbm Cm Eb Fm Bbm
  Read: worst row. Engine lives in Cm/Fm/Eb and keeps writing C# passing
  chords; sheet is a 4-chord C/Bm/Am loop. Key frame + thin sheet + dense
  changes all at once.

sirvan-oonrooza (x1.1, sheet Am shape):
  SHEET : Em Dm Em Am Em Dm Em Am G F G C G F G C G Bm Em Bm Am Bm C Em
  ENGINE: Gm F Gm7 Dm/F Gm F Eb Dm/F Gm Dm Gm Dm Eb Dm Gm7 Dm7 Eb Dm7 Gm7 Dm7
          Gm Dm F Ebmaj7 Dm7 Eb Dm F Gm7 Dm7 Gm Dm7 Eb Dm7 Gm7 Dm7 F Ebmaj7
  Read: un-stuck (was 12 chords in v7.1, now 45 vs 41) and the loop shape
  matches; the whole thing sits +3 semitones vs the sheet (sheet Em/Am shape
  vs engine Gm/Dm) -> capo/key-frame, not structure.

talischi-raazim (x3.05, sheet Dm):
  SHEET : Dm Bb Am Dm Bb C Am Gm Bb C Dm C Bb Gm Bb Am Dm Am Bb C
  ENGINE: Dm7 C Bbmaj7 Am F C Bbmaj7 Am7 Dm7 C7 Bbmaj7 Am7 Gm7 Bbmaj7 Am7 Dm7
          Am7 C Gm7 Am7 Dm7 Am7 C Gm7 Am7 Dm7 Bbmaj7 Am7 Dm7 Bbmaj7 Am7 Gm7 Dm7
          Am7 Gm7 Am Bbmaj7 Am Gm7 Am
  Read: same Dm-Bb-Am-C loop with 7ths/maj7s and extra mid-bar turns.
