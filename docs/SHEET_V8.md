# One-beat chords, chords on the right word, repeats written once (Brain, 21 Nov)

The owner (21 Nov): "a repeated chorus or verse with the same chords must
not be written twice; the live text/music effects should be better; the
bot must hear better; many ONE-BEAT chords are missed; when the chord
changes on a word, put it exactly on that word".

## What changed (this commit)
Engine v7.4 (python/chordnet/engine.py, python/chord_detect.py)
- Root cause of the missed one-beat chords: three layers deleted them -
  the metrical decode (a change off the bar line costs log 0.005),
  merge_short (< 4 beats) and finally chord_detect.fold_short (1.1 beats
  with a 0.8 s floor: it removed EVERY one-beat chord, and above 150 BPM
  even two-beat ones).
- rescue_short(): after the decode a 1-2 beat run becomes the chord the
  network clearly hears there (beat log-prob +GK_RESCUE_GAIN over the
  decoded chord and BOTH half beats agree, a different chord family, the
  bass moves, in key or used >= 4 beats elsewhere, at most 8 % of beats).
- min_segment(): the deep path keeps chords of >= 0.7 beat.
- `GK_RESCUE=0` gives back v7.3 exactly. The analysis JSON has "rescued".

sheet_sync v7.7 (python/sheet_sync.py)
- word_at(): one rule for which word a chord change belongs on (the word
  starting on the change or up to half a beat after it, else the word
  still being sung, else the next word). --fill used to take the first
  word starting after the change, so a change under a held word landed
  one word late.
- --place: every sheet chord whose change the engine hears at `ct` moves
  onto the word sung at `ct` (only lines with measured `w`); a pickup of
  about a beat before the line's first change becomes a `carry` piece
  (previous chord, drawn without a label).
- --refill: undo old auto/carry pieces, re-sync, fill again with the
  current engine (bazi «بند دوم» line 1 has stale auto pieces out of
  order: Em7 at 101.3 s after words at 107 s - this removes them).
- --min-beats default 1; --check adds `out_of_order` and `off_word`.

Site (src/lib/sheet-fold.ts, song-sheet.tsx, player-card.tsx, sheet-image.ts)
- Repeats written once: a section equal to the one before gets "×2"; a
  later repeat is one card «↻ تکرار «همخوان»» (chords + first words,
  ×N); a partial repeat (bazi «پایان» = 3 lines of «بند دوم») too. While
  a folded repeat plays, the drawn original lights word by word and the
  badge says «دور ۲ از ۲». Toggle «نمایش کامل» unfolds. The A4 image
  folds the same way and no longer draws a chord over in-line repeats.
- Effects: the word being sung fills right-to-left, the words already
  sung in the line stay red, the active row has a soft band, the current
  chord pops, the NEXT chord shows a filling bar during the last 2 beats,
  auto-follow pauses while the user scrolls (button «برگرد به خطی که
  پخش می‌شود»), and a sync control («دیرتر / زودتر», saved in the
  browser) fixes wireless-headphone latency.

## Steps for Z
0. `git pull` (this commit). Push with a temporary token URL as before;
   also clean the remote: `git remote set-url origin
   https://github.com/pvwvuow/guitarking.git` (no token in .git/config).
1. Bench the engine (the 28 trusted refs of rounds 1-3). Keep
   GK_CACHE_DIR set (network probs cached = fast) but give EVERY run its
   own `--cache` dir: bench.py caches analysis JSON per file name.
   a. `GK_RESCUE=0 python3 python/bench.py <manifest> --cache /tmp/b0 --json /tmp/b0.json`
      (must reproduce the v7.3 numbers, ~0.416);
   b. defaults: `python3 python/bench.py <manifest> --cache /tmp/b1 --json /tmp/b1.json`;
   c. `GK_RESCUE_GAIN=2`, `=4.5`, `=6` (each its own cache dir).
   Report summary_clean (root, majmin, change_f, seq_root, seq_majmin,
   change_ratio, seq_change_ratio) per run and the mean "rescued" per song.
   Pick: the lowest gain whose seq_root AND root drop <= 0.005 vs (a) and
   whose seq_change_ratio stays <= (a) + 0.15. None passes -> GK_RESCUE=0
   for the songs and report. Do NOT edit the engine defaults: report and
   I set them.
