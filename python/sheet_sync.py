#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — sheet sync (v7.6)
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

--check / --harmonize (v7.4): QA for a sheet that is already synced
(every timed segment has ct; then the ct are kept, no re-sync).
  --check reports: the same chord written twice in a row inside a line
  (`repeat_chord`), a chord shorter than one beat (`too_short`), a chord
  more than a bar away from its lyric (`far_from_lyric`), an engine-added
  chord on one tiny word (`tiny_split`), and a lyric line that repeats
  (chorus, outro) with a DIFFERENT chord pattern (`repeat_differs`, with
  the engine agreement of every occurrence).
  --harmonize fixes `repeat_differs`: the occurrence the engine agrees
  with most becomes the pattern (chords + their beat offsets + the word
  splits) for every other occurrence of that line, beat-exact on that
  occurrence's own beat grid. It is applied only when the engine agrees
  with the new pattern at least as well as with the old one there and it
  fits before the next line; otherwise it is reported as skipped.
  v7.5: a chord of the human sheet (not `auto`) is never dropped by it -
  the source sheet beats the engine; instrumental placeholder lines
  («بداهه‌ی گیتار», «سولوی گیتار», ...) and lines of < 3 words are not
  treated as repeated lyrics.
  v7.6: only the CHORDS move - every word keeps the lyric time measured
  for its own occurrence (lyric_align `w` / `t`); the source occurrence
  only gives where the chords change and how the line is split.

It also emits the song's beat grid (beats / downbeats / bpb) so the
player can pulse with the beat.

Usage:
  python3 python/sheet_sync.py song.mp3 sheet.json [--analysis a.json]
                               [--fill] [--min-beats 2]
                               [--check] [--harmonize] > out.json

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


# ----------------------------------------------------------------------
# --check / --harmonize (v7.4)
# ----------------------------------------------------------------------

def _silent(text):
    t = str(text or "").strip()
    return not t or t == "—"


def _norm_text(text):
    t = str(text or "").replace("\u200c", "").replace("—", " ")
    for ch in "،,.!?؟:;«»\"'()":
        t = t.replace(ch, " ")
    return " ".join(t.split())


def _line_text(line):
    return _norm_text(" ".join(str(sg.get("text", "")) for sg in line
                               if not _silent(sg.get("text"))))


def _beat_index(beats, t):
    return int(np.argmin(np.abs(beats - float(t))))


def _ends(sheet, dur):
    order = sheet_flat(sheet)
    out = {}
    for i, s in enumerate(order):
        out[id(s)] = float(order[i + 1].get("ct", order[i + 1].get("t"))) \
            if i + 1 < len(order) else dur
    return out


def _changes(line):
    """the chord-change segments of a line (in-line repeats folded)"""
    out = []
    for si, sg in enumerate(line):
        if si > 0 and line[si - 1].get("chord") == sg.get("chord"):
            continue
        if isinstance(sg.get("ct"), (int, float)):
            out.append(sg)
    return out


def _agree(segs_e, spans):
    """engine agreement (0..1, duration-weighted) for [(chord, a, b)]"""
    tot = ok = 0.0
    for ch, a, b in spans:
        if b - a <= 0.05:
            continue
        dom, _share = dominant(segs_e, a, b)
        tot += b - a
        if same_chord(dom, ch):
            ok += b - a
    return ok / tot if tot else 0.0


def _line_spans(line, ends):
    ch = _changes(line)
    spans = []
    for i, sg in enumerate(ch):
        a = float(sg["ct"])
        b = float(ch[i + 1]["ct"]) if i + 1 < len(ch) else ends.get(id(line[-1]), a)
        spans.append((sg["chord"], a, b))
    return spans


def _pattern(line, beats):
    ch = _changes(line)
    if not ch:
        return []
    b0 = _beat_index(beats, ch[0]["ct"])
    return [(sg["chord"], _beat_index(beats, sg["ct"]) - b0) for sg in ch]


def _same_pattern(p, q):
    if len(p) != len(q):
        return False
    return all(same_chord(a[0], b[0], True) and abs(a[1] - b[1]) <= 1
               for a, b in zip(p, q))


# words that mark an instrumental placeholder line, not a sung lyric
INSTRUMENTAL = ("بداهه", "بداههی", "سولو", "سولوی", "سلو", "گیتار", "اینترو",
                "پیانو", "ویولن", "بیکلام", "instrumental", "solo", "intro")


def _is_instrumental(key):
    words = key.split()
    return any(w in INSTRUMENTAL for w in words) and len(words) <= 3


