# Filling in the chords inside each line (sheet_sync --fill)

Problem: web chord sheets usually write ONE chord at the start of each
lyric line, while the band changes chord every bar or two. «بازی»
(والایار) went live like that: lines of 10-20 s on a single chord
(e.g. «من پشت این پنجره...» Em for ~20 s), and the description says
"Am in verse 2" while no Am exists in the sheet. Rule from now on: a bot
song is not published while a line longer than 2 bars carries one chord
without a --fill pass.

## Steps for Z (bazi first, then taghas, then every new bot song)

1. Re-read the source sheet. If the site shows chords as an image or
   above the words, copy EVERY chord of a line in order (the bazi
   description mentions Am that the committed sheet lost). Put the song
   key in the sheet json as `"key": "Em"`.
2. `python3 python/sheet_sync.py audio.mp3 sheet.json --fill > out.json`
   (engine v7.3). The report at the end of out.json lists:
   * `key_frame`: `shift` != 0 means the sheet is written in a capo /
     transposed shape; engine chords were moved into the sheet's frame;
   * `added`: chords written into a line (`auto: true` on the segment,
     line split at the word sung on that beat);
   * `skipped`: chords the engine heard that do not fit the song (not in
     the sheet and not diatonic) - not inserted, list them;
   * `mismatch` / `inside`: as before.
3. Copy `sections` from out.json into songs.ts for that song (chords,
   text, t, ct, w, auto). Do not touch the original sheet chords.
4. Verify: bun/tsc type-check passes (`auto?: boolean` is declared in
   src/lib/sheet-sync.ts), then push and send the report counts
   (added / skipped / mismatch per song) plus 3-4 example lines before
   and after.
