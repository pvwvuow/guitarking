#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — Chord detection engine (v3)
========================================
Detects the chords of every section of a song.

Primary pipeline (research-grade, robust to dense vocal mixes):
  1. Load audio (mono, 22050 Hz)
  2. Essentia: SpectralPeaks -> HPCP chroma
  3. Beat ticks via RhythmExtractor2013 -> ChordsDetectionBeats
     (beat-synchronised chord estimation is markedly more stable on
      rhythmic pop than frame-level ChordsDetection; frame-level is
      kept as an internal fallback)
  4. Key via Essentia KeyExtractor, cross-checked against the
     chord-evidence key (Krumhansl-Schmuckler on duration-weighted
     chord roots) — the chord-derived key is reported when available
  5. Beat-aware segment folding: blips shorter than ~1 beat are merged
     into their *longer* neighbour; true silence only -> "N"

Fallback pipeline (if Essentia is unavailable):
  1. librosa harmonic/percussive separation
  2. CQT chroma + bass chroma, beat-anchored grid, log-compressed
     sparsified chroma (top-3 pitch classes), TWO-PASS Viterbi:
     pass 1 unconstrained -> chord-evidence key -> pass 2 with a soft
     diatonic penalty that pulls outliers back into the key
  3. Duration-weighted template-match confidence (was 0 before)

Shared post-processing:
  - merge tiny segments, structural segmentation (A/B/C sections),
    chord usage statistics

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
}

# Krumhansl-Kessler key profiles
KMAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KMIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])

SECTION_COLORS = ["#f59e0b", "#f43f5e", "#10b981", "#a855f7", "#f97316",
                  "#14b8a6", "#84cc16", "#ec4899"]

MIN_SEG = 0.8      # seconds; absolute floor for a chord segment
KEY_PENALTY = 0.42 # emission multiplier for out-of-key chords (fallback path)
BASS_MIX = 0.40    # bass-chroma share in the fallback feature mix


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
    """Key from duration-weighted chord roots/thirds (more grounded than
    raw chroma: it is consistent with the chords we actually report)."""
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


def key_compatibility(segments, tonic, mode):
    """Fraction of chord-time whose chords are diatonic in (tonic, mode).
    Used to arbitrate between candidate keys: the key that explains the
    detected chords best wins."""
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


def pick_key(candidates, segments):
    """Choose the key that best explains the detected chords.
    candidates: list of key dicts (earlier = higher prior: wins ties)."""
    best, best_score = None, -1.0
    for k in candidates:
        if not k:
            continue
        score = key_compatibility(segments, k["tonic"], k["mode"])
        if score > best_score:
            best, best_score = k, score
    return best


def key_chord_mask(tonic, mode):
    """Boolean mask over TEMPLATES labels: chords that belong to the key."""
    ti = NOTES.index(tonic)
    allowed = set()
    if mode == "major":
        # I ii iii IV V vi  (+V7)
        for st in (0, 5, 7):
            allowed.add(NOTES[(ti + st) % 12])
            allowed.add(NOTES[(ti + st) % 12] + "7")
        for st in (2, 4, 9):
            allowed.add(NOTES[(ti + st) % 12] + "m")
            allowed.add(NOTES[(ti + st) % 12] + "m7")
    else:
        # i iv v (+V, V7) III VI VII
        for st in (0, 5):
            allowed.add(NOTES[(ti + st) % 12] + "m")
            allowed.add(NOTES[(ti + st) % 12] + "m7")
        for st in (3, 8, 10):
            allowed.add(NOTES[(ti + st) % 12])
            allowed.add(NOTES[(ti + st) % 12] + "7")
        allowed.add(NOTES[(ti + 7) % 12])
        allowed.add(NOTES[(ti + 7) % 12] + "m")
    mask = np.array([lab in allowed for lab in LABELS], dtype=bool)
    mask[LABELS.index("N")] = True
    return mask


# ----------------------------------------------------------------------
# Fallback template machinery (librosa path)
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
    for r in range(12):  # major 7th
        add([r, (r + 4) % 12, (r + 7) % 12, (r + 11) % 12], NOTES[r] + "maj7", "maj7")
    for r in range(12):  # minor 7th
        add([r, (r + 3) % 12, (r + 7) % 12, (r + 10) % 12], NOTES[r] + "m7", "min7")
    T.append(np.ones(12) / math.sqrt(12))
    labels.append("N")
    kinds.append("N")

    # On dense (vocal/pad-heavy) chroma, 4-note templates always out-correlate
    # 3-note ones, so 7th chords need a strong penalty to stay exceptions.
    kind_w = {"maj": 1.0, "min": 1.0, "dom7": 0.72, "maj7": 0.70, "min7": 0.70,
              "N": 1.0}
    return np.array(T), labels, np.array([kind_w[k] for k in kinds])


