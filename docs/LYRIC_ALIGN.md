# Lyrics, chords and music out of sync (lyric_align.py) - do this BEFORE docs/SHEET_QA.md

## Next run (Brain, 17 Nov, after Z's local cf88194)
Z's SHEET_QA run (cf88194, not pushed: expired token) ran harmonize on the
hand-typed lyric times. Two of its results show why the alignment comes
first: bazi «عیبی نداره چشمتو وا کن» (outro) and «حیفه بخوایم» (verse 2)
were skipped as "does not fit before the next line" - the typed times make
those lines shorter than they are sung. And taghas «بگو واسه کی میمیری»
lost the E of the laminor sheet. sheet_sync v7.5 now never drops a chord of
the human sheet and ignores instrumental lines («بداهه‌ی گیتار») as repeats.
1. New token first (the owner gives it to Z directly, never in a chat or a
   repo): fine-grained, only pvwvuow/guitarking, Contents read+write.
2. `git fetch origin`; keep scripts/ from cf88194 (engine-all.py,
   export-sheets.ts, merge-songs.py, gh-pages-publish.sh) but take
   src/lib/songs.ts from origin/main (the pre-harmonize sheets): one commit
   with the scripts only, rebased on origin/main.
3. Then the steps below for all 4 songs: align -> plain sync -> --harmonize
   (v7.5) -> songs.ts -> tsc + build:pages -> push main, then gh-pages.
4. The stash on /home/z/my-project (stash@{0}) is not ours: leave it.
5. Your env could not fully decode the mp3s: the site plays those mp3s, so
   decode them with ffmpeg (`ffmpeg -i x.mp3 -ar 44100 x.wav`), compare
   the wav length with the mp3's own duration (ffprobe) and report both;
   a decoder that drops frames shifts every time after the drop.

The owner (17 Nov): «تقاص» and the other songs: chords, lyrics and music
are not together.

Root cause (Brain): the lyric times `t` of the bot songs were typed by
hand, not measured. taghas: 30, 37, 47, 51, 54, 57.5, 60 ... (round
numbers); bazi line 1 sat at 41.1 while it is sung at ~34.3. sheet_sync
puts each chord on the beat NEAR its lyric time (window 0.75 bar), so a
wrong `t` drags the chord with it and the karaoke highlight runs early or
late. The engine beat grid itself looks fine.

Fix: python/lyric_align.py aligns the sheet's own words to the audio
(torchaudio MMS_FA forced alignment, Persian romanized by uroman or the
built-in map) and writes `t` + per-word `w` for every segment with words.
A line the aligner is not sure about keeps its old time (reported as
`kept`).

## Steps for Z (taghas first, then bazi, sad-gozashtam, koo)
0. Same audio check: sha256 of the file the site plays (`audio:` in
   songs.ts) must equal the file the engine analysis came from; its
   length must be >= the last beat. If not, re-run the engine on the served
   file first (a different rip shifts everything).
1. `pip install torch torchaudio` (CPU is fine, torchaudio >= 2.1),
   optional `pip install uroman demucs`. With demucs:
   `python3 -m demucs --two-stems=vocals -o /tmp/sep audio.mp3`
   (the vocals stem aligns much better than the full mix).
2. Export the song's sections from songs.ts to sheet.json (keep every
   field: chord, text, t, ct, auto, w; add "key").
3. `python3 python/lyric_align.py audio.mp3 sheet.json --vocals vocals.wav > aligned.json`
4. Re-snap the chords to the new lyric times (plain sync, no flags):
   `python3 python/sheet_sync.py audio.mp3 aligned.json --analysis a.json > synced.json`
5. Then docs/SHEET_QA.md on synced.json:
   `python3 python/sheet_sync.py audio.mp3 synced.json --analysis a.json --harmonize > final.json`
6. Copy `sections` of final.json into songs.ts (chords are never changed
   by steps 3-4; only t, w, ct). `bun run build:pages`, update gh-pages.
7. Report per song: the `align:` line (aligned / kept / median_move_s /
   moved_over_1s / moved_over_3s / romanizer / audio_sha256), the `qa:`
   line, 5 example lines with old t -> new t, and every `kept` line.
   If more than a third of the lines are `kept`, stop and report: do not
   publish half-aligned songs.
