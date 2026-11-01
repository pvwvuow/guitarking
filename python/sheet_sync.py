#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — sheet sync (v7)
============================
Puts the chords of a hand-written / lyric-aligned sheet ON THE BEAT.

A sheet segment's `t` is when its LYRIC starts (singers push or delay a
syllable), which is rarely the moment the band changes chord. This tool
runs the engine on the song and adds to every timed segment:

  ct  — the exact beat where that chord really starts (engine change
        point near t if the engine hears the same chord, else the
        nearest bar line, else the nearest beat);

and prints a review report:
  * "mismatch": the engine hears a different chord under that segment;
  * "inside":   the engine hears a chord change INSIDE a sheet line that
                the sheet does not show (with the time + rough word).

It also emits the song's beat grid (beats / downbeats / bpb) so the
player can pulse with the beat.

Usage:
  python3 python/sheet_sync.py song.mp3 sheet.json [--analysis a.json] > out.json

sheet.json: {"sections": [{"label": "...", "lines": [[{"chord", "text", "t"}]]}]}
            (same shape as SongEntry.sections in src/lib/songs.ts)
"""
import json
import sys

import numpy as np

import chord_detect as cd


def same_chord(a, b, strict=False):
    """Enharmonic-aware chord comparison ('Bbm' == 'A#m');
    non-strict: Cm7 ~ Cm, G7 ~ G, slash bass ignored."""
    if a == b:
        return True
    if not a or not b or "N" in (a, b):
        return False
    a0, b0 = a.split("/")[0], b.split("/")[0]
    pa, sa = cd.chord_parse(a0)
    pb, sb = cd.chord_parse(b0)
    if pa is None or pb is None or pa != pb:
        return False
    if strict:
        return sa == sb
    minor = lambda s: s.startswith("m") and not s.startswith("maj")
    return minor(sa) == minor(sb)


def chord_at(segments, t):
    for s in segments:
        if s["start"] <= t < s["end"]:
            return s["chord"]
    return segments[-1]["chord"] if segments else "N"


def dominant(segments, a, b):
    acc = {}
    for s in segments:
        ov = min(b, s["end"]) - max(a, s["start"])
        if ov > 0:
            acc[s["chord"]] = acc.get(s["chord"], 0.0) + ov
    if not acc:
        return "N", 0.0
    c = max(acc, key=acc.get)
    return c, acc[c] / max(b - a, 1e-6)


def nearest(arr, t):
    if not len(arr):
        return None
    arr = np.asarray(arr, dtype=float)
    return float(arr[int(np.argmin(np.abs(arr - t)))])


def sync(sheet, res):
    beats = np.asarray(res["beats"], dtype=float)
    downs = np.asarray(res["downbeats"], dtype=float)
    segs = res["segments"]
    period = 60.0 / float(res["tempo"]) if res.get("tempo") else 0.5
    bar = period * int(res.get("bpb") or 4)
    win = 0.75 * bar
    starts = [(s["start"], s["chord"]) for s in segs]

    flat = []
    for sec in sheet["sections"]:
        for li, line in enumerate(sec["lines"]):
            for si, seg in enumerate(line):
                if isinstance(seg.get("t"), (int, float)):
                    flat.append((float(seg["t"]), seg, sec["label"], li, si))
    flat.sort(key=lambda x: x[0])

    report = []
    prev_chord, prev_ct = None, -1.0
    for i, (t, seg, label, li, si) in enumerate(flat):
        if prev_chord is not None and same_chord(prev_chord, seg["chord"], True):
            ct = nearest(beats, t)          # chord continues: just tidy
        else:
            cands = [a for a, c in starts
                     if abs(a - t) <= win and same_chord(c, seg["chord"])]
            if cands:
                ct = min(cands, key=lambda a: abs(a - t))
            else:
                d = nearest(downs, t)
                ct = d if d is not None and abs(d - t) <= win else nearest(beats, t)
        if ct is None:
            ct = t
        if ct <= prev_ct:
            later = beats[beats > prev_ct + 1e-6]
            ct = float(later[0]) if len(later) else t
        seg["ct"] = round(float(ct), 3)

        nxt = flat[i + 1][0] if i + 1 < len(flat) else float(res["duration"])
        dom, share = dominant(segs, ct, max(nxt, ct + period))
        if not same_chord(dom, seg["chord"]) and share >= 0.5:
            report.append({"type": "mismatch", "section": label, "line": li,
                           "seg": si, "t": seg["ct"], "sheet": seg["chord"],
                           "engine": dom, "share": round(share, 2),
                           "text": seg.get("text", "")})
        words = [w for w in str(seg.get("text", "")).split() if w]
        for a, c in starts:
            if ct + 2 * period - 1e-6 <= a < nxt - period and \
                    not same_chord(c, seg["chord"]) and c != "N":
                e = next((s["end"] for s in segs if abs(s["start"] - a) < 1e-6), a)
                if e - a < 2 * period - 1e-6:
                    continue
                frac = (a - t) / max(nxt - t, 1e-6)
                report.append({"type": "inside", "section": label, "line": li,
                               "seg": si, "t": round(a, 3), "chord": c,
                               "word": int(np.clip(round(frac * len(words)), 0,
                                                   max(len(words) - 1, 0))),
                               "text": seg.get("text", "")})
        prev_chord, prev_ct = seg["chord"], ct

    return {"bpb": res.get("bpb", 4), "tempo": res.get("tempo"),
            "beats": res["beats"], "downbeats": res["downbeats"],
            "sections": sheet["sections"], "report": report}


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    audio, sheet_path = args[0], args[1]
    with open(sheet_path, encoding="utf-8") as f:
        sheet = json.load(f)
    if "--analysis" in args:
        with open(args[args.index("--analysis") + 1], encoding="utf-8") as f:
            res = json.load(f)
    else:
        res = cd.analyze(audio)
    if not res.get("ok"):
        print(json.dumps(res, ensure_ascii=False))
        sys.exit(2)
    out = sync(sheet, res)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    n_mis = sum(1 for r in out["report"] if r["type"] == "mismatch")
    n_in = sum(1 for r in out["report"] if r["type"] == "inside")
    print(f"engine={res.get('engine')} tempo={res.get('tempo')} bpb={res.get('bpb')}"
          f" mismatches={n_mis} inside-line-changes={n_in}", file=sys.stderr)


if __name__ == "__main__":
    main()