TEMPLATES, LABELS, WEIGHTS = build_templates()


def bass_chroma(y, sr):
    """Chroma computed only from low frequencies (bass emphasis)."""
    n_fft = 8192
    S = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=HOP))
    freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
    mask = (freqs > 40) & (freqs <= 280)  # bass register
    Sb = S[mask]
    fb = freqs[mask]
    midi = 69 + 12 * np.log2(np.maximum(fb, 1e-6) / 440.0)
    pcs = np.mod(np.round(midi).astype(int), 12)
    bc = np.zeros((12, Sb.shape[1]))
    for p in range(12):
        bc[p] = Sb[pcs == p].sum(axis=0)
    return bc


def viterbi(emissions, stay=0.88, gamma=4.0):
    """Viterbi decoding with self-transition bias."""
    n_states, n_frames = emissions.shape
    E = np.power(np.maximum(emissions, 1e-6), gamma)
    E = E / E.sum(axis=0, keepdims=True)
    logem = np.log(E)
    log_stay = math.log(stay)
    log_move = math.log(1.0 - stay)

    dp = logem[:, 0].copy()
    back = np.zeros((n_states, n_frames), dtype=np.int32)

    for t in range(1, n_frames):
        best_prev = dp.argmax()
        stay_score = dp + log_stay
        move_score = dp[best_prev] + log_move
        switch_better = move_score > stay_score
        dp_new = np.where(switch_better, move_score, stay_score) + logem[:, t]
        back[:, t] = np.where(switch_better, best_prev, np.arange(n_states))
        dp = dp_new

    path = np.zeros(n_frames, dtype=np.int32)
    path[-1] = int(dp.argmax())
    for t in range(n_frames - 1, 0, -1):
        path[t - 1] = back[path[t], t]
    return path


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


# ----------------------------------------------------------------------
# Shared segment utilities
# ----------------------------------------------------------------------

def fold_short(segments, min_len):
    """Fold segments shorter than min_len into their *longer* neighbour
    (the old code always folded into the previous one, even a 0.5s blip
    of its own — that amplified flicker instead of smoothing it)."""
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


# ----------------------------------------------------------------------
# Chord engines
# ----------------------------------------------------------------------

