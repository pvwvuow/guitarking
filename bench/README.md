# Engine benchmark vs independent ground truth

Per docs/BENCHMARK.md. Committed: manifest.json (30 songs: 28 chord-order
refs from akord.ir sheets + 5 ear-annotated .lab files), lab/*.lab,
results-v7.json. Audio (bench/audio/) and analysis cache stay local by
design (copyright, .gitignore'd).

Sources: akord.ir human chord sheets (37 collected, 31 with audio after
whisper identity screening; 6 removed: 2 duplicate-audio SC results,
1 ambiguous, 1 live/remix arrangement, 2 without audio).
Timed refs: «صد گذاشتم», «کو بهشتمون», اخماتو وا کن, دلواپسی — annotated
from raw audio evidence (bass-band chroma on a beat grid), never from the
engine output.

Finding: 6 long files (284-419 s) OOM-kill the deep engine in a 4 GB
sandbox (exit 137, empty output on retry) — recorded as error rows, not
silently dropped.