def _repeat_groups(sheet):
    groups = {}
    for sec in sheet["sections"]:
        for li, line in enumerate(sec["lines"]):
            key = _line_text(line)
            if len(key.split()) < 3 or _is_instrumental(key) or not _changes(line):
                continue
            groups.setdefault(key, []).append((sec, li))
    return {k: v for k, v in groups.items() if len(v) > 1}


def check_sheet(sheet, res):
    beats = np.asarray(res["beats"], dtype=float)
    segs_e = [s for s in res["segments"] if s["chord"] != "N"]
    period = 60.0 / float(res["tempo"]) if res.get("tempo") else 0.5
    bar = period * int(res.get("bpb") or 4)
    ends = _ends(sheet, float(res["duration"]))
    rep = []
    for sec in sheet["sections"]:
        for li, line in enumerate(sec["lines"]):
            for si, sg in enumerate(line):
                if not isinstance(sg.get("ct"), (int, float)):
                    continue
                where = {"section": sec["label"], "line": li, "seg": si,
                         "t": sg["ct"], "chord": sg["chord"],
                         "text": sg.get("text", "")}
                if si > 0 and line[si - 1].get("chord") == sg["chord"]:
                    rep.append(dict(where, type="repeat_chord"))
                    continue
                ln = ends.get(id(sg), sg["ct"]) - float(sg["ct"])
                if ln < 0.9 * period:
                    rep.append(dict(where, type="too_short",
                                    beats=round(ln / period, 2)))
                if isinstance(sg.get("t"), (int, float)) and \
                        abs(float(sg["t"]) - float(sg["ct"])) > bar:
                    rep.append(dict(where, type="far_from_lyric",
                                    gap=round(float(sg["t"]) - float(sg["ct"]), 2)))
                txt = str(sg.get("text", "")).strip()
                if sg.get("auto") and not _silent(txt) and len(txt.split()) == 1 \
                        and len(txt) <= 2:
                    rep.append(dict(where, type="tiny_split"))
    for key, occ in _repeat_groups(sheet).items():
        pats = [_pattern(sec["lines"][li], beats) for sec, li in occ]
        if all(_same_pattern(pats[0], p) for p in pats[1:]):
            continue
        rep.append({"type": "repeat_differs", "text": key, "occurrences": [
            {"section": sec["label"], "line": li,
             "t": _changes(sec["lines"][li])[0]["ct"],
             "pattern": [f"{c}@{d}" for c, d in pats[j]],
             "engine": round(_agree(segs_e, _line_spans(sec["lines"][li], ends)), 2)}
            for j, (sec, li) in enumerate(occ)]})
    return rep


def _word_times(line):
    """(normalized words, their measured start times or None) of a line"""
    words, times = [], []
    for sg in line:
        if _silent(sg.get("text")):
            continue
        ws = [w for w in str(sg["text"]).split() if w]
        w = sg.get("w")
        if isinstance(w, list) and len(w) == len(ws):
            tt = [float(x) for x in w]
        elif isinstance(sg.get("t"), (int, float)):
            tt = [float(sg["t"])] + [None] * (len(ws) - 1)
        else:
            tt = [None] * len(ws)
        words += [_norm_text(x) for x in ws]
        times += tt
    return words, times


def _keep_lyric_times(new, src, dst):
    """give the re-patterned segments the dst line's own word times.
    Returns False when the two lines' words do not match one to one."""
    s_words, _ = _word_times(src)
    d_words, d_times = _word_times(dst)
    if s_words != d_words:
        return False
    pos = 0
    for piece in new:
        if _silent(piece.get("text")):
            continue
        n = len([w for w in str(piece["text"]).split() if w])
        tt = d_times[pos:pos + n]
        pos += n
        if tt and tt[0] is not None:
            piece["t"] = round(tt[0], 3)
        if tt and all(x is not None for x in tt):
            piece["w"] = [round(x, 3) for x in tt]
        else:
            piece.pop("w", None)
    return True