def essentia_chords(path):
    """Primary engine: Essentia HPCP + ChordsDetectionBeats.

    Returns (segments, confidence, key_info_or_None, audio, beat_period) or
    None on failure. segments: list of {"chord","start","end"} covering
    [0, duration].
    """
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

    w = es.Windowing(type="blackmanharris92")
    spectrum = es.Spectrum(size=8192)
    peaks = es.SpectralPeaks(minFrequency=55, maxFrequency=5000,
                             magnitudeThreshold=0.00001, maxPeaks=120)
    hpcp = es.HPCP(size=36, referenceFrequency=440, bandPreset=True,
                   bandSplitFrequency=500)
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

    # ---- beat ticks (for ChordsDetectionBeats + beat-aware folding) ----
    # NOTE: RhythmExtractor2013 in essentia 2.1b6 truncates its tick list
    # mid-song on some files, so derive beats with librosa's tracker instead.
    ticks = None
    try:
        tempo_est, beat_frames = librosa.beat.beat_track(y=audio, sr=SR,
                                                         hop_length=HOP)
        bt = librosa.frames_to_time(np.atleast_1d(beat_frames), sr=SR,
                                    hop_length=HOP)
        ticks = [float(b) for b in bt if 0.0 <= float(b) < duration]
        if len(ticks) < 8:
            ticks = None
    except Exception:
        ticks = None

    # beat period for folding
    beat_period = 0.5
    if ticks and len(ticks) >= 8:
        diffs = np.diff(ticks)
        diffs = diffs[(diffs > 0.15) & (diffs < 2.0)]
        if len(diffs):
            beat_period = float(np.median(diffs))
    min_len = float(np.clip(1.1 * beat_period, MIN_SEG, 1.7))

    # ---- candidate 1: one chord per bar (beat-synchronised) ----
    cand = []  # (segments, strengths, kind)
    if ticks:
        # extend the beat grid through the intro (beat trackers often find
        # no beats before the drums enter) and past the last tick, so the
        # head/tail of the song get chord estimates too
        ext = list(ticks)
        step = max(beat_period, 0.2)
        k = int(math.floor(ticks[0] / step))
        if 0 < k < 200:
            ext = [round(ticks[0] - step * i, 3) for i in range(k, 0, -1)] + ext
        last = ticks[-1]
        guard = 0
        while duration - last > step and guard < 600:
            last += step
            guard += 1
            ext.append(round(last, 3))
        # one chord per BEAT is too jumpy (a single ~0.5 s window is very
        # noisy); one chord per BAR (every 4th beat) matches the harmonic
        # rate of pop music
        det = (ext[::4] if len(ext) >= 24
               else (ext[::2] if len(ext) >= 12 else ext))
        if det and det[0] > 1e-3:
            det = [0.0] + det
        try:
            chords_b, strengths_b = es.ChordsDetectionBeats(
                hopSize=HOP, sampleRate=SR,
                chromaPick="interbeat_median")(hpcp_matrix, det)
            # per docs: chord i describes the interval [det[i], det[i+1])
            segs_b = []
            for i, c in enumerate(chords_b):
                if i + 1 >= len(det):
                    end = duration
                else:
                    end = det[i + 1]
                segs_b.append({"chord": str(c), "start": det[i], "end": end})
            if segs_b:
                cand.append((fold_short(segs_b, min_len), strengths_b,
                             "essentia-hpcp-beats"))
        except Exception:
            pass

    # ---- candidate 2: frame-level with a 3 s window ----
    try:
        chords_f, strengths_f = es.ChordsDetection(hopSize=HOP, sampleRate=SR,
                                                   windowSize=3.0)(hpcp_matrix)
        dt = HOP / SR
        segs_f = []
        for i, c in enumerate(chords_f):
            if segs_f and segs_f[-1]["chord"] == str(c):
                segs_f[-1]["end"] = min((i + 1) * dt, duration)
            else:
                segs_f.append({"chord": str(c), "start": i * dt,
                               "end": min((i + 1) * dt, duration)})
        if segs_f:
            cand.append((fold_short(segs_f, min_len), strengths_f,
                         "essentia-hpcp"))
    except Exception:
        pass

    if not cand:
        return None

    # ---- key extractor (prior) ----
    key_info = None
    try:
        kt, ks, kstrength = es.KeyExtractor()(audio)
        key_info = {"tonic": str(kt), "mode": str(ks),
                    "confidence": round(float(kstrength), 3),
                    "tonicFa": NOTE_FA.get(str(kt), str(kt)),
                    "modeFa": "ماژور" if str(ks) == "major" else "مینور"}
    except Exception:
        key_info = None

    # ---- ensemble pick: the (segmentation, key) pair that explains the
    # most chord-time diatonically wins; ties go to the earlier candidate
    # (beat-synchronised, which aligns chords to musical time) ----
    best_segs, best_key, best_kind, best_score = None, key_info, None, -1.0
    for segs, strengths, kind in cand:
        chord_key = key_from_chords(segs)
        k = pick_key([key_info, chord_key], segs)
        score = key_compatibility(segs, k["tonic"], k["mode"]) if k else 0.0
        if score > best_score:
            best_segs, best_key, best_kind, best_score = segs, k, kind, score

    confidence = 0.0
    for segs, strengths, kind in cand:
        if kind == best_kind and len(strengths):
            confidence = float(np.mean(np.asarray(strengths, dtype=float)))
    confidence = round(min(max(confidence, 0.0), 1.0), 3)

    if best_segs is None:
        return None

    return (best_segs, confidence, best_key, audio, beat_period, best_kind)


def _norm_cols(m):
    out = m.astype(float).copy()
    n = np.linalg.norm(out, axis=0, keepdims=True)
    n[n < 1e-9] = 1.0
    return out / n


def build_features(C, B):
    """Log-compressed, sparsified chroma features + bass-root evidence.

    Log compression (log1p) stops loud vocals/pads from smearing the
    chroma; the top-4 sparsification keeps only the strongest pitch
    classes, which fights the 4-note-template bias. The bass chroma is
    returned separately: the bass line is the most reliable root
    indicator, and the detector anchors chord roots on it (many
    recordings sit ~a quarter tone off A440, which smears full-range
    CQT chroma between neighbouring semitones — the bass register
    stays far cleaner).
    """
    mixed = (1.0 - BASS_MIX) * C + BASS_MIX * B
    F = _norm_cols(np.log1p(4.0 * np.maximum(mixed, 0.0)))
    for j in range(F.shape[1]):
        col = F[:, j]
        idx = np.argsort(col)[::-1]
        col[idx[4:]] = 0.0
    F = _norm_cols(F)
    Bn = _norm_cols(np.log1p(4.0 * np.maximum(B, 0.0)))
    return F, Bn


