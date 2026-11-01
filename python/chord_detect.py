#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — Chord detection engine (v6)
========================================
Detects the chords of every section of a song.

Primary engine (v6, deep):
  1. Load audio (mono, 22050 Hz); hybrid-CQT features (288 bins).
  2. 5-fold ensemble of the ISMIR-2019 large-vocabulary ChordNet
     (CNN + BiLSTM, ~300 chord templates, bass head included).
  3. Frame-level XHMM (Viterbi) labelling for key detection.
  4. Per-bar emissions pooled from the ensemble probabilities ->
     bar-grid Viterbi under a key constraint -> chords land on musical time.
  5. Chords are mapped onto guitar-friendly labels (maj, m, 7, m7, maj7,
     sus, dim, real slash inversions kept, weak colour tones collapsed).

Fallback engine (v5, DSP): wide-band chroma + bar Viterbi + key
competition + repeat pooling — used automatically when torch is not
installed or the deep engine fails.

Usage:  python3 chord_detect.py <audio_file>
Output: JSON on stdout
"""

import sys
import json
import math
import re
import warnings

import numpy as np
import librosa

warnings.filterwarnings("ignore")

SR = 22050
HOP = 512

NOTES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]
NOTE_FA = {
    "C": "دو", "C#": "دو دیز", "D": "ر", "D#": "ر دیز", "E": "می",
    "F": "فا", "F#": "فا دیز", "G": "سل", "G#": "سل دیز",
    "A": "لا", "A#": "لا دیز", "B": "سی",
    "Db": "ر بمل", "Eb": "می بمل", "Gb": "سل بمل",
    "Ab": "لا بمل", "Bb": "سی بمل",
}

_SHARP_TO_FLAT = {"C#": "Db", "D#": "Eb", "F#": "Gb", "G#": "Ab", "A#": "Bb"}

# keys conventionally written with flat key signatures
_FLAT_KEY_MINOR = {"D", "G", "C", "F", "Bb", "Eb", "Ab", "Db"}
_FLAT_KEY_MAJOR = {"F", "Bb", "Eb", "Ab", "Db", "Gb"}

SOFTMAX_Z = 14.0     # emission contrast
KEY_PENALTY = 0.40   # emission multiplier for out-of-key chords
STAY = 0.72          # per-bar self-transition probability
MIN_SEG = 0.8        # seconds; absolute floor for a chord segment
PAIR_SIM_THR = 0.90  # mean-chroma cosine for "these two sections repeat"
REPEAT_MIN_SPAN = 8.0  # only harmonize sections at least this long


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(0)


# ----------------------------------------------------------------------
# Chord labels / key helpers
# ----------------------------------------------------------------------

_CHORD_RE = re.compile(r"^([A-G][#b]?)(.*)$")


def chord_parse(label):
    """'A#m7' -> (10, 'm7'); unknown -> (None, '')."""
    m = _CHORD_RE.match(label or "")
    if not m:
        return None, ""
    root, suffix = m.group(1), m.group(2)
    pc = NOTES.index(root[0])
    if len(root) > 1:
        pc = (pc + (1 if root[1] == "#" else -1)) % 12
    return pc, suffix


_FLAT_TO_SHARP = {"Ab": "G#", "Bb": "A#", "Db": "C#", "Eb": "D#", "Gb": "F#"}


def normalize_label(label):
    """Flat spellings (Essentia emits Bb/Eb/Ab/...) -> sharp spellings."""
    if not label or label == "N":
        return label
    m = _CHORD_RE.match(label)
    if not m:
        return label
    root, suffix = m.group(1), m.group(2)
    if len(root) == 2 and root[1] == "b":
        root = _FLAT_TO_SHARP.get(root, root)
    return root + suffix


def respell_for_key(label, use_flats):
    """Re-spell a chord root for readability ('A#m' -> 'Bbm' in flat keys)."""
    if not use_flats or not label or label == "N":
        return label
    m = _CHORD_RE.match(label)
    if not m:
        return label
    root, suffix = m.group(1), m.group(2)
    return _SHARP_TO_FLAT.get(root, root) + suffix


# Krumhansl-Kessler key profiles
KMAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KMIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

SECTION_COLORS = ["#f59e0b", "#f43f5e", "#10b981", "#a855f7", "#f97316",
                  "#14b8a6", "#84cc16", "#ec4899"]


def _ks_key(weights):
    """Krumhansl-Schmuckler on a 12-d pitch-class weight vector."""
    w = np.asarray(weights, dtype=float)
    if w.sum() < 1e-9:
        return None
    w = w / w.max()
    best = (None, None, -2.0)
    for mode, profile in (("major", KMAJ), ("minor", KMIN)):
        p = (profile - profile.mean()) / profile.std()
        v = (w - w.mean())
        sd = v.std()
        if sd < 1e-9:
            continue
        v = v / sd
        for r in range(12):
            score = float(np.dot(v, np.roll(p, r)))
            if score > best[2]:
                best = (NOTES[r], mode, score)
    if best[0] is None:
        return None
    mode_fa = "ماژور" if best[1] == "major" else "مینور"
    return {"tonic": best[0], "mode": best[1],
            "confidence": round(min(max(best[2], 0.0), 1.0), 3),
            "tonicFa": NOTE_FA[best[0]], "modeFa": mode_fa}


def key_from_chords(segments):
    """Key from duration-weighted chord roots/thirds."""
    w = np.zeros(12)
    total = 0.0
    for s in segments:
        c = s["chord"] if isinstance(s, dict) else s
        if c == "N":
            continue
        root, suffix = chord_parse(c)
        if root is None:
            continue
        dur = max(float(s["end"]) - float(s["start"]), 0.1) if isinstance(s, dict) else 1.0
        w[root] += dur
        if suffix in ("m", "m7"):
            w[(root + 3) % 12] += 0.75 * dur
        elif suffix in ("", "7", "maj7"):
            w[(root + 4) % 12] += 0.75 * dur
        if suffix != "dim":
            w[(root + 7) % 12] += 0.45 * dur
        if suffix == "7":
            w[(root + 10) % 12] += 0.20 * dur
        total += dur
    if total < 4.0:
        return None
    return _ks_key(w)


def key_chord_mask(tonic, mode):
    """Boolean mask over TEMPLATES labels: chords that belong to the key.

    Seventh chords are allowed ONLY where they are genuinely idiomatic:
    V7 (always), II7 (= V7/V), III7 (= V7/vi) and VI7 (= V7/ii) in major;
    V7, II7 (= V7/VII) and VII7 in minor. I7/IV7 in major and III7/VI7 in
    minor are excluded on purpose: on dense mixes the singer's colour
    notes create phantom C7/F7/Cm/Gm candidates that would otherwise win
    ties for whole choruses."""
    ti = NOTES.index(tonic)
    allowed = set()
    if mode == "major":
        for st in (0, 5, 7):
            allowed.add(NOTES[(ti + st) % 12])
        for st in (2, 4, 9):
            allowed.add(NOTES[(ti + st) % 12] + "m")     # ii iii vi
            allowed.add(NOTES[(ti + st) % 12] + "m7")    # ii7 iii7 vi7
        allowed.add(NOTES[(ti + 7) % 12] + "7")   # V7
        allowed.add(NOTES[(ti + 2) % 12] + "7")   # II7  = V7/V
        allowed.add(NOTES[(ti + 4) % 12] + "7")   # III7 = V7/vi
        allowed.add(NOTES[(ti + 9) % 12] + "7")   # VI7  = V7/ii
    else:
        allowed.add(NOTES[ti] + "m")               # i
        allowed.add(NOTES[ti] + "m7")              # i7
        allowed.add(NOTES[(ti + 5) % 12] + "m")    # iv
        allowed.add(NOTES[(ti + 5) % 12] + "m7")   # iv7
        allowed.add(NOTES[(ti + 7) % 12] + "m")    # v
        allowed.add(NOTES[(ti + 7) % 12])          # V  (harmonic minor)
        allowed.add(NOTES[(ti + 7) % 12] + "7")    # V7
        for st in (3, 8, 10):
            allowed.add(NOTES[(ti + st) % 12])     # III VI VII
        allowed.add(NOTES[(ti + 2) % 12] + "7")   # II7  = V7/VII
        allowed.add(NOTES[(ti + 10) % 12] + "7")  # VII7
    mask = np.array([lab in allowed for lab in LABELS], dtype=bool)
    mask[LABELS.index("N")] = True
    return mask


def key_compatibility(segments, tonic, mode):
    """Fraction of chord-time whose chords are diatonic in (tonic, mode)."""
    mask = key_chord_mask(tonic, mode)
    ok, total = 0.0, 0.0
    for s in segments:
        if s["chord"] == "N":
            continue
        dur = max(float(s["end"]) - float(s["start"]), 0.05)
        total += dur
        try:
            if mask[LABELS.index(s["chord"])]:
                ok += dur
        except ValueError:
            pass
    return (ok / total) if total > 1e-6 else 0.0


def tonic_chord_share(segments, tonic, mode):
    """Fraction of chord-time spent on the tonic chord itself."""
    tot, hit = 0.0, 0.0
    for s in segments:
        c = s["chord"] if isinstance(s, dict) else s
        if c == "N":
            continue
        dur = max(float(s["end"]) - float(s["start"]), 0.05) if isinstance(s, dict) else 1.0
        tot += dur
        if mode == "minor":
            if c in (tonic + "m", tonic + "m7"):
                hit += dur
        else:
            if c in (tonic, tonic + "7"):
                hit += dur
    return (hit / tot) if tot > 1e-6 else 0.0


def pick_key(candidates, segments):
    """Choose the key that best explains the detected chords."""
    best, best_score = None, -1.0
    for k in candidates:
        if not k:
            continue
        score = key_compatibility(segments, k["tonic"], k["mode"])
        if score > best_score:
            best, best_score = k, score
    return best


def best_key_overall(segments):
    """Scan all 24 keys; the one that explains the detected chords best wins
    (coverage first, tonic-chord share as relative major/minor tie-break)."""
    total = 0.0
    roots = {}
    for s in segments:
        c = s["chord"] if isinstance(s, dict) else s
        if c == "N":
            continue
        dur = max(float(s["end"]) - float(s["start"]), 0.05) if isinstance(s, dict) else 1.0
        total += dur
        pc, _sfx = chord_parse(c)
        if pc is not None:
            roots[pc] = roots.get(pc, 0.0) + dur
    if total < 4.0:
        return None
    best, best_cov, best_share = None, -1.0, -1.0
    for r in range(12):
        for mode in ("major", "minor"):
            cov = key_compatibility(segments, NOTES[r], mode)
            share = tonic_chord_share(segments, NOTES[r], mode)
            if (cov, share) > (best_cov, best_share):
                best, best_cov, best_share = (NOTES[r], mode), cov, share
    if best is None or best_cov < 0.50:
        return None
    tonic_pc = NOTES.index(best[0])
    if roots.get(tonic_pc, 0.0) / total < 0.05:
        return None
    tonic, mode = best
    return {"tonic": tonic, "mode": mode, "confidence": round(best_cov, 3),
            "tonicFa": NOTE_FA[tonic],
            "modeFa": "ماژور" if mode == "major" else "مینور"}


def refine_key(key, segments, mean_chroma, cov_win=0.12):
    """Scale-mass tiebreak between keys with near-equal chord coverage."""
    if not key or mean_chroma is None:
        return key
    try:
        best_cov = key_compatibility(segments, key["tonic"], key["mode"])
    except Exception:
        return key
    w = np.asarray(mean_chroma, dtype=float)
    s = w.sum()
    if s < 1e-9:
        return key
    w = w / s

    def scale_pcs(tonic, mode):
        ti = NOTES.index(tonic)
        if mode == "major":
            return {(ti + st) % 12 for st in (0, 2, 4, 5, 7, 9, 11)}
        return {(ti + st) % 12 for st in (0, 2, 3, 5, 7, 8, 10)}

    best = key
    best_pcs = scale_pcs(key["tonic"], key["mode"])
    for r in range(12):
        for mode in ("major", "minor"):
            if NOTES[r] == key["tonic"] and mode == key["mode"]:
                continue
            try:
                cov = key_compatibility(segments, NOTES[r], mode)
            except Exception:
                continue
            if cov < best_cov - cov_win:
                continue
            pcs = scale_pcs(NOTES[r], mode)
            diff_new = sorted(pcs - best_pcs)
            diff_cur = sorted(best_pcs - pcs)
            only_new = float(w[diff_new].sum()) if diff_new else 0.0
            only_cur = float(w[diff_cur].sum()) if diff_cur else 0.0
            flip = False
            if only_new > only_cur * 1.12 + 1e-9:
                flip = True
            elif pcs == best_pcs:
                sh_new = tonic_chord_share(segments, NOTES[r], mode)
                sh_cur = tonic_chord_share(segments, best["tonic"], best["mode"])
                if sh_new > sh_cur + 0.05:
                    flip = True
            if flip:
                best = {"tonic": NOTES[r], "mode": mode,
                        "confidence": key.get("confidence", 0.0),
                        "tonicFa": NOTE_FA[NOTES[r]],
                        "modeFa": "ماژور" if mode == "major" else "مینور"}
                best_pcs = pcs
    return best


# ----------------------------------------------------------------------
# Fallback template machinery (also used for the Essentia candidate)
# ----------------------------------------------------------------------

def build_templates():
    """Chord templates: L2-normalized binary vectors for 60 chords + N."""
    T, labels, kinds = [], [], []

    def add(idx, label, kind):
        t = np.zeros(12)
        for i in idx:
            t[i] = 1.0
        n = np.linalg.norm(t)
        T.append(t / n)
        labels.append(label)
        kinds.append(kind)

    for r in range(12):
        add([r, (r + 4) % 12, (r + 7) % 12], NOTES[r], "maj")
    for r in range(12):
        add([r, (r + 3) % 12, (r + 7) % 12], NOTES[r] + "m", "min")
    for r in range(12):  # dominant 7th
        add([r, (r + 4) % 12, (r + 7) % 12, (r + 10) % 12], NOTES[r] + "7", "dom7")
    for r in range(12):  # minor 7th
        add([r, (r + 3) % 12, (r + 7) % 12, (r + 10) % 12], NOTES[r] + "m7", "min7")
    T.append(np.ones(12) / math.sqrt(12))
    labels.append("N")
    kinds.append("N")

    # maj7 templates stay OUT (vocal colour notes fake them everywhere);
    # m7 returns with a penalty: Am7/Dm7-type bars otherwise split their
    # votes between the plain triads and phantom dominant 7ths.
    kind_w = {"maj": 1.0, "min": 1.0, "dom7": 0.85, "min7": 0.78, "N": 1.0}
    return np.array(T), labels, np.array([kind_w[k] for k in kinds])


TEMPLATES, LABELS, WEIGHTS = build_templates()
N_IDX = LABELS.index("N")

_Tn_cache = None


def _templates_norm():
    global _Tn_cache
    if _Tn_cache is None:
        _Tn_cache = TEMPLATES / np.maximum(
            np.linalg.norm(TEMPLATES, axis=1, keepdims=True), 1e-9)
    return _Tn_cache


def template_fit(v, lab):
    """Cosine fit of a chroma vector against one chord label."""
    try:
        return float(_templates_norm()[LABELS.index(lab)] @ v)
    except ValueError:
        return -1.0


def best_in_key_fit(v, key):
    """Best diatonic chord for a chroma vector -> (label, cosine)."""
    if not key or v is None:
        return None, -1.0
    try:
        mask = key_chord_mask(key["tonic"], key["mode"])
    except Exception:
        return None, -1.0
    Tn = _templates_norm()
    best, best_c = None, -1.0
    for i, lab in enumerate(LABELS):
        if lab == "N" or not mask[i]:
            continue
        c = float(Tn[i] @ v)
        if c > best_c:
            best, best_c = lab, c
    return best, best_c


# ----------------------------------------------------------------------
# Shared segment utilities
# ----------------------------------------------------------------------

def fold_short(segments, min_len):
    """Fold segments shorter than min_len into their *longer* neighbour."""
    segs = [dict(s) for s in segments if s["end"] - s["start"] > 1e-3]
    guard = 0
    while len(segs) > 1 and guard < 2000:
        guard += 1
        idx, s = min(enumerate(segs), key=lambda kv: kv[1]["end"] - kv[1]["start"])
        if s["end"] - s["start"] >= min_len:
            break
        if 0 < idx < len(segs) - 1:
            p, n = segs[idx - 1], segs[idx + 1]
            target = p if (p["end"] - p["start"]) >= (n["end"] - n["start"]) else n
        else:
            target = segs[idx - 1] if idx > 0 else segs[idx + 1]
        target["start"] = min(target["start"], s["start"])
        target["end"] = max(target["end"], s["end"])
        segs.pop(idx)
    out = []
    for s in segs:  # merge consecutive duplicates created by folding
        if out and out[-1]["chord"] == s["chord"]:
            out[-1]["end"] = s["end"]
        else:
            out.append(s)
    return out


def dedupe_and_cover(segments, duration):
    """Sort, clamp to [0, duration] and make the timeline contiguous."""
    segs = sorted(segments, key=lambda s: s["start"])
    out = []
    for s in segs:
        start = float(max(0.0, min(s["start"], duration)))
        end = float(max(0.0, min(s["end"], duration)))
        if end - start < 1e-3:
            continue
        if out and out[-1]["chord"] == s["chord"] and abs(out[-1]["end"] - start) < 0.25:
            out[-1]["end"] = end
        else:
            if out and start > out[-1]["end"]:  # close tiny gaps
                out[-1]["end"] = start
            out.append({"chord": s["chord"], "start": start, "end": end})
    if out:
        out[0]["start"] = 0.0
        out[-1]["end"] = duration
    return out


def absorb_short_N(segments, duration, max_n=3.0):
    """Fold short silence ('N') spans into their longer musical neighbour."""
    segs = [dict(s) for s in segments if s["end"] > s["start"]]
    changed = True
    while changed:
        changed = False
        for i, s in enumerate(segs):
            if s["chord"] != "N":
                continue
            prev = segs[i - 1] if i > 0 else None
            nxt = segs[i + 1] if i + 1 < len(segs) else None
            if prev is None and nxt is not None:
                nxt["start"] = s["start"]
                del segs[i]
                changed = True
                break
            if nxt is None and prev is not None:
                prev["end"] = s["end"]
                del segs[i]
                changed = True
                break
            if prev is not None and nxt is not None:
                if (s["end"] - s["start"]) > max_n:
                    continue
                dp = s["start"] - prev["start"]
                dn = nxt["end"] - nxt["start"]
                if dp >= dn:
                    prev["end"] = s["end"]
                else:
                    nxt["start"] = s["start"]
                del segs[i]
                changed = True
                break
    return segs


def assign_section_labels(section_chromas):
    """Give letters A/B/C to sections by harmonic similarity."""
    norms = []
    for ch in section_chromas:
        v = np.asarray(ch, dtype=float)
        n = np.linalg.norm(v)
        norms.append(v / n if n > 1e-9 else v)
    letters = []
    next_letter = 0
    for i, v in enumerate(norms):
        assigned = None
        for j in range(i):
            sim = float(np.dot(v, norms[j]))
            if sim >= 0.86 and letters[j] is not None:
                if assigned is None or sim > assigned[1]:
                    assigned = (letters[j], sim)
        if assigned is not None:
            letters.append(assigned[0])
        else:
            letters.append(next_letter)
            next_letter += 1
    return letters


def span_chroma(C, grid_start, grid_end, a, b):
    """Normalized mean chroma over the time span [a, b]."""
    sel = np.array([(grid_end[i] > a and grid_start[i] < b)
                    for i in range(C.shape[1])], dtype=bool)
    if not sel.any():
        return None
    v = C[:, sel].mean(axis=1)
    n = np.linalg.norm(v)
    if n < 1e-9:
        return None
    return v / n


def relabel_span(segments, a, b, newlabel):
    """Give the time span [a, b] a new chord label."""
    out = []
    for s in segments:
        if s["end"] <= a + 1e-6 or s["start"] >= b - 1e-6:
            out.append(s)
            continue
        if s["start"] < a - 1e-6:
            out.append({"chord": s["chord"], "start": s["start"], "end": a})
        out.append({"chord": newlabel,
                    "start": max(s["start"], a), "end": min(s["end"], b)})
        if s["end"] > b + 1e-6:
            out.append({"chord": s["chord"], "start": b, "end": s["end"]})
    return out


def harmonize_repeats(sec_ranges, segments, C, grid_start, grid_end, key):
    """Sections that repeat must carry the SAME chords: pool the chroma of
    aligned disagreeing spans and relabel both to the pooled winner."""
    if len(sec_ranges) < 2 or not key:
        return segments
    segs = [dict(s) for s in segments]

    def spans_in(sa, sb):
        out = []
        for s in segs:
            if s["end"] <= sa + 1e-6 or s["start"] >= sb - 1e-6:
                continue
            out.append((max(s["start"], sa), min(s["end"], sb), s["chord"]))
        return out

    for i in range(len(sec_ranges)):
        for j in range(i + 1, len(sec_ranges)):
            sa, ea, ci = sec_ranges[i]
            sb, eb, cj = sec_ranges[j]
            if (ea - sa) < REPEAT_MIN_SPAN or (eb - sb) < REPEAT_MIN_SPAN:
                continue
            ni, nj = np.linalg.norm(ci), np.linalg.norm(cj)
            if ni < 1e-9 or nj < 1e-9:
                continue
            sim = float(np.dot(ci / ni, cj / nj))
            if sim < PAIR_SIM_THR:
                continue
            spa = spans_in(sa, ea)
            spb = spans_in(sb, eb)
            for (a0, a1, ca) in spa:
                if a1 - a0 < 1.0 or ca == "N":
                    continue
                ra0 = (a0 - sa) / (ea - sa)
                ra1 = (a1 - sa) / (ea - sa)
                best_ov, best_span = 0.0, None
                for (b0, b1, cb) in spb:
                    if cb == "N":
                        continue
                    rb0 = (b0 - sb) / (eb - sb)
                    rb1 = (b1 - sb) / (eb - sb)
                    ov = min(ra1, rb1) - max(ra0, rb0)
                    if ov > best_ov:
                        best_ov, best_span = ov, (b0, b1, cb)
                if best_span is None or best_ov < 0.4 * (ra1 - ra0):
                    continue
                b0, b1, cb = best_span
                if cb == ca:
                    continue
                va = span_chroma(C, grid_start, grid_end, a0, a1)
                vb = span_chroma(C, grid_start, grid_end, b0, b1)
                if va is None or vb is None:
                    continue
                vp = (va + vb) / 2.0
                np_ = np.linalg.norm(vp)
                if np_ < 1e-9:
                    continue
                vp = vp / np_
                fa = template_fit(va, ca)
                fb = template_fit(vb, cb)
                plab, pfit = best_in_key_fit(vp, key)
                if plab is None:
                    continue
                if pfit >= max(fa, fb) + 0.05:
                    segs = relabel_span(segs, a0, a1, plab)
                    segs = relabel_span(segs, b0, b1, plab)
                elif fa - fb >= 0.08 and template_fit(vb, ca) > 0:
                    segs = relabel_span(segs, b0, b1, ca)
                elif fb - fa >= 0.08 and template_fit(va, cb) > 0:
                    segs = relabel_span(segs, a0, a1, cb)
    return segs


# ----------------------------------------------------------------------
# Wide-band chroma (vibrato-robust) + bar grid
# ----------------------------------------------------------------------

def wide_chroma_from_stft(S, freqs, tuning, fmin, fmax, width=0.65):
    """Fold an FFT magnitude spectrogram into 12 pitch classes by summing
    SEMITONE-WIDE bands (±width semitones) around each note. Vocal vibrato
    and tape drift smear notes ±40 cents; wide bands keep one note in one
    band, narrow CQT bins split it between neighbours."""
    mids = np.arange(int(round(69 + 12 * math.log2(fmin / 440.0))),
                     int(round(69 + 12 * math.log2(fmax / 440.0))) + 1)
    C = np.zeros((12, S.shape[1]))
    for m in mids:
        fc = 440.0 * 2 ** ((m + tuning - 69) / 12.0)
        band = (freqs >= fc * 2 ** (-width / 12.0)) & \
               (freqs <= fc * 2 ** (width / 12.0))
        if band.any():
            C[m % 12] += S[band].sum(axis=0)
    return C


def bar_grid(y, sr, dur):
    """Beat-tracked bar grid; bar phase picked by onset energy on bar lines."""
    try:
        tempo, beats = librosa.beat.beat_track(y=y, sr=sr, hop_length=HOP)
        bt = librosa.frames_to_time(np.atleast_1d(beats), sr=sr, hop_length=HOP)
    except Exception:
        return None, 0.5, 4
    bt = bt[(bt >= 0) & (bt < dur)]
    if len(bt) < 8:
        return None, 0.5, 4
    diffs = np.diff(bt)
    diffs = diffs[(diffs > 0.15) & (diffs < 2.0)]
    period = float(np.median(diffs)) if len(diffs) else 0.5
    onset = librosa.onset.onset_strength(y=y, sr=sr, hop_length=HOP)
    ot = librosa.frames_to_time(np.arange(len(onset)), sr=sr, hop_length=HOP)
    bpb = 4 if period < 0.85 else 3   # fast 6/8 songs: 3 beats per bar
    best_ph, best_e = 0, -1.0
    for ph in range(bpb):
        lines = bt[ph::bpb]
        if len(lines) < 2:
            continue
        e = 0.0
        for L in lines:
            sel = (ot > L - 0.06) & (ot < L + 0.06)
            e += onset[sel].mean() if sel.any() else 0.0
        if e > best_e:
            best_e, best_ph = e, ph
    lines = list(bt[best_ph::bpb])
    step = period * bpb
    k = int(math.floor(lines[0] / step))
    if 0 < k < 100:
        lines = [lines[0] - step * i for i in range(k, 0, -1)] + lines
    lines = [max(0.0, t) for t in lines]
    last, g = lines[-1], 0
    while dur - last > step and g < 400:
        last += step
        g += 1
        lines.append(last)
    return np.array(lines), period, bpb


# ----------------------------------------------------------------------
# Primary engine: bar-synced Viterbi with key competition
# ----------------------------------------------------------------------

def prepare_features(path):
    """Load audio, tuning, wide-band chromas, bar grid, silence map."""
    y, sr = librosa.load(path, sr=SR, mono=True, res_type="kaiser_fast")
    dur = float(len(y) / sr)
    if dur < 4:
        fail("فایل صوتی خیلی کوتاه است (حداقل ۴ ثانیه).")
    if dur > 900:
        y = y[: int(900 * sr)]
        dur = 900.0

    try:
        tuning = float(np.clip(librosa.estimate_tuning(y=y, sr=sr), -0.45, 0.45))
    except Exception:
        tuning = 0.0

    try:
        y_h = librosa.effects.harmonic(y, margin=3.0)
    except Exception:
        y_h = y

    n_fft = 8192
    S = np.abs(librosa.stft(y_h, n_fft=n_fft, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    C = wide_chroma_from_stft(S, freqs, tuning, 55.0, 2200.0)
    B = wide_chroma_from_stft(S, freqs, tuning, 55.0, 300.0)

    bars, period, bpb = bar_grid(y, sr, dur)
    if bars is None:
        bars = np.arange(0.0, dur, 2.0)
        period, bpb = 0.5, 4

    # silence map per bar (harmonic RMS floor)
    rms_h = librosa.feature.rms(y=y_h, hop_length=HOP)[0]
    n = rms_h.shape[0]
    frames = np.unique(np.concatenate(
        [[0], np.clip(librosa.time_to_frames(bars, sr=sr, hop_length=HOP), 0, n - 1)]))
    rms_b = librosa.util.sync(rms_h.reshape(1, -1), frames, aggregate=np.mean)[0]
    thr = 0.055 * float(np.percentile(rms_b, 95)) if rms_b.size else 0.0
    silent = rms_b < thr

    def sync(feats, agg):
        return librosa.util.sync(feats, frames, aggregate=agg)

    Cb = sync(C, np.median)
    Bb = sync(B, np.median)

    def norm_cols(m):
        out = m.astype(float).copy()
        nn = np.linalg.norm(out, axis=0, keepdims=True)
        nn[nn < 1e-9] = 1.0
        return out / nn

    Cb = norm_cols(np.log1p(3.0 * np.maximum(Cb, 0.0)))
    for j in range(Cb.shape[1]):     # keep the top-5 pitch classes
        idx = np.argsort(Cb[:, j])[::-1]
        Cb[idx[5:], j] = 0.0
    Cb = norm_cols(Cb)
    Bb = norm_cols(np.log1p(3.0 * np.maximum(Bb, 0.0)))

    return dict(y=y, y_h=y_h, sr=sr, dur=dur, tuning=tuning, bars=bars,
                period=period, bpb=bpb, Cb=Cb, Bb=Bb, silent=silent, C=C,
                bar_frames=frames)


def emissions_for_key(F, key):
    """Per-bar emission matrix: template softmax x kind weight x bass bonus
    x key prior, plus silence gating."""
    Cb, Bb, sil = F["Cb"], F["Bb"], F["silent"]
    n_bars = Cb.shape[1]
    silent_cols = np.zeros(n_bars, dtype=bool)
    m = min(len(sil), n_bars)
    silent_cols[:m] = sil[:m]
    Tn = _templates_norm()
    corr = np.clip(Tn @ Cb, 0.0, 1.0)
    # softmax over templates per bar: emission = how much better this chord
    # is than the alternatives in THIS bar (contrast, not absolute fit)
    e = np.exp(SOFTMAX_Z * (corr - corr.max(axis=0, keepdims=True)))
    em = e / e.sum(axis=0, keepdims=True)
    bmax = Bb.max(axis=0, keepdims=True)
    bmax[bmax < 1e-9] = 1.0
    bs = Bb / bmax
    A = np.full((len(LABELS), n_bars), 0.50)
    for i, lab in enumerate(LABELS):
        pc, suf = chord_parse(lab)
        if pc is None:
            continue
        hit = bs[pc]
        fifth = 0.88 * bs[(pc + 7) % 12]
        third_pc = (pc + 3) % 12 if suf[:1] == "m" else (pc + 4) % 12
        third = 0.66 * bs[third_pc]
        A[i] = 0.50 + 0.50 * np.maximum(hit, np.maximum(fifth, third))
    em = em * WEIGHTS[:, None] * A
    if key is not None:
        mask = key_chord_mask(key[0], key[1])
        em[~mask, :] *= KEY_PENALTY
    em[N_IDX, ~silent_cols] = 1e-9
    em[:N_IDX, silent_cols] = 1e-9
    return em, corr


def viterbi(em, stay=STAY):
    """Viterbi decoding with shared move cost (log domain)."""
    n_states, n_frames = em.shape
    logem = np.log(np.maximum(em, 1e-12))
    log_stay, log_move = math.log(stay), math.log(1.0 - stay)
    dp = logem[:, 0].copy()
    back = np.zeros((n_states, n_frames), dtype=np.int32)
    for t in range(1, n_frames):
        stay_score = dp + log_stay
        move_score = dp.max() + log_move
        switch = move_score > stay_score
        back[:, t] = np.where(switch, dp.argmax(), np.arange(n_states))
        dp = np.where(switch, move_score, stay_score) + logem[:, t]
    path = np.zeros(n_frames, dtype=np.int32)
    path[-1] = int(dp.argmax())
    for t in range(n_frames - 1, 0, -1):
        path[t - 1] = back[path[t], t]
    return path


def bass_root_agreement_bars(F, path):
    """Fraction of musical bars whose strongest bass pitch class matches the
    decoded chord root (or fifth)."""
    Bb = F["Bb"]
    bmax = Bb.max(axis=0, keepdims=True)
    bmax[bmax < 1e-9] = 1.0
    bs = Bb / bmax
    n_bars = len(path)
    silent_cols = np.zeros(n_bars, dtype=bool)
    m = min(len(F["silent"]), n_bars)
    silent_cols[:m] = F["silent"][:m]
    ok, tot = 0, 0
    for i, st in enumerate(path):
        if silent_cols[i]:
            continue
        lab = LABELS[st]
        if lab == "N":
            continue
        pc, _ = chord_parse(lab)
        if pc is None:
            continue
        v = bs[:, i]
        tot += 1
        if v.max() > 0.25 and v.argmax() in (pc, (pc + 7) % 12):
            ok += 1
    return (ok / tot) if tot else 0.0


def decode_with_keys(F):
    """Run Viterbi under every candidate key (+ unconstrained); keep all
    candidate decodings for the ensemble."""
    keys = [None] + [(NOTES[r], mo) for r in range(12) for mo in ("major", "minor")]
    cands = []
    for key in keys:
        em, corr = emissions_for_key(F, key)
        path = viterbi(em, stay=STAY)
        n_bars = len(path)
        fit = float(np.mean([corr[path[i], i] for i in range(n_bars)]))
        bass = bass_root_agreement_bars(F, path)
        score = 0.55 * fit + 0.45 * bass
        cands.append({"key": key, "path": path, "fit": fit, "bass": bass,
                      "score": score, "corr": corr})
    return cands


def path_to_segments(F, path):
    """Turn a bar-level chord path into time segments."""
    bars, dur = F["bars"], F["dur"]
    raw = []
    for i, st in enumerate(path):
        lab = LABELS[st]
        a = float(bars[i]) if i < len(bars) else dur
        b = float(bars[i + 1]) if i + 1 < len(bars) else dur
        if raw and raw[-1]["chord"] == lab:
            raw[-1]["end"] = b
        else:
            raw.append({"chord": lab, "start": a, "end": b})
    min_len = float(np.clip(1.1 * F["period"], MIN_SEG, 1.7))
    return fold_short(raw, min_len)


def quality_simplify(segments, F):
    """Two guards against seventh-chord decoys:
    1. a 7th chord lasting >= 8 s is almost never real (dominant 7ths
       resolve within a bar or two) -> demote to its triad;
    2. a short 7th whose 7th tone is weakly present -> demote."""
    Cb = F["Cb"]
    bars = F["bars"]

    def bar_span_idx(a, b):
        n = Cb.shape[1]
        i0 = max(0, int(np.searchsorted(bars, a, side="right") - 1))
        i1 = min(n - 1, int(np.searchsorted(bars, b, side="left") - 1))
        return i0, max(i0, i1)

    out = []
    for s in segments:
        lab = s["chord"]
        pc, suf = chord_parse(lab)
        if pc is not None and suf in ("7", "m7"):
            dur7 = s["end"] - s["start"]
            demote = dur7 >= 8.0
            if not demote:
                i0, i1 = bar_span_idx(s["start"], s["end"])
                v = Cb[:, i0:i1 + 1].mean(axis=1)
                if v.max() > 1e-9:
                    v = v / v.max()
                seventh = (pc + 10) % 12
                if v[seventh] < 0.55 or v[seventh] < 0.75 * v[pc]:
                    demote = True
            if demote:
                s = dict(s)
                s["chord"] = NOTES[pc] + ("m" if suf == "m7" else "")
        out.append(s)
    # merge consecutive duplicates created by the demotion
    merged = []
    for s in out:
        if merged and merged[-1]["chord"] == s["chord"] and \
                abs(merged[-1]["end"] - s["start"]) < 0.25:
            merged[-1]["end"] = s["end"]
        else:
            merged.append(s)
    return merged


def pool_repeats(F, path):
    """Second pass: bars inside near-identical repeated passages are
    re-decided on the POOLED chroma of all occurrences, so a chorus cannot
    change chords when it returns."""
    Cb = F["Cb"]
    n_bars = Cb.shape[1]
    seq = [LABELS[s] for s in path]
    # find repeated sub-sequences of >= 6 bars
    best_pairs = []
    L = len(seq)
    max_len = L // 2
    for length in range(min(32, max_len), 5, -1):
        seen = {}
        for i in range(L - length + 1):
            key = tuple(seq[i:i + length])
            if key.count("N") > length // 3:
                continue
            if key in seen:
                for j in seen[key]:
                    if j + length <= i or i + length <= j:
                        va = Cb[:, i:i + length]
                        vb = Cb[:, j:j + length]
                        ca, cb = va.mean(axis=1), vb.mean(axis=1)
                        na, nb = np.linalg.norm(ca), np.linalg.norm(cb)
                        if na < 1e-9 or nb < 1e-9:
                            continue
                        sim = float(np.dot(ca / na, cb / nb))
                        if sim >= 0.90:
                            best_pairs.append((i, j, length, sim))
                            break
                else:
                    seen[key].append(i)
                if len(best_pairs) >= 12:
                    break
            else:
                seen[key] = [i]
        if best_pairs:
            break
    if not best_pairs:
        return path
    # pool: for each pair of aligned runs, re-decide disagreeing bars on
    # the pooled chroma (argmax of pooled softmax emission, in-key first)
    newpath = np.array(path, dtype=np.int32)
    for (i, j, length, _sim) in best_pairs:
        for k in range(length):
            a, b = i + k, j + k
            if newpath[a] == newpath[b]:
                continue
            va = Cb[:, a]
            vb = Cb[:, b]
            vp = (va + vb) / 2.0
            nv = np.linalg.norm(vp)
            if nv < 1e-9:
                continue
            vp = vp / nv
            corr_pool = _templates_norm() @ vp
            # candidates: the two assigned chords; winner = better pooled fit
            ca, cb = newpath[a], newpath[b]
            if corr_pool[ca] >= corr_pool[cb]:
                newpath[b] = ca
            else:
                newpath[a] = cb
    return newpath.tolist()


def primary_engine(path):
    """Wide-band chroma + bar Viterbi + key competition + repeat pooling.
    Returns (segments, key, confidence, F)."""
    F = prepare_features(path)
    cands = decode_with_keys(F)
    best = max(cands, key=lambda c: c["score"])
    path2 = pool_repeats(F, best["path"])
    segs = path_to_segments(F, path2)
    segs = dedupe_and_cover(quality_simplify(segs, F), F["dur"])
    # key: constrained winner wins as-is; free winner derives key from chords
    if best["key"] is not None:
        key = {"tonic": best["key"][0], "mode": best["key"][1],
               "confidence": round(best["score"], 3),
               "tonicFa": NOTE_FA[best["key"][0]],
               "modeFa": "ماژور" if best["key"][1] == "major" else "مینور"}
    else:
        key = (pick_key([key_from_chords(segs), best_key_overall(segs)], segs)
               or best_key_overall(segs))
    conf = round(float(np.clip(0.5 * best["fit"] + 0.5 * best["bass"], 0, 1)), 3)
    return segs, key, conf, F


# ----------------------------------------------------------------------
# Secondary engine (cross-check): Essentia HPCP
# ----------------------------------------------------------------------

def essentia_chords(path):
    """Essentia HPCP + ChordsDetection (native); sanity-fixed against the
    bar chroma and key. Returns (segments, confidence, key_or_None) or None."""
    try:
        import essentia
        import essentia.standard as es
    except Exception:
        return None

    try:
        audio = es.MonoLoader(filename=path, sampleRate=SR)()
    except Exception:
        return None
    if len(audio) < SR * 4:
        return None

    try:
        tuning = float(np.clip(librosa.estimate_tuning(y=audio, sr=SR),
                               -0.45, 0.45))
    except Exception:
        tuning = 0.0

    w = es.Windowing(type="blackmanharris92")
    spectrum = es.Spectrum(size=8192)
    peaks = es.SpectralPeaks(minFrequency=55, maxFrequency=5000,
                             magnitudeThreshold=0.00001, maxPeaks=120)
    hpcp = es.HPCP(size=36, referenceFrequency=440.0 * (2.0 ** (tuning / 12.0)),
                   bandPreset=True, bandSplitFrequency=500)
    pool = essentia.Pool()
    for frame in es.FrameGenerator(audio, frameSize=8192, hopSize=HOP,
                                   startFromZero=True):
        spec = spectrum(w(frame))
        freqs, mags = peaks(spec)
        pool.add("hpcp", hpcp(freqs, mags))

    hpcp_matrix = pool["hpcp"]
    if isinstance(hpcp_matrix, np.ndarray):
        hpcp_matrix = hpcp_matrix.tolist()
    if not hpcp_matrix:
        return None

    duration = len(audio) / SR

    chords_f, strengths_f = es.ChordsDetection(hopSize=HOP, sampleRate=SR,
                                               windowSize=3.0)(hpcp_matrix)
    dt = HOP / SR
    segs_f = []
    for i, c in enumerate(chords_f):
        lab = normalize_label(str(c))
        if segs_f and segs_f[-1]["chord"] == lab:
            segs_f[-1]["end"] = min((i + 1) * dt, duration)
        else:
            segs_f.append({"chord": lab, "start": i * dt,
                           "end": min((i + 1) * dt, duration)})
    if not segs_f:
        return None
    min_len = 1.2
    segs = fold_short(segs_f, min_len)

    key_info = None
    try:
        kt, ks, kstrength = es.KeyExtractor()(audio)
        key_info = {"tonic": str(kt), "mode": str(ks),
                    "confidence": round(float(kstrength), 3),
                    "tonicFa": NOTE_FA.get(str(kt), str(kt)),
                    "modeFa": "ماژور" if str(ks) == "major" else "مینور"}
    except Exception:
        key_info = None

    confidence = 0.0
    if len(strengths_f):
        confidence = round(min(max(float(np.mean(np.asarray(
            strengths_f, dtype=float))), 0.0), 1.0), 3)

    return (segs, confidence, key_info)


# ----------------------------------------------------------------------
# Composite arbitration
# ----------------------------------------------------------------------

def bass_root_agreement(segments, Bn, grid_start, grid_end):
    """Duration-weighted fraction of chord time whose strongest bass pitch
    class is the chord root (or its fifth)."""
    n_cells = Bn.shape[1]
    total, hit = 0.0, 0.0
    for s in segments:
        if s["chord"] == "N":
            continue
        pc, _suf = chord_parse(s["chord"])
        if pc is None:
            continue
        i0 = max(0, int(np.searchsorted(grid_start, s["start"], side="right") - 1))
        i1 = int(np.searchsorted(grid_start, s["end"], side="left"))
        i0, i1 = max(0, i0), min(n_cells, max(i1, i0 + 1))
        v = Bn[:, i0:i1].mean(axis=1)
        if v.max() < 1e-9:
            continue
        bass_pc = int(np.argmax(v))
        total += s["end"] - s["start"]
        if bass_pc == pc or bass_pc == (pc + 7) % 12:
            hit += s["end"] - s["start"]
    return (hit / total) if total > 1e-6 else 0.0


def fit_margin_score(segments, C, grid_start, grid_end):
    """Duration-weighted template-fit quality of the chosen labels."""
    total, acc = 0.0, 0.0
    for s in segments:
        if s["chord"] == "N":
            continue
        v = span_chroma(C, grid_start, grid_end, s["start"], s["end"])
        if v is None:
            continue
        acc += (s["end"] - s["start"]) * max(template_fit(v, s["chord"]), 0.0)
        total += s["end"] - s["start"]
    return (acc / total) if total > 1e-6 else 0.0


def composite_score(segments, key, C, Bn, grid_start, grid_end):
    cov = 0.0
    if key:
        try:
            cov = key_compatibility(segments, key["tonic"], key["mode"])
        except Exception:
            cov = 0.0
    bass = bass_root_agreement(segments, Bn, grid_start, grid_end)
    fit = fit_margin_score(segments, C, grid_start, grid_end)
    return 0.50 * cov + 0.30 * bass + 0.20 * fit


def chroma_sanity_relabel(segments, C, grid_start, grid_end, key,
                          min_margin=0.12):
    """Second look at every segment using the bar chroma; relabels only
    when a clearly better in-key alternative exists."""
    if not key or C is None or not len(segments):
        return segments
    try:
        mask = key_chord_mask(key["tonic"], key["mode"])
    except Exception:
        return segments
    Tn = _templates_norm()
    lab_in_key = {lab: bool(mask[i]) for i, lab in enumerate(LABELS)}
    cand_idx = [i for i, lab in enumerate(LABELS) if lab != "N"]
    cand_T = Tn[cand_idx]
    n_cells = C.shape[1]
    out = []
    for s in segments:
        lab = s["chord"]
        if lab == "N":
            out.append(s)
            continue
        sel = np.array([(grid_end[i] > s["start"] and grid_start[i] < s["end"])
                        for i in range(n_cells)], dtype=bool)
        if not sel.any():
            mid = 0.5 * (float(s["start"]) + float(s["end"]))
            idx = int(np.searchsorted(grid_start, mid)) - 1
            idx = max(0, min(idx, n_cells - 1))
            sel[idx] = True
        v = C[:, sel].mean(axis=1)
        nv = np.linalg.norm(v)
        if nv < 1e-9:
            out.append(s)
            continue
        v = v / nv
        corr = cand_T @ v
        j = int(np.argmax(corr))
        corr_i = cand_idx[j]
        best_lab, best_c = LABELS[corr_i], float(corr[j])
        if best_c < 0.30:
            out.append(s)
            continue
        try:
            cur_c = float(Tn[LABELS.index(lab)] @ v)
        except ValueError:
            cur_c = -1.0
        new_lab = lab
        if best_lab != lab and best_c - cur_c >= min_margin:
            if lab_in_key.get(best_lab) and not lab_in_key.get(lab, True):
                new_lab = best_lab
            elif lab_in_key.get(best_lab) and cur_c < 0.55:
                new_lab = best_lab
        if new_lab != lab:
            out.append({"chord": new_lab, "start": s["start"], "end": s["end"]})
        else:
            out.append(s)
    return out


def relabel_to_key(segments, key, Bn, grid_start, grid_end):
    """Pull out-of-key chords back into the key (root-preserving first)."""
    if not key:
        return segments
    mask = key_chord_mask(key["tonic"], key["mode"])

    def in_key(lab):
        try:
            return bool(mask[LABELS.index(lab)])
        except ValueError:
            return False

    ti = NOTES.index(key["tonic"])
    if key["mode"] == "major":
        pref = {0: "maj", 2: "min", 4: "min", 5: "maj", 7: "maj", 9: "min"}
    else:
        pref = {0: "min", 3: "maj", 5: "min", 7: "maj", 8: "maj", 10: "maj"}

    n_cells = Bn.shape[1]

    def bass_support(pc, a, b):
        i0 = max(0, int(np.searchsorted(grid_start, a, side="right") - 1))
        i1 = int(np.searchsorted(grid_start, b, side="left"))
        i0, i1 = max(0, i0), min(n_cells, max(i1, i0 + 1))
        return float(Bn[pc, i0:i1].max()) if i1 > i0 else 0.0

    out = []
    for s in segments:
        lab = s["chord"]
        if lab == "N" or in_key(lab):
            out.append(s)
            continue
        root, _suf = chord_parse(lab)
        newlab = None
        if root is not None:
            st = (root - ti) % 12
            if st in pref:
                cand = NOTES[root] + ("" if pref[st] == "maj" else "m")
                if in_key(cand):
                    newlab = cand
        if newlab is None:
            best, bestsup = None, -1.0
            for st2, q2 in pref.items():
                r2 = (ti + st2) % 12
                sup = bass_support(r2, s["start"], s["end"])
                if sup > bestsup:
                    bestsup, best = sup, NOTES[r2] + ("" if q2 == "maj" else "m")
            newlab = best
        s = dict(s)
        s["chord"] = newlab
        out.append(s)
    merged = []
    for s in out:
        if merged and merged[-1]["chord"] == s["chord"]:
            merged[-1]["end"] = s["end"]
        else:
            merged.append(s)
    return merged


# ----------------------------------------------------------------------
# Primary engine (v6): deep ChordNet ensemble on the bar grid
# ----------------------------------------------------------------------

def deep_engine(path):
    """ChordNet 5-fold ensemble + XHMM + bar-grid key-constrained decode.
    Returns (segments, key, confidence, F)."""
    from chordnet import engine as de

    y, sr = librosa.load(path, sr=SR, mono=True, res_type="kaiser_fast")
    dur = float(len(y) / sr)
    if dur < 4:
        fail("فایل صوتی خیلی کوتاه است (حداقل ۴ ثانیه).")
    if dur > 900:
        y = y[: int(900 * sr)]
        dur = 900.0

    bars, period, bpb = bar_grid(y, sr, dur)
    if bars is None:
        bars = np.arange(0.0, dur, 2.0)
        period, bpb = 0.5, 4

    # per-bar silence map (plain RMS floor)
    rms = librosa.feature.rms(y=y, hop_length=HOP)[0]
    fr_t = librosa.frames_to_time(np.arange(len(rms)), sr=sr, hop_length=HOP)
    n_bars = len(bars)
    idx = np.clip(np.searchsorted(bars, fr_t, side="right") - 1,
                  0, max(n_bars - 1, 0))
    cnt = np.maximum(np.bincount(idx, minlength=n_bars), 1)
    bar_rms = np.bincount(idx, weights=rms, minlength=n_bars) / cnt
    thr = 0.06 * float(np.percentile(bar_rms, 95)) if bar_rms.size else 0.0
    silent = bar_rms < thr if bar_rms.size else np.zeros(n_bars, dtype=bool)

    segs, key, conf, bar_chroma = de.analyze_deep(y, dur, bars, silent)

    min_len = float(np.clip(1.1 * period, MIN_SEG, 1.7))
    segs = dedupe_and_cover(absorb_short_N(fold_short(segs, min_len), dur),
                            dur)
    segs = dedupe_and_cover(quality_simplify(segs, F_lite(bars, bar_chroma,
                                                          period, dur)),
                            dur)

    F = {"dur": dur, "tuning": 0.0, "bars": bars, "period": period,
         "bpb": bpb, "Cb": bar_chroma, "Bb": np.ones((12, 1)) / 12.0,
         "silent": silent, "C": bar_chroma, "y_h": y, "y": y, "sr": sr,
         "bar_frames": np.array([0])}
    return segs, key, conf, F


def F_lite(bars, Cb, period, dur):
    """Minimal feature dict for quality_simplify()."""
    return {"Cb": Cb, "bars": np.asarray(bars, dtype=float), "period": period,
            "dur": dur}


# ----------------------------------------------------------------------
# Main analysis
# ----------------------------------------------------------------------

def analyze(path):
    # ---------- 0. deep engine (v6 primary) ----------
    deep_ok = False
    try:
        segs_p, key_p, conf_p, F = deep_engine(path)
        deep_ok = True
        segments, key, engine, confidence = \
            segs_p, key_p, "v6-chordnet", conf_p
    except SystemExit:
        raise
    except Exception:
        deep_ok = False

    # ---------- 1. v5 fallback ----------
    if not deep_ok:
        try:
            segs_p, key_p, conf_p, F = primary_engine(path)
        except SystemExit:
            raise
        except Exception:
            # last-resort fallback: essentia native decoding
            ess = essentia_chords(path)
            if ess is None:
                fail("نتوانستم آکوردهای این فایل را تشخیص بدهم.")
            ess_segs, ess_conf, ess_key = ess
            y, sr = librosa.load(path, sr=SR, mono=True, res_type="kaiser_fast")
            F = {"dur": float(len(y) / sr), "tuning": 0.0,
                 "bars": np.arange(0.0, len(y) / sr, 2.0),
                 "period": 0.5, "bpb": 4, "Cb": np.ones((12, 1)) / 12.0,
                 "Bb": np.ones((12, 1)) / 12.0, "silent": np.zeros(1, dtype=bool),
                 "C": np.ones((12, 1)) / 12.0, "y_h": y, "y": y, "sr": sr,
                 "bar_frames": np.array([0])}
            segs_p, key_p, conf_p = ess_segs, ess_key, ess_conf
        segments, key, engine, confidence = \
            segs_p, key_p, "v5-wideband-barviterbi", conf_p

    dur = F["dur"]
    tuning = F["tuning"]

    # bar-level grid arrays for post-processing helpers
    bars = F["bars"]
    grid_start = np.array(list(bars) + [dur], dtype=float)
    grid_end = np.array(list(bars[1:]) + [dur], dtype=float)
    if grid_end.shape[0] < grid_start.shape[0]:
        grid_end = np.append(grid_end, dur)

    C = F["Cb"]
    Bn = F["Bb"]
    period = F["period"]
    if C is not None and C.size > 12:
        key = refine_key(key, segments, C.mean(axis=1))
    else:
        key = key or {"tonic": "C", "mode": "major", "confidence": 0.0,
                      "tonicFa": "دو", "modeFa": "ماژور"}

    # ---------- 3. post passes ----------
    segments = dedupe_and_cover(absorb_short_N(segments, dur), dur)

    # ---------- 4. sections ----------
    n_beats = C.shape[1]
    if dur <= 45:
        k = max(2, min(4, int(round(dur / 15))))
    else:
        k = max(3, min(9, int(round(dur / 28))))
    try:
        bnds = librosa.segment.agglomerative(C, k)
    except Exception:
        bnds = np.array([], dtype=int)
    bnds = sorted(set(int(b) for b in np.atleast_1d(bnds) if 0 < b < n_beats))

    min_sec = max(8.0, dur / 24.0)
    bar_len = period * F["bpb"]
    min_cells = max(2, int(round(min_sec / max(bar_len, 0.5))))
    while bnds:
        ext = [0] + bnds + [n_beats]
        gaps = np.diff(ext)
        i = int(np.argmin(gaps))
        if gaps[i] >= min_cells:
            break
        drop = ext[i + 1] if 0 < ext[i + 1] < n_beats else ext[i]
        if drop not in bnds:
            break
        bnds.remove(drop)
    bnds = sorted(set([0] + bnds + [n_beats]))

    # harmonize repeated sections (same section -> same chords)
    # v6 note: the deep engine already decodes under one key with a strong
    # model; the v5 label-vocabulary matcher below would corrupt its
    # maj7/slash labels, so it runs on the v5 fallback output only.
    try:
        sec_ranges = []
        for si in range(len(bnds) - 1):
            a, b = bnds[si], bnds[si + 1]
            if b - a < 2:
                continue
            sec_ranges.append((float(grid_start[a]), float(grid_end[b - 1]),
                               C[:, a:b].mean(axis=1)))
        if sec_ranges and key and engine.startswith("v5"):
            segments = dedupe_and_cover(
                harmonize_repeats(sec_ranges, segments, C, grid_start,
                                  grid_end, key), dur)
    except Exception:
        pass

    sections = []
    chromas_for_letters = []
    for si in range(len(bnds) - 1):
        a, b = bnds[si], bnds[si + 1]
        if b - a < 2:
            continue
        start_t = float(grid_start[a])
        end_t = float(grid_end[b - 1])
        raw = [s for s in segments if s["end"] > start_t + 1e-4 and s["start"] < end_t - 1e-4]
        if not raw:
            continue
        clipped = [{"chord": s["chord"],
                    "start": float(max(s["start"], start_t)),
                    "end": float(min(s["end"], end_t))} for s in raw]
        prog = []
        for s in clipped:
            if s["chord"] != "N" and (not prog or prog[-1] != s["chord"]):
                prog.append(s["chord"])
        chromas_for_letters.append(C[:, a:b].mean(axis=1))
        sections.append({"id": len(sections) + 1, "label": "", "start": start_t,
                         "end": end_t, "segments": clipped, "progression": prog})
    if not sections:
        prog = []
        for s in segments:
            if s["chord"] != "N" and (not prog or prog[-1] != s["chord"]):
                prog.append(s["chord"])
        chromas_for_letters.append(F["C"].mean(axis=1))
        sections.append({"id": 1, "label": "", "start": 0.0, "end": dur,
                         "segments": segments, "progression": prog})

    letters_idx = assign_section_labels(chromas_for_letters)
    for sec, li in zip(sections, letters_idx):
        sec["label"] = chr(ord("A") + li % 26)
        sec["color"] = SECTION_COLORS[li % len(SECTION_COLORS)]

    for i, sec in enumerate(sections):
        sec["id"] = i + 1

    # ---------- chord usage ----------
    usage = {}
    for s in segments:
        if s["chord"] == "N":
            continue
        usage[s["chord"]] = usage.get(s["chord"], 0.0) + (s["end"] - s["start"])
    total = sum(usage.values()) or 1.0
    chord_seconds = sorted(
        [{"chord": c, "seconds": round(v, 1), "percent": round(100 * v / total, 1)}
         for c, v in usage.items()],
        key=lambda x: -x["seconds"])

    # ---------- reader-friendly spelling ----------
    use_flats = (
        (key.get("mode") == "minor" and key.get("tonic") in _FLAT_KEY_MINOR)
        or (key.get("mode") == "major" and key.get("tonic") in _FLAT_KEY_MAJOR)
    )
    if use_flats:
        key["tonic"] = _SHARP_TO_FLAT.get(key["tonic"], key["tonic"])
        key["tonicFa"] = NOTE_FA.get(key["tonic"], key["tonic"])
        for s in segments:
            s["chord"] = respell_for_key(s["chord"], True)
        for sec in sections:
            for s in sec.get("segments", []):
                s["chord"] = respell_for_key(s["chord"], True)
            sec["progression"] = [respell_for_key(c, True)
                                  for c in sec.get("progression", [])]
        for cs in chord_seconds:
            cs["chord"] = respell_for_key(cs["chord"], True)

    tempo_out = round(60.0 / F["period"], 1)

    return {
        "ok": True,
        "engine": engine,
        "tuning": round(float(tuning), 3),
        "duration": round(dur, 2),
        "tempo": tempo_out,
        "key": key,
        "confidence": confidence,
        "sections": sections,
        "segments": segments,
        "chordSeconds": chord_seconds,
    }


def main():
    if len(sys.argv) < 2:
        fail("مسیر فایل صوتی داده نشده است.")
    result = analyze(sys.argv[1])
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception as e:
        fail(f"خطای پردازش: {type(e).__name__}: {e}")
