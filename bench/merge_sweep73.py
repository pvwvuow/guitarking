#!/usr/bin/env python3
"""Merge N sweep JSON files (round 4 halves) into bench/sweep-v73.json and
print the combined ranked table with change ratios.
Usage: python3 merge_sweep73.py [file1.json file2.json ...]
Default files: bench/sweep-v73.json bench/sweep-v73-1.json bench/sweep-v73-99.json
"""
import json
import sys

DEFAULTS = ["bench/sweep-v73.json", "bench/sweep-v73-1.json",
            "bench/sweep-v73-99.json"]
files = sys.argv[1:] or DEFAULTS
out = None
seen = set()
for f in files:
    try:
        d = json.load(open(f))
    except FileNotFoundError:
        print(f"skip missing {f}")
        continue
    if out is None:
        out = d
        seen = {json.dumps(r["combo"], sort_keys=True)
                for r in out.get("ranked", [])}
        continue
    for r in d.get("ranked", []):
        k = json.dumps(r["combo"], sort_keys=True)
        if k not in seen:
            out["ranked"].append(r)
            seen.add(k)
if out is None:
    sys.exit("no sweep files found")
out["ranked"].sort(key=lambda r: -r["score"])
json.dump(out, open("bench/sweep-v73.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=1)
print("combined ranked:")
for r in out["ranked"]:
    knobs = r["combo"] or "defaults (KEEP_GAIN=1, REPEAT_W=0.5)"
    print(f"  {r['score']:.4f}  x{r['change_ratio_median']:<6} {knobs}")
