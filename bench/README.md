# Engine benchmark — round 2 (v7.1) status

Per docs/BENCH_ROUND2.md. Audio stays local (gitignored); refs, labs and
results are committed.

## Ref fixes (the round-2 core task)
Round-1 extractions kept only the FIRST chord of each line — root cause
was my builder's "single letters are junk" filter, which dropped real
bare chords (D, C, B, F, G...). All 9 suspect refs were re-dumped from
akord.ir with the full sheet text and rebuilt with EVERY chord in reading
order (repeats included), e.g. yeganeh-behetgholmidam is now the real
Em D C B loop (32 tokens) instead of 8x Em. bench/manifest.json was
rebuilt from the committed sheets with the filter removed. Offline
ref_problems check + bench --only: suspect is now [] for all 9.
Flagged remaining: the 5 proxy labs only (by design).

## results-v71.json (no result cache, v7.1 defaults)
30 songs, 0 errors (koo-beheshtemoon needed a re-run: its audio file was
missing from bench/audio; restored from public/demo and merged).
summary_clean (28 trusted): root .5784 majmin .5054 change_f .5623
seq_root .4153 seq_majmin .3887 change_ratio 1.129 seq_change_ratio 1.6485
(vs round-1 seq_majmin .294 on broken refs).

## Tempos chosen by v7.1
- sad-gozashtam: 95.7 (4/4) — competition rejected librosa's 123.0;
  matches the round-1 ear-proxy ladder 47/94/188.
- koo-beheshtemoon: 112.3 (4/4), consistent with songs.ts tempo 112.
- Still fast: chavoshi-sange 136, farzad-atish/khoda 129.2, hamayoon-
  alborz/akharinrooz 136, masih-aroom 152, soltangholbha 152(3), baron
  129.2(3), biamanoboobin 129.2, zand-royaye 161.5(6) — all with x0.5
  candidates (64-80) in the list but not picked. Watch seq_change_ratio.

## Sweep — INCOMPLETE (5/19)
bench/sweep-v71-partial.log holds the 5 finished combos; the run was cut
by the sandbox session end (~4.4 min/combo after a 673s cold first combo;
net-prob cache was cold). Baseline 0.3909; best so far combo 2
(GK_EM_TEMP=0.5, default CP4, GK_KEY_PENALTY=0.3) 0.3933. The remaining
14 combos need a re-run on a follow-up session.
