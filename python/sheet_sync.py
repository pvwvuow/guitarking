#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — sheet sync (v7.3)
==============================
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

--fill (v7.3): most web sheets write ONE chord per lyric line, while the
band changes chord every bar or two. With --fill the chord changes the
engine hears inside a line are written INTO the sheet: the line is split
at the word sung on that beat and the new segment gets `auto: true`
(engine-added, so the player can show it differently). Guards:
  * the sheet's key frame is checked first: if the sheet is written in a
    capo / transposed shape, engine chords are transposed into the
    sheet's frame before they are inserted;
  * only chords that fit the song are inserted (used elsewhere in the
    sheet, or diatonic to its key); others are only reported;
  * an inserted chord must last >= --min-beats beats (default 2) and the
    sheet chord itself is never changed.

It also emits the song's beat grid (beats / downbeats / bpb) so the
player can pulse with the beat.

Usage:
  python3 python/sheet_sync.py song.mp3 sheet.json [--analysis a.json]
                               [--fill] [--min-beats 2] > out.json

sheet.json: {"sections": [{"label": "...", "lines": [[{"chord", "text", "t"}]]}]}
            (same shape as SongEntry.sections in src/lib/songs.ts)
"""
import json
import sys

import numpy as np

import chord_detect as cd

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
FLATS = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}
SEC_PER_CHAR = 0.16   # same fallback as src/lib/sheet-sync.ts


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


# ----------------------------------------------------------------------
# --fill: write the engine's in-line chord changes into the sheet
# ----------------------------------------------------------------------

def _root_minor(label):
    pc, suf = cd.chord_parse((label or "").split("/")[0])
    if pc is None:
        return None
    return pc, suf.startswith("m") and not suf.startswith("maj")


def transpose(label, k, flats=False):
    """'F#m7/C#' shifted by k semitones; spelling follows the sheet."""
    if not label or label == "N" or k % 12 == 0:
        return label

    def one(part):
        pc, suf = cd.chord_parse(part)
        if pc is None:
            return part
        root = NOTES[(pc + k) % 12]
        return (FLATS.get(root, root) if flats else root) + suf

    parts = label.split("/")
    out = one(parts[0])
    if len(parts) > 1:
        out += "/" + one(parts[1]).rstrip("m")
    return out


def sheet_flat(sheet):
    flat = []
    for sec in sheet["sections"]:
        for line in sec["lines"]:
            for seg in line:
                if isinstance(seg.get("ct", seg.get("t")), (int, float)):
                    flat.append(seg)
    flat.sort(key=lambda s: float(s.get("ct", s.get("t"))))
    return flat


def key_frame_shift(sheet, res):
    """Semitones k with engine == sheet + k (capo / transposed sheet).
    -> (k, agreement at 0, agreement at k)."""
    flat = sheet_flat(sheet)
    segs = res["segments"]
    dur = float(res["duration"])
    pairs = []
    for i, seg in enumerate(flat):
        a = float(seg.get("ct", seg.get("t")))
        b = float(flat[i + 1].get("ct", flat[i + 1].get("t"))) \
            if i + 1 < len(flat) else dur
        if b - a < 0.5:
            continue
        dom, share = dominant(segs, a, b)
        rs, re_ = _root_minor(seg["chord"]), _root_minor(dom)
        if rs and re_ and share >= 0.4:
            pairs.append((rs, re_, b - a))
    if not pairs:
        return 0, 0.0, 0.0
    tot = sum(w for _, _, w in pairs)
    rate = []
    for k in range(12):
        ok = sum(w for (ps, ms), (pe, me), w in pairs
                 if (ps + k) % 12 == pe and ms == me)
        rate.append(ok / tot)
    k = int(np.argmax(rate))
    return k, rate[0], rate[k]


def song_vocab(sheet, key_label=None):
    """Chords that fit the song: every sheet chord + diatonic chords of
    its key (from key_label like 'Em', else from the sheet chords)."""
    labels = [s["chord"] for s in sheet_flat(sheet) if s.get("chord")]
    vocab = set(labels)
    key = None
    if key_label:
        rm = _root_minor(key_label)
        if rm:
            key = (NOTES[rm[0]], "minor" if rm[1] else "major")
    if key is None:
        try:
            k = cd.key_from_chords(labels)
            if k:
                key = (k["tonic"], k["mode"])
        except Exception:
            key = None
    if key:
        ti = NOTES.index(cd.normalize_label(key[0]))
        if key[1] == "major":
            deg = [(0, ""), (2, "m"), (4, "m"), (5, ""), (7, ""), (9, "m"),
                   (7, "7")]
        else:
            deg = [(0, "m"), (3, ""), (5, "m"), (7, "m"), (7, ""), (7, "7"),
                   (8, ""), (10, "")]
        for st, q in deg:
            vocab.add(NOTES[(ti + st) % 12] + q)
    return vocab


def _fits(chord, vocab):
    return any(same_chord(chord, v) for v in vocab)


def _word_starts(seg, t_next):
    words = [w for w in str(seg.get("text", "")).split() if w]
    t0 = float(seg.get("t", seg.get("ct", 0.0)))
    w = seg.get("w")
    if isinstance(w, list) and len(w) == len(words) and words:
        return words, [float(x) for x in w]
    chars = sum(len(x) for x in words) or 1
    sung = min(max(t_next - t0, 0.3), max(1.2, chars * SEC_PER_CHAR))
    acc, starts = 0, []
    for x in words:
        starts.append(t0 + acc / chars * sung)
        acc += len(x)
    return words, starts


def fill_inside(sheet, res, key_label=None, min_beats=2):
    """Split sheet lines where the engine hears a chord change.
    Mutates sheet; returns a report list."""
    segs_e = [s for s in res["segments"] if s["chord"] != "N"]
    period = 60.0 / float(res["tempo"]) if res.get("tempo") else 0.5
    dur = float(res["duration"])
    k, r0, rk = key_frame_shift(sheet, res)
    shift = k if (k != 0 and rk >= r0 + 0.2) else 0
    flats = any(len(s["chord"]) > 1 and s["chord"][1] == "b"
                for s in sheet_flat(sheet))
    vocab = song_vocab(sheet, key_label)
    report = [{"type": "key_frame", "shift": shift, "agree_0": round(r0, 2),
               "agree_best": round(rk, 2), "best": k}]

    order = sheet_flat(sheet)
    nxt_ct = {}
    for i, s in enumerate(order):
        nxt_ct[id(s)] = float(order[i + 1].get("ct", order[i + 1].get("t"))) \
            if i + 1 < len(order) else dur

    for sec in sheet["sections"]:
        for li, line in enumerate(sec["lines"]):
            new_line = []
            for seg in line:
                if seg.get("ct") is None or seg.get("auto"):
                    new_line.append(seg)
                    continue
                a, b = float(seg["ct"]), nxt_ct.get(id(seg), dur)
                current = seg["chord"]
                inserts = []
                for es in segs_e:
                    s0, s1 = float(es["start"]), min(float(es["end"]), b)
                    if s0 < a + 0.5 * period or s0 > b - 0.5 * period:
                        continue
                    if s1 - s0 < min_beats * period - 0.05:
                        continue
                    ch = transpose(es["chord"], -shift, flats)
                    if same_chord(ch, current):
                        continue
                    if not _fits(ch, vocab):
                        report.append({"type": "skipped", "section":
                                       sec["label"], "line": li,
                                       "t": round(s0, 3), "chord": ch,
                                       "why": "not in the song's chords"})
                        continue
                    inserts.append((s0, ch))
                    current = ch
                if not inserts:
                    new_line.append(seg)
                    continue
                words, starts = _word_starts(seg, b)
                w_exact = seg.get("w") if isinstance(seg.get("w"), list) and \
                    len(seg["w"]) == len(words) else None
                cuts = []
                for s0, _ch in inserts:
                    idx = next((i for i, st in enumerate(starts)
                                if st >= s0 - 0.12), len(words))
                    cuts.append(idx)
                bounds = [0] + cuts + [len(words)]
                chords = [seg["chord"]] + [c for _, c in inserts]
                times = [float(seg.get("t", a))] + [s for s, _ in inserts]
                cts = [a] + [s for s, _ in inserts]
                for j, ch in enumerate(chords):
                    lo, hi = bounds[j], max(bounds[j], bounds[j + 1])
                    part = " ".join(words[lo:hi]) if hi > lo else "—"
                    piece = dict(seg) if j == 0 else {"chord": ch}
                    piece["chord"] = ch
                    piece["text"] = part
                    piece["t"] = round(starts[lo], 3) if hi > lo and j else \
                        round(times[j], 3)
                    piece["ct"] = round(cts[j], 3)
                    if w_exact is not None:
                        piece["w"] = w_exact[lo:hi]
                    elif "w" in piece:
                        del piece["w"]
                    if j:
                        piece["auto"] = True
                        report.append({"type": "added", "section":
                                       sec["label"], "line": li,
                                       "t": piece["ct"], "chord": ch,
                                       "text": part})
                    new_line.append(piece)
            sec["lines"][li] = new_line
    return report


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
    n_add = 0
    if "--fill" in args:
        mb = int(args[args.index("--min-beats") + 1]) \
            if "--min-beats" in args else 2
        fill_rep = fill_inside(sheet, res, sheet.get("key"), mb)
        out["sections"] = sheet["sections"]
        out["report"] = out["report"] + fill_rep
        n_add = sum(1 for r in fill_rep if r["type"] == "added")
    print(json.dumps(out, ensure_ascii=False, indent=1))
    n_mis = sum(1 for r in out["report"] if r["type"] == "mismatch")
    n_in = sum(1 for r in out["report"] if r["type"] == "inside")
    print(f"engine={res.get('engine')} tempo={res.get('tempo')} bpb={res.get('bpb')}"
          f" mismatches={n_mis} inside-line-changes={n_in} added={n_add}",
          file=sys.stderr)


if __name__ == "__main__":
    main()
