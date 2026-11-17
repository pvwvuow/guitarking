#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Run the v7.4 engine on all four bot songs, one at a time (memory guard),
saving each analysis as the cached --analysis file for sheet_sync QA."""
import json
import sys

sys.path.insert(0, "/home/z/my-project/guitarking-repo/python")
import chord_detect as cd  # noqa: E402

JOBS = [
    ("bazi", "/home/z/my-project/work/audio/bazi.wav"),
    ("sad-gozashtam", "/home/z/my-project/work/audio/sad-gozashtam.wav"),
    ("koo-beheshtemoon", "/home/z/my-project/work/audio/koo-beheshtemoon.wav"),
]

import os
import time

for slug, path in JOBS:
    out = f"/home/z/my-project/work/{slug}-engine.json"
    for attempt in (1, 2):
        try:
            r = cd.analyze(path)
            json.dump(r, open(out, "w", encoding="utf-8"), ensure_ascii=False)
            print(f"{slug}: OK engine={r.get('engine')} tempo={r.get('tempo')} "
                  f"bpb={r.get('bpb')} segs={len(r.get('segments', []))} "
                  f"key={r.get('key', {}).get('tonic')}{r.get('key', {}).get('mode')} "
                  f"(attempt {attempt})", flush=True)
            break
        except BaseException as e:  # fail() raises SystemExit
            print(f"{slug}: FAIL {type(e).__name__}: {e} (attempt {attempt})",
                  flush=True)
            if attempt == 1:
                time.sleep(5)
print("ALL DONE", flush=True)
