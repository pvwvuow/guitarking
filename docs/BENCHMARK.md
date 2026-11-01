# Engine benchmark: brief for the Z environment

Goal: measure the chord engine against ground truth that did NOT come from
the engine, so tuning is based on numbers instead of guesses.

## Hard rules

1. **Never** use `src/lib/songs.ts` or any engine output as a reference.
   Those sheets were edited to agree with the engine; comparing against
   them is circular (that is why "98%" meant nothing).
2. **Never** edit chords in `songs.ts` to make a report "0 mismatches".
   If the engine and a human sheet disagree, report it; do not resolve it
   by changing the sheet.
3. Audio files never go into the repo (copyright). Commit only manifests,
   `.lab` files and result JSON under `bench/`.
4. Word timings (`w`): do not inject whisper-small stamps again. They were
   broken on many lines (whole line on one stamp, 10 words in 0.2 s,
   2.7 s late). If you redo alignment, use a stronger aligner (e.g.
   whisper large-v3 + forced alignment on the demucs vocal stem) and keep
   a line's `w` only if it passes `cleanWordTimes()` in
   `src/lib/sheet-sync.ts`; otherwise leave `w` out.

## Step 1: sequence set (main signal, cheap)

Collect 20 to 30 Persian songs that have a verified human chord sheet
(laminor.org "تأیید لامینور" or akord.ir), plus the audio. Mix of styles:
fast/slow pop 4/4, 6/8 songs, acoustic, full band, at least 3 songs
with a capo / non-concert key on the sheet.

For each song add a manifest entry with the chords in the order the sheet
writes them, repeats included, any key (bench.py tries all 12 shifts):

```json
[
  {"audio": "audio/behet-ghol-midam.mp3",
   "sequence": "C#m B A G# C#m B A G# C#m B A G# ...",
   "source": "https://www.laminor.org/artists/محسن-یگانه/بهت-قول-میدم"}
]
```

Start with «بهت قول میدم» (محسن یگانه): the laminor sheet is the
C#m B A G# loop.

## Step 2: timed set (timing accuracy)

For 3 to 5 songs, write a `.lab` by ear while listening (one
`start end chord` per line, seconds). Include «صد گذاشتم» and
«کو بهشتمون». Mark chord changes where the band changes, not where
the singer starts the line. Do not start from the engine output.

```json
{"audio": "audio/koo-beheshtemoon.mp3", "lab": "lab/koo-beheshtemoon.lab"}
```

## Step 3: tempo / meter check for «صد گذاشتم»

The engine says 123 BPM, 4/4, but then every chord lasts ~10 beats and
the Fm-Cm-Bbm-Cm cycle is 44 beats (11 bars), which is almost never
real in pop. By ear (tap along): report the real BPM, the meter
(4/4, 6/8, 3/4) and how many bars each chord lasts.

## Step 4: run

```bash
python3 python/bench.py bench/manifest.json --cache bench/cache --json bench/results-v7.json
```

Commit `bench/manifest.json`, `bench/lab/*.lab`, `bench/results-v7.json`
(no audio, no cache).

## Report back (short)

- summary line: `seq_root`, `seq_majmin`, `root`, `majmin`, `change_f`
- the 5 worst songs: what went wrong (wrong key, relative major/minor
  swap, missed changes, extra changes, wrong tempo)
- the tempo/meter answer for «صد گذاشتم»