2. Optional, if the machine has the time (stronger detection): demucs
   `--two-stems=vocals --filename "{track}.{stem}.{ext}"` on the bench
   songs, a manifest copy whose audio points at the `.no_vocals.wav`
   files, bench it with the setting from step 1. Report the same numbers.
   Stems win only if root AND seq_root rise >= 0.01; then step 3 analyses
   the no_vocals stem of each song (same length as the mix: check).
3. Songs taghas, bazi, sad-gozashtam (NOT koo: it waits for the owner).
   a. engine on the served audio (or its stem, step 2) with the chosen
      env -> a.json. Report engine, tempo, rescued, number of segments.
   b. export the song's sections to sheet.json (every field: chord, text,
      t, ct, w, auto, carry; add "key").
   c. `python3 python/sheet_sync.py audio sheet.json --analysis a.json --refill --place --harmonize --check > final.json`
   d. Checks: `out_of_order` must be 0; list every `placed` (chord, from
      -> to), every `added` that lasts ONE beat (time, chord, word) and
      every `off_word`. Stop and report without publishing when placed >
      40 % of the chord changes or added > 2x the song's old auto count.
   e. songs.ts: copy `sections` AND `beats` / `downbeats` / `bpb` of
      final.json (a new engine run can move the grid).
4. `bun x tsc --noEmit`, push main, then publish ONLY through
   `/home/z/my-project/scripts/gh-pages-publish.sh` (absolute path: it
   moves src/app/api aside for the static export; a direct
   `build:pages` fails on /api, and the old copy inside the repo does
   not read the token from the env). .nojekyll must stay.
5. Screenshots (live site, viewport only): taghas on a phone while the
   2nd chorus plays (1:35 - the first chorus lit, «دور ۲ از ۲») and the
   repeat card further down; bazi desktop with the «پایان» card.
6. Report: the bench table, per song the qa line, placed / one-beat
   added lists and 5 lines before -> after.

## Round 2 (v7.8, after Z's run of 21 Nov, main 3ec9205)
Z's run: taghas placed 0 / off_word 11, bazi placed 17 / off_word 9, the
same pattern in both ("the chord sits one word off"); sad-gozashtam
stopped by the rule (added 6 > 2 x 0 old auto). Bench not possible: the
28 reference audios were lost in the rollback (decision: engine defaults
stay GK_RESCUE_GAIN=3.0 etc.; only bazi triggers rescue, 4 chords).

Causes found and fixed in python/sheet_sync.py v7.8:
- --harmonize copied the SOURCE line's word splits onto every other
  occurrence; with each occurrence keeping its own word times, the chord
  landed on the source singer's word -> off_word. Now every re-patterned
  line is re-split with word_at() on its own times.
- word_at() preferred a still-held word even when it started 1.4 s
  before the change and the next word came 0.3 s after it. Now the word
  whose start is NEAREST the change wins (next word within a beat after,
  or the held word if it started within a beat before; tie: next word);
  a long held note keeps the fallback. The first word of the piece
  before is never taken (v7.7 could leave that chord with no word).
- --fill / --place skip instrumental placeholder lines (sad: Fm was
  moved inside «سولوی گیتار»).
- --check off_word uses the same rule and only judges chords the engine
  confirms at their ct.
- Note: `mismatch` / `inside` are counted by the re-sync BEFORE the fill
  (after --refill the sheet has one chord per line again), so they are
  expected to be high; judge by the qa line.

Steps for Z (round 2)
1. `git pull`. No new engine run: reuse the a.json of round 1 for all
   three songs (same engine, same env).
2. For taghas and bazi: start again from the sheet in songs.ts at
   3ec9205 (--refill undoes round 1), for sad-gozashtam from the sheet
   at 3ec9205 too: `python3 python/sheet_sync.py audio sheet.json
   --analysis a.json --refill --place --harmonize --check > final.json`.
3. Stop rules (replace the old ones): out_of_order must be 0; off_word
   must be <= 2 per song; stop when placed > 40 % of the chord changes or
   added > max(2 x old auto, 25 % of the chord changes). sad-gozashtam is
   approved under these rules (owner/Brain: its 6 adds are in key).
4. List per song: the qa line, every placed (chord, from -> to), every
   one-beat add, every remaining off_word, and 5 lines before -> after.
5. songs.ts (sections + beats/downbeats/bpb), `bun x tsc --noEmit`, push
   main, publish ONLY via /home/z/my-project/scripts/gh-pages-publish.sh.
6. Screenshots (viewport): taghas 2nd chorus (1:35) and bazi at 2:14
   («تو هم», the one-beat F) on a phone; sad-gozashtam chorus on desktop.
