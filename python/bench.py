#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — engine benchmark against INDEPENDENT ground truth
==============================================================
Never benchmark against our own sheets (src/lib/songs.ts): they were edited
until they agreed with the engine, so "98% agreement" with them proves
nothing. References must come from outside the engine:

  timed reference   {"audio": "x.mp3", "lab": "x.lab"}
      .lab = one "start end chord" per line (seconds; chord like Am, F#m7,
      C/E, N or Harte A:min) — e.g. a human-annotated song;
  sequence reference {"audio": "x.mp3", "sequence": "Em D C B Em D C B"}
      chord ORDER from a human sheet (laminor.org / akord.ir), any key —
      cheap to collect for hundreds of Persian songs.

Metrics
  timed:    root / maj-min accuracy (duration weighted, 10 ms grid) and
            change-point F-measure (est change within 0.5 s of a ref change)
  sequence: best transposition + similarity of the collapsed chord orders
            (1 - edit distance / length), root and maj-min level

Usage:
  python3 python/bench.py manifest.json [--cache DIR] [--json out.json]
"""
import json
import os
import sys

import numpy as np

import chord_detect as cd

HARTE = {"maj": "", "min": "m", "7": "7", "min7": "m7", "maj7": "maj7",
         "dim": "dim", "aug": "aug", "sus4": "sus4", "sus2": "sus2",
         "hdim7": "m7b5", "dim7": "dim", "9": "7", "min9": "m7"}


def to_label(raw):
    """'A:min/b3' / 'Am' / 'N' / 'X' -> 'Am' style label."""
    raw = (raw or "").strip()
    if raw in ("", "N", "X", "-"):
        return "N"
    if ":" in raw:
        root, qual = raw.split(":", 1)
        return root + HARTE.get(qual.split("/")[0].split("(")[0], "")
    return raw


def reduce(label, level):
    """level 'root' -> pitch class; 'majmin' -> (pc, minor?); N -> None."""
    lab = to_label(label).split("/")[0]
    if lab == "N":
        return None
    pc, suf = cd.chord_parse(lab)
    if pc is None:
        return None
    if level == "root":
        return pc
    minor = suf.startswith("m") and not suf.startswith("maj")
    return (pc, minor)


def read_lab(path):
    segs = []
    with open(path, encoding="utf-8") as f:
        for ln in f:
            p = ln.split()
            if len(p) >= 3:
                segs.append({"start": float(p[0]), "end": float(p[1]),
                             "chord": to_label(" ".join(p[2:]))})
    return segs


def label_at(segs, times):
    out = []
    j = 0
    for t in times:
        while j < len(segs) - 1 and segs[j]["end"] <= t:
            j += 1
        s = segs[j] if segs else None
        out.append(s["chord"] if s and s["start"] <= t < s["end"] else "N")
    return out


def timed_scores(ref, est, dur):
    t = np.arange(0.0, dur, 0.01)
    r, e = label_at(ref, t), label_at(est, t)
    res = {}
    for level in ("root", "majmin"):
        ok = tot = 0
        for a, b in zip(r, e):
            ra, eb = reduce(a, level), reduce(b, level)
            if ra is None and eb is None:
                ok += 1
            elif ra is not None and ra == eb:
                ok += 1
            tot += 1
        res[level] = round(ok / max(tot, 1), 4)
    rc = [s["start"] for s in ref[1:]]
    ec = [s["start"] for s in est[1:]]
    hit_r = sum(1 for a in rc if any(abs(a - b) <= 0.5 for b in ec))
    hit_e = sum(1 for b in ec if any(abs(a - b) <= 0.5 for a in rc))
    p = hit_e / max(len(ec), 1)
    rcl = hit_r / max(len(rc), 1)
    res["change_f"] = round(2 * p * rcl / max(p + rcl, 1e-9), 4)
    errs = [min(abs(a - b) for b in ec) for a in rc if ec]
    errs = [x for x in errs if x <= 0.5]
    res["change_err_ms"] = round(1000 * float(np.mean(errs)), 1) if errs else None
    return res


def collapse(seq):
    out = []
    for x in seq:
        if x is None:
            continue
        if not out or out[-1] != x:
            out.append(x)
    return out


def lev(a, b):
    d = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(b) + 1):
            cur = d[j]
            d[j] = min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] != b[j - 1]))
            prev = cur
    return d[len(b)]


def shift(x, k, level):
    if level == "root":
        return (x + k) % 12
    return ((x[0] + k) % 12, x[1])


def sequence_scores(ref_seq, est):
    res = {}
    for level in ("root", "majmin"):
        r = collapse([reduce(c, level) for c in ref_seq.split()])
        e = collapse([reduce(s["chord"], level) for s in est])
        best = (-1.0, 0)
        for k in range(12):
            rk = collapse([shift(x, k, level) for x in r])
            sim = 1.0 - lev(rk, e) / max(len(rk), len(e), 1)
            if sim > best[0]:
                best = (sim, k)
        res[level] = round(best[0], 4)
        res[level + "_shift"] = best[1]
    res["ref_len"], res["est_len"] = len(collapse(
        [reduce(c, "root") for c in ref_seq.split()])), len(collapse(
            [reduce(s["chord"], "root") for s in est]))
    return res


def analyze_cached(audio, cache):
    if cache:
        os.makedirs(cache, exist_ok=True)
        p = os.path.join(cache, os.path.basename(audio) + ".json")
        if os.path.exists(p):
            with open(p, encoding="utf-8") as f:
                return json.load(f)
    res = cd.analyze(audio)
    if cache and res.get("ok"):
        with open(p, "w", encoding="utf-8") as f:
            json.dump(res, f, ensure_ascii=False)
    return res


def main():
    args = sys.argv[1:]
    if not args:
        print(__doc__)
        sys.exit(1)
    cache = args[args.index("--cache") + 1] if "--cache" in args else None
    out_path = args[args.index("--json") + 1] if "--json" in args else None
    base = os.path.dirname(os.path.abspath(args[0]))
    with open(args[0], encoding="utf-8") as f:
        items = json.load(f)
    rows = []
    for it in items:
        audio = os.path.join(base, it["audio"])
        res = analyze_cached(audio, cache)
        if not res.get("ok"):
            rows.append({"audio": it["audio"], "error": res.get("error")})
            continue
        row = {"audio": it["audio"], "engine": res.get("engine"),
               "tempo": res.get("tempo"), "bpb": res.get("bpb")}
        if "lab" in it:
            row.update(timed_scores(read_lab(os.path.join(base, it["lab"])),
                                    res["segments"], res["duration"]))
        if "sequence" in it:
            row.update({"seq_" + k: v for k, v in
                        sequence_scores(it["sequence"], res["segments"]).items()})
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), file=sys.stderr)
    keys = ["root", "majmin", "change_f", "seq_root", "seq_majmin"]
    summary = {k: round(float(np.mean([r[k] for r in rows if k in r])), 4)
               for k in keys if any(k in r for r in rows)}
    summary["songs"] = len(rows)
    out = {"summary": summary, "songs": rows}
    print(json.dumps(out, ensure_ascii=False, indent=1))
    if out_path:
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(out, f, ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