def relabel_to_key(segments, key, Bn, grid_start, grid_end):
    """Pull out-of-key chords back into the key.

    For a chord that is not diatonic in the (already chosen) key:
      1. keep the root but use the key's diatonic quality (D -> Dm in Am),
      2. otherwise move to the diatonic root the bass supports most
         (F#m -> F in Am when the bass plays F).
    Recordings a quarter-tone off A440 smear major/minor thirds in
    full-range chroma; the key + bass evidence is far more reliable.
    """
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


def viterbi_segments(emissions, duration, grid_start, grid_end, period):
    """Decode + build beat-aware segments."""
    path = viterbi(emissions, stay=0.93, gamma=4.0)
    raw = []
    for i, s in enumerate(path):
        label = LABELS[s]
        if raw and raw[-1]["chord"] == label:
            raw[-1]["end"] = float(grid_end[i])
        else:
            raw.append({"chord": label, "start": float(grid_start[i]),
                        "end": float(grid_end[i])})
    min_len = float(np.clip(1.1 * period, MIN_SEG, 1.7))
    return fold_short(raw, min_len)


def match_confidence(segments, raw_corr, grid_start, grid_end):
    """Duration-weighted template-match confidence (fallback engine).

    raw_corr: per-frame correlation of each template with the feature
    (no weights/penalties). Maps mean top-1 correlation to [0, 1].
    """
    n_frames = raw_corr.shape[1]
    srt = np.sort(raw_corr, axis=0)
    top1, top2 = srt[-1], srt[-2]
    margin = top1 - top2
    total, acc = 0.0, 0.0
    for s in segments:
        if s["chord"] == "N":
            continue
        i0 = int(np.searchsorted(grid_start, s["start"], side="right") - 1)
        i1 = int(np.searchsorted(grid_start, s["end"], side="left"))
        i0, i1 = max(0, i0), min(n_frames, max(i1, i0 + 1))
        m = float(np.mean(margin[i0:i1]))
        dur = s["end"] - s["start"]
        acc += dur * min(max((m - 0.01) / 0.08, 0.0), 1.0)
        total += dur
    if total < 1e-6:
        return 0.0
    return round(min(max(acc / total, 0.0), 1.0), 3)


def librosa_chords(C, B, silent_cols, duration, grid_start, grid_end, period,
                   key_mask=None):
    """Fallback engine: two-pass, key-constrained Viterbi over
    log-compressed sparsified chroma."""
    F, Bn = build_features(C, B)
    raw_corr = np.clip(TEMPLATES @ F, 0.0, 1.0)
    # bass-root anchoring: boost templates whose root the bass supports
    bmax = Bn.max(axis=0, keepdims=True)
    bmax[bmax < 1e-9] = 1.0
    root_share = Bn / bmax                       # 12 x cells in [0, 1]
    roots = np.array([chord_parse(l)[0] for l in LABELS], dtype=float)
    has_root = roots >= 0
    A = np.ones((len(LABELS), raw_corr.shape[1]))
    A[has_root, :] = 0.55 + 0.45 * root_share[roots[has_root].astype(int), :]
    emissions = np.clip(raw_corr * WEIGHTS[:, None] * A, 0.0, 1.0)
    N_IDX = LABELS.index("N")
    emissions[N_IDX, ~silent_cols] = 0.0      # music playing -> must be a chord
    emissions[:N_IDX, silent_cols] = 0.0      # true silence -> no chord

    # ---- pass 1: unconstrained ----
    segs1 = viterbi_segments(emissions, duration, grid_start, grid_end, period)
    key1 = key_from_chords(segs1)

    # ---- pass 2: soft diatonic penalty from the chord-evidence key ----
    best_segs, best_key, best_conf = segs1, key1, None
    if key1 is not None:
        mask = key_chord_mask(key1["tonic"], key1["mode"])
        em2 = emissions.copy()
        chord_rows = np.arange(em2.shape[0]) != N_IDX
        em2[np.ix_(~mask, chord_rows)] *= KEY_PENALTY
        segs2 = viterbi_segments(em2, duration, grid_start, grid_end, period)
        conf1 = match_confidence(segs1, raw_corr, grid_start, grid_end)
        conf2 = match_confidence(segs2, raw_corr, grid_start, grid_end)
        # keep the constrained pass only if it actually fits the audio
        # at least as well (guards against a wrong key estimate)
        if conf2 >= conf1 - 0.02:
            best_segs, best_conf = segs2, conf2
            best_key = key_from_chords(segs2) or key1
        else:
            best_segs, best_conf = segs1, conf1
            best_key = key1
    return best_segs, best_key, best_conf, raw_corr


