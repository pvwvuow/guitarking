# Sheet QA after the fill pass (sheet_sync v7.4: --check / --harmonize)

Brain's review of 1506b4a (bazi + taghas after --fill) found two data
problems and three player bugs.

Data:
1. The same lyric line plays a DIFFERENT chord pattern in its repeats.
   bazi «عیبی نداره چشمتو وا کن...»: verse 2 holds G for ~7 beats
   (110.155 -> F 113.847), the outro only 1 beat (197.045 -> F 197.579).
   «بازی نکن با قلب...»: Em lasts 1 beat in verse 2, 3 beats in the outro.
   A chorus or a repeated line is played the same way by the band, so one
   of the two is wrong.
2. The same chord is written twice in a row inside a line (F «از هم» ->
   F «جدا باشیم» one beat later; about 15 places in bazi). Not wrong (the
   PDF repeats the chord per bar), but it read as a new change.
   The player now folds these (fixed in the UI, no data change needed).

Player (fixed in this commit, src/components/gk/song-sheet.tsx):
- an in-line repeated chord has no label and is not a chord change;
- engine-added chords (`auto: true`) get a dotted underline + a tooltip,
  and the note under the sheet explains it;
- the analysis card: «اطمینان» showed «0.67٪» (now 67٪), the «مدت» chip
  is hidden when there is no duration, long section labels (اینترو، بند
  اول) no longer overflow their 24 px box.

## Steps for Z
1. For bazi and taghas: export the current sections of songs.ts to a sheet
   json (with t, ct, auto) and run, with the cached engine analysis:
   `python3 python/sheet_sync.py audio.mp3 sheet.json --analysis a.json --harmonize > out.json`
   The ct are kept (no re-sync) because every segment already has one.
   The report lists `harmonized` (applied: the occurrence the engine agrees
   with most became the pattern, beat-exact) and `harmonize_skipped` (with
   the reason), then the --check rows.
2. Copy `sections` from out.json back into songs.ts for that song.
3. Run `--check` (no --harmonize) on sad-gozashtam and koo too and paste
   the counts; do not change those two.
4. `bun run build:pages` must pass the type check (song-sheet.tsx changed),
   then update gh-pages as before.
5. Report per song: the `qa:` line from stderr, every `harmonized` /
   `harmonize_skipped` row (old -> new pattern), and the remaining
   `too_short` / `far_from_lyric` / `tiny_split` rows.