def harmonize(sheet, res):
    beats = np.asarray(res["beats"], dtype=float)
    segs_e = [s for s in res["segments"] if s["chord"] != "N"]
    period = 60.0 / float(res["tempo"]) if res.get("tempo") else 0.5
    rep = []
    for key, occ in _repeat_groups(sheet).items():
        ends = _ends(sheet, float(res["duration"]))
        pats = [_pattern(sec["lines"][li], beats) for sec, li in occ]
        if all(_same_pattern(pats[0], p) for p in pats[1:]):
            continue
        scores = [_agree(segs_e, _line_spans(sec["lines"][li], ends))
                  for sec, li in occ]
        j0 = int(np.argmax(scores))
        ssec, sli = occ[j0]
        src = ssec["lines"][sli]
        s_b0 = _beat_index(beats, _changes(src)[0]["ct"])
        for j, (sec, li) in enumerate(occ):
            if j == j0 or _same_pattern(pats[j0], pats[j]):
                continue
            dst = sec["lines"][li]
            d_first = _changes(dst)[0]
            d_b0 = _beat_index(beats, d_first["ct"])
            limit = ends.get(id(dst[-1]), float(res["duration"]))
            new, ok = [], True
            for sg in src:
                if not isinstance(sg.get("ct"), (int, float)):
                    ok = False
                    break
                bi = d_b0 + _beat_index(beats, sg["ct"]) - s_b0
                if bi < 0 or bi >= len(beats):
                    ok = False
                    break
                ct = float(beats[bi])
                piece = {k: v for k, v in sg.items() if k != "w"}
                piece["ct"] = round(ct, 3)
                if isinstance(sg.get("t"), (int, float)):
                    piece["t"] = round(ct + float(sg["t"]) - float(sg["ct"]), 3)
                new.append(piece)
            if ok and new and new[-1]["ct"] > limit - 0.5 * period:
                ok = False
            why = "does not fit before the next line"
            # v7.5: the human sheet beats the engine - never drop one of its chords
            kept = {sg["chord"] for sg in new}
            lost = [sg["chord"] for sg in _changes(dst)
                    if not sg.get("auto") and not any(same_chord(sg["chord"], c, True) for c in kept)]
            if ok and lost:
                ok = False
                why = "would drop a chord of the source sheet: " + ", ".join(lost)
            if ok:
                old_s = scores[j]
                ends2 = dict(ends)
                ends2[id(new[-1])] = limit
                new_s = _agree(segs_e, _line_spans(new, ends2))
                if new_s + 1e-6 < old_s:
                    ok = False
                    why = f"engine prefers the old pattern ({old_s:.2f} > {new_s:.2f})"
            same_words = ok and _keep_lyric_times(new, src, dst)
            item = {"section": sec["label"], "line": li, "t": d_first["ct"],
                    "text": key, "from": {"section": ssec["label"], "line": sli,
                                          "engine": round(scores[j0], 2)},
                    "old": [f"{c}@{d}" for c, d in pats[j]],
                    "new": [f"{c}@{d}" for c, d in pats[j0]]}
            if ok:
                sec["lines"][li] = new
                if not same_words:
                    item["note"] = "words differ: lyric times shifted from the source line"
                rep.append(dict(item, type="harmonized"))
            else:
                rep.append(dict(item, type="harmonize_skipped", why=why))
    return rep


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
    timed = [sg for sec in sheet["sections"] for line in sec["lines"]
             for sg in line if isinstance(sg.get("t"), (int, float))]
    qa = "--check" in args or "--harmonize" in args
    if qa and "--fill" not in args and timed and \
            all(isinstance(sg.get("ct"), (int, float)) for sg in timed):
        # an already synced sheet: keep its ct, only run the QA
        out = {"bpb": res.get("bpb", 4), "tempo": res.get("tempo"),
               "beats": res["beats"], "downbeats": res["downbeats"],
               "sections": sheet["sections"], "report": []}
    else:
        out = sync(sheet, res)
    n_add = 0
    if "--fill" in args:
        mb = int(args[args.index("--min-beats") + 1]) \
            if "--min-beats" in args else 2
        fill_rep = fill_inside(sheet, res, sheet.get("key"), mb)
        out["sections"] = sheet["sections"]
        out["report"] = out["report"] + fill_rep
        n_add = sum(1 for r in fill_rep if r["type"] == "added")
    if "--harmonize" in args:
        out["report"] = out["report"] + harmonize(sheet, res)
        out["sections"] = sheet["sections"]
    if qa:
        out["report"] = out["report"] + check_sheet(sheet, res)
    print(json.dumps(out, ensure_ascii=False, indent=1))
    n_mis = sum(1 for r in out["report"] if r["type"] == "mismatch")
    n_in = sum(1 for r in out["report"] if r["type"] == "inside")
    print(f"engine={res.get('engine')} tempo={res.get('tempo')} bpb={res.get('bpb')}"
          f" mismatches={n_mis} inside-line-changes={n_in} added={n_add}",
          file=sys.stderr)
    if qa:
        cnt = {}
        for r in out["report"]:
            cnt[r["type"]] = cnt.get(r["type"], 0) + 1
        print("qa: " + " ".join(f"{k}={v}" for k, v in sorted(cnt.items())),
              file=sys.stderr)


if __name__ == "__main__":
    main()