# ----------------------------------------------------------------------
# Main analysis
# ----------------------------------------------------------------------

def analyze(path):
    # ---------- 1. primary engine (Essentia) ----------
    ess = essentia_chords(path)
    if ess is not None:
        segments, confidence, key, audio, beat_period, engine = ess
        y = audio
        duration = float(len(audio) / SR)
    else:
        segments = confidence = key = y = None
        beat_period = 0.5
        engine = "librosa-viterbi"

    # ---------- 2. shared prep (librosa load for fallback features) ----------
    try:
        y2, sr = librosa.load(path, sr=SR, mono=True, res_type="kaiser_fast")
    except Exception as e:
        fail(f"نتوانستم فایل صوتی را باز کنم: {type(e).__name__}")
    duration = float(len(y2) / sr)
    if duration < 4:
        fail("فایل صوتی خیلی کوتاه است (حداقل ۴ ثانیه).")
    if duration > 900:
        y2 = y2[: int(900 * sr)]
        duration = 900.0

    try:
        y2_h = librosa.effects.harmonic(y2, margin=3.0)
    except Exception:
        y2_h = y2

    chroma = librosa.feature.chroma_cqt(y=y2_h, sr=sr, hop_length=HOP, n_octaves=5)
    bc = bass_chroma(y2_h, sr)

    # ---------- 3. beat-anchored uniform grid (for tempo + sections) ----------
    try:
        tempo, beats = librosa.beat.beat_track(y=y2, sr=sr, hop_length=HOP)
        tempo = float(np.atleast_1d(tempo)[0])
        beat_times = librosa.frames_to_time(beats, sr=sr, hop_length=HOP)
    except Exception:
        tempo, beat_times = 0.0, np.array([])

    period = 0.0
    if len(beat_times) >= 8:
        diffs = np.diff(beat_times)
        diffs = diffs[(diffs > 0.15) & (diffs < 2.0)]
        if len(diffs):
            period = float(np.median(diffs))
    if period <= 0:
        period = 60.0 / max(min(tempo, 300), 40) if tempo > 0 else 0.5
    period = float(np.clip(period, 0.20, 1.50))
    tempo_out = round(60.0 / period, 1)

    if len(beat_times) >= 8:
        phase = float(np.median(np.mod(beat_times, period)))
    else:
        phase = 0.0
    grid = np.arange(phase, duration, period)
    grid = grid[grid < duration - 1e-3]
    grid = np.unique(np.concatenate([[0.0], grid]))
    grid_frames = librosa.time_to_frames(grid, sr=sr, hop_length=HOP)
    grid_frames = np.unique(librosa.util.fix_frames(
        grid_frames, x_min=0, x_max=chroma.shape[1] - 1))

    def norm_cols(m):
        out = m.astype(float).copy()
        n = np.linalg.norm(out, axis=0, keepdims=True)
        n[n < 1e-9] = 1.0
        return out / n

    chroma_sync = librosa.util.sync(chroma, grid_frames, aggregate=np.median)
    C = norm_cols(chroma_sync)
    B = norm_cols(librosa.util.sync(bc, grid_frames, aggregate=np.median))

    # ---------- 4. silence map (harmonic RMS + chroma floor per grid cell) ----------
    rms_h = librosa.feature.rms(y=y2_h, hop_length=HOP)[0]
    rms_sync = librosa.util.sync(rms_h.reshape(1, -1), grid_frames,
                                 aggregate=np.mean)[0]
    if rms_sync.size and float(np.percentile(rms_sync, 95)) > 1e-6:
        sil_thr = 0.055 * float(np.percentile(rms_sync, 95))
    else:
        sil_thr = 0.0
    # chroma floor: catches digital near-silence the RMS gate may miss
    csum = chroma_sync.sum(axis=0)
    csil_thr = 0.02 * float(np.percentile(csum, 95)) if csum.size else 0.0
    silent = (rms_sync < sil_thr) | (csum < csil_thr)
    n_cells = C.shape[1]
    silent_cols = np.zeros(n_cells, dtype=bool)
    m = min(n_cells, len(silent))
    silent_cols[:m] = silent[:m]
    # silent time spans (for relabeling Essentia segments)
    span_t = librosa.frames_to_time(grid_frames, sr=sr, hop_length=HOP)
    silent_spans = []
    run = None
    for i in range(n_cells):
        if silent_cols[i]:
            if run is None:
                run = [float(span_t[i]), float(span_t[i])]
            else:
                run[1] = float(span_t[i])
        elif run is not None:
            silent_spans.append(tuple(run))
            run = None
    if run is not None:
        silent_spans.append((run[0], duration))

    def silent_fraction(a, b):
        if b <= a:
            return 0.0
        cov = 0.0
        for sa, sb in silent_spans:
            lo, hi = max(a, sa), min(b, sb)
            if hi > lo:
                cov += hi - lo
        return cov / (b - a)

    # ---------- 5. chords ----------
    if ess is not None:
        # relabel segments that mostly overlap true silence as N
        for seg in segments:
            if seg["chord"] != "N" and silent_fraction(seg["start"], seg["end"]) > 0.6:
                seg["chord"] = "N"
        segments = dedupe_and_cover(segments, duration)
        # report the key that best explains the detected chords:
        # KeyExtractor first (higher prior), chord-evidence key second
        chord_key = key_from_chords(segments)
        key = pick_key([key, chord_key], segments) or key
    else:
        grid_start = librosa.frames_to_time(grid_frames, sr=sr, hop_length=HOP)
        grid_start[0] = 0.0
        grid_end = np.append(grid_start[1:], duration)
        segments, key, confidence, _raw = librosa_chords(
            C, B, silent_cols, duration, grid_start, grid_end, period)
        segments = dedupe_and_cover(segments, duration)
        # arbitrate the chord-evidence key against the raw-chroma key
        key = pick_key([key, detect_key(chroma.mean(axis=1))], segments) or key
        # final polish: non-diatonic chords -> diatonic (key + bass evidence)
        Bn_log = _norm_cols(np.log1p(4.0 * np.maximum(B, 0.0)))
        segments = dedupe_and_cover(
            relabel_to_key(segments, key, Bn_log, grid_start, grid_end),
            duration)

    if confidence is None:
        confidence = 0.0

    grid_start = librosa.frames_to_time(grid_frames, sr=sr, hop_length=HOP)
    grid_start[0] = 0.0
    grid_end = np.append(grid_start[1:], duration)

    # ---------- 6. sections ----------
    n_beats = C.shape[1]
    if duration <= 45:
        k = max(2, min(4, int(round(duration / 15))))
    else:
        k = max(3, min(9, int(round(duration / 28))))
    try:
        bnds = librosa.segment.agglomerative(C, k)
    except Exception:
        bnds = np.array([], dtype=int)
    bnds = sorted(set(int(b) for b in np.atleast_1d(bnds) if 0 < b < n_beats))

    min_sec = max(8.0, duration / 24.0)
    min_cells = max(2, int(round(min_sec / period)))
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
        chromas_for_letters.append(chroma.mean(axis=1))
        sections.append({"id": 1, "label": "", "start": 0.0, "end": duration,
                         "segments": segments, "progression": prog})

    letters_idx = assign_section_labels(chromas_for_letters)
    for sec, li in zip(sections, letters_idx):
        sec["label"] = chr(ord("A") + li % 26)
        sec["color"] = SECTION_COLORS[li % len(SECTION_COLORS)]

    # NOTE: adjacent sections sharing a letter are kept separate on purpose —
    # songs with a looped progression have near-identical mean chromas across
    # all sections, and merging them would erase the real structure.
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

    return {
        "ok": True,
        "engine": engine,
        "duration": round(duration, 2),
        "tempo": tempo_out,
        "key": key,
        "confidence": confidence,
        "sections": sections,
        "segments": segments,
        "chordSeconds": chord_seconds,
    }


def detect_key(mean_chroma):
    """Krumhansl-Schmuckler key finding on mean chroma (last resort)."""
    k = _ks_key(mean_chroma)
    if k is not None:
        return k
    return {"tonic": "C", "mode": "major", "confidence": 0.0,
            "tonicFa": "دو", "modeFa": "ماژور"}


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
