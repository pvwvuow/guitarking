#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — decode-knob sweep against the benchmark
====================================================
The expensive part of the engine (CQT + 5 ChordNets) does not depend on
the decode knobs, so its probabilities are cached per song
(GK_CACHE_DIR, default ~/.cache/guitarking/probs) and every knob combo
only re-runs beat tracking + the metrical decode.

Only TRUSTED references are scored by default: rows that bench.py flags
as suspect (broken sheet extraction, algorithmic labs) are skipped;
--all-refs scores them too.

Usage:
  python3 python/sweep.py bench/manifest.json \\
      --grid "GK_EM_TEMP=0.5,0.6,0.7;GK_CP4=0.30/0.008/0.05/0.008,0.25/0.005/0.03/0.005" \\
      [--only name1,name2] [--all-refs] [--json bench/sweep.json]

Grid syntax: knobs separated by ";", values by ","; list-valued knobs
(GK_CP4 / GK_CP3 / GK_CP6 / GK_METER_PRIOR) use "/" inside one value.
Every knob: see python/meter.py and python/chordnet/engine.py docstrings.

Score per song = mean of its available metrics among seq_majmin, majmin,
change_f; combo score = mean over songs. Also printed: the median ratio
of engine chord changes to reference changes (1.0 = same density).
"""
import itertools
import json
import os
import sys
import time

import numpy as np

os.environ.setdefault("GK_CACHE_DIR",
                      os.path.expanduser("~/.cache/guitarking/probs"))

import bench  # noqa: E402
import chord_detect as cd  # noqa: E402

METRICS = ("seq_majmin", "majmin", "change_f")


def parse_grid(spec):
    keys, values = [], []
    for part in (spec or "").split(";"):
        if "=" not in part:
            continue
        k, v = part.split("=", 1)
        k = k.strip()
        if not k.startswith("GK_"):
            k = "GK_" + k
        keys.append(k)
        values.append([x.strip() for x in v.split(",") if x.strip()])
    return keys, values


def score_song(it, base):
    audio = os.path.join(base, it["audio"])
    try:
        res = cd.analyze(audio)
    except SystemExit:
        return {"audio": it["audio"], "error": "engine exited"}
    except Exception as e:  # noqa: BLE001
        return {"audio": it["audio"], "error": "%s: %s" % (type(e).__name__, e)}
    if not res.get("ok"):
        return {"audio": it["audio"], "error": res.get("error")}
    row = {"audio": it["audio"], "tempo": res.get("tempo"),
           "bpb": res.get("bpb")}
    if "lab" in it:
        ref = bench.read_lab(os.path.join(base, it["lab"]))
        row.update(bench.timed_scores(ref, res["segments"], res["duration"]))
        row["change_ratio"] = round(bench.change_count(res["segments"])
                                    / max(bench.change_count(ref), 1), 3)
    if "sequence" in it:
        sq = bench.sequence_scores(it["sequence"], res["segments"])
        row.update({"seq_" + k: v for k, v in sq.items()})
        row["change_ratio"] = round(max(sq["est_len"] - 1, 0)
                                    / max(sq["ref_len"] - 1, 1), 3)
    vals = [row[m] for m in METRICS if m in row]
    row["score"] = round(float(np.mean(vals)), 4) if vals else None
    return row


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    base = os.path.dirname(os.path.abspath(args[0]))
    with open(args[0], encoding="utf-8") as f:
        items = json.load(f)
    only = set(args[args.index("--only") + 1].split(",")) \
        if "--only" in args else None
    out_path = args[args.index("--json") + 1] if "--json" in args else None
    keys, values = parse_grid(args[args.index("--grid") + 1]
                              if "--grid" in args else "")
    if only:
        items = [it for it in items
                 if os.path.splitext(os.path.basename(it["audio"]))[0] in only]
    if "--all-refs" not in args:
        skipped = [it["audio"] for it in items if bench.ref_problems(it)]
        items = [it for it in items if not bench.ref_problems(it)]
        if skipped:
            print("skipping %d suspect refs: %s" % (len(skipped),
                                                    ", ".join(skipped)),
                  file=sys.stderr)
    if not items:
        print("no trusted references left to score", file=sys.stderr)
        sys.exit(2)
    combos = [dict(zip(keys, c)) for c in itertools.product(*values)] \
        if keys else [{}]
    if {} not in combos:
        combos.insert(0, {})      # defaults first: also fills the cache
    results = []
    for ci, combo in enumerate(combos):
        for k in keys:
            os.environ.pop(k, None)
        os.environ.update(combo)
        t0 = time.time()
        rows = [score_song(it, base) for it in items]
        ok = [r for r in rows if r.get("score") is not None]
        res = {"combo": combo or "defaults",
               "score": round(float(np.mean([r["score"] for r in ok])), 4)
               if ok else None,
               "change_ratio_median": round(float(np.median(
                   [r["change_ratio"] for r in ok if "change_ratio" in r])), 3)
               if any("change_ratio" in r for r in ok) else None,
               "songs": len(ok), "errors": len(rows) - len(ok),
               "seconds": round(time.time() - t0, 1), "rows": rows}
        for m in METRICS:
            v = [r[m] for r in ok if m in r]
            if v:
                res[m] = round(float(np.mean(v)), 4)
        results.append(res)
        print("[%d/%d] score=%s changes x%s %s (%.0fs)" % (
            ci + 1, len(combos), res["score"], res["change_ratio_median"],
            json.dumps(combo), res["seconds"]), file=sys.stderr)
    for k in keys:
        os.environ.pop(k, None)
    ranked = sorted(results, key=lambda r: -(r["score"] or -1))
    print("\nrank  score   seq_mm  majmin  chg_f  chg_x  combo")
    for i, r in enumerate(ranked):
        print("%4d  %.4f  %6s  %6s  %5s  %5s  %s" % (
            i + 1, r["score"] or 0, r.get("seq_majmin", "-"),
            r.get("majmin", "-"), r.get("change_f", "-"),
            r["change_ratio_median"], json.dumps(r["combo"])))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump({"ranked": ranked}, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
