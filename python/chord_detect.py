#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — Chord detection engine (v2)
========================================
Detects the chords of every section of a song.

Primary pipeline (research-grade, robust to dense vocal mixes):
  1. Load audio (mono, 22050 Hz)
  2. Essentia: SpectralPeaks -> HPCP chroma -> ChordsDetection
     (HPCP + NNLS-style profile matching handles vocals/dense arrangements
      far better than raw chroma template matching)
  3. Key via Essentia KeyExtractor
  4. Silence gating: "N" (no chord) only where harmonic energy is near zero

Fallback pipeline (if Essentia is unavailable):
  1. librosa harmonic/percussive separation
  2. CQT chroma + bass chroma, beat-anchored grid, template matching
     with sparsified chroma (top-3 pitch classes) + Viterbi smoothing
  3. Krumhansl-Schmuckler key finding

Shared post-processing:
  - merge tiny segments, structural segmentation (A/B/C sections),
    chord usage statistics

Usage:  python3 chord_detect.py <audio_file>
Output: JSON on stdout
"""

import sys
import json
import math
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

MIN_SEG = 0.8  # seconds; segments shorter than this get folded


def fail(msg):
    print(json.dumps({"ok": False, "error": msg}, ensure_ascii=False))
    sys.exit(0)


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


def detect_key(mean_chroma):
    """Krumhansl-Schmuckler key finding (fallback)."""
    c = np.asarray(mean_chroma, dtype=float)
    if c.max() > 0:
        c = c / c.max()
    best = (None, None, -2.0)
    for mode, profile in (("major", KMAJ), ("minor", KMIN)):
        p = (profile - profile.mean()) / profile.std()
        pc = (c - c.mean())
        sd = pc.std()
        if sd < 1e-9:
            continue
        pc = pc / sd
        for r in range(12):
            v = float(np.dot(pc, np.roll(p, r)))
            if v > best[2]:
                best = (NOTES[r], mode, v)
    if best[0] is None:
        return {"tonic": "C", "mode": "major", "confidence": 0.0,
                "tonicFa": "دو", "modeFa": "ماژور"}
    mode_fa = "ماژور" if best[1] == "major" else "مینور"
    return {"tonic": best[0], "mode": best[1], "confidence": round(min(max(best[2], 0), 1), 3),
            "tonicFa": NOTE_FA[best[0]], "modeFa": mode_fa}


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
# Chord engines
# ----------------------------------------------------------------------

def essentia_chords(path):
    """Primary engine: Essentia HPCP + ChordsDetection.

    Returns (segments, confidence, key_info_or_None, audio) or None on failure.
    segments: list of {"chord", "start", "end"} covering [0, duration].
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
    peaks = es.SpectralPeaks(minFrequency=60, maxFrequency=5000,
                             magnitudeThreshold=0.00001, maxPeaks=80)
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

    chords, strengths = es.ChordsDetection(hopSize=HOP, sampleRate=SR,
                                           windowSize=3.0)(hpcp_matrix)

    # key
    key_info = None
    try:
        kt, ks, kstrength = es.KeyExtractor()(audio)
        key_info = {"tonic": str(kt), "mode": str(ks),
                    "confidence": round(float(kstrength), 3),
                    "tonicFa": NOTE_FA.get(str(kt), str(kt)),
                    "modeFa": "ماژور" if str(ks) == "major" else "مینور"}
    except Exception:
        key_info = None

    # condense per-frame chords into segments
    dt = HOP / SR
    duration = len(audio) / SR
    segments = []
    for i, c in enumerate(chords):
        if segments and segments[-1]["chord"] == c:
            segments[-1]["end"] = min((i + 1) * dt, duration)
        else:
            segments.append({"chord": str(c), "start": i * dt,
                             "end": min((i + 1) * dt, duration)})

    # fold tiny segments (< MIN_SEG) into the previous chord
    merged = []
    for seg in segments:
        if merged and (seg["end"] - seg["start"]) < MIN_SEG:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg)
    segments = []
    for seg in merged:  # fold consecutive duplicates created above
        if segments and segments[-1]["chord"] == seg["chord"]:
            segments[-1]["end"] = seg["end"]
        else:
            segments.append(seg)

    confidence = float(np.mean(np.asarray(strengths, dtype=float))) if len(strengths) else 0.0
    confidence = round(min(max(confidence, 0.0), 1.0), 3)

    return segments, confidence, key_info, audio


def librosa_chords(y_h, sr, C, B, silent_cols, duration):
    """Fallback engine: sparsified chroma template matching + Viterbi.

    Returns segments (list of {"chord","start","end"}).
    """
    def norm_cols(m):
        out = m.astype(float).copy()
        n = np.linalg.norm(out, axis=0, keepdims=True)
        n[n < 1e-9] = 1.0
        return out / n

    F = norm_cols(0.65 * C + 0.35 * B)
    # sparsify: keep the 3 strongest pitch classes per cell — combats the
    # dense smear from vocals/pads that otherwise favours 4-note templates
    for j in range(F.shape[1]):
        col = F[:, j]
        idx = np.argsort(col)[::-1]
        col[idx[3:]] = 0.0
    F = norm_cols(F)

    emissions = np.clip((TEMPLATES @ F) * WEIGHTS[:, None], 0.0, 1.0)
    N_IDX = LABELS.index("N")
    emissions[N_IDX, ~silent_cols] = 0.0      # music playing -> must be a chord
    emissions[:N_IDX, silent_cols] = 0.0      # true silence -> no chord

    path = viterbi(emissions, stay=0.88, gamma=4.0)

    grid_start = librosa.frames_to_time(np.arange(emissions.shape[1]), sr=sr,
                                        hop_length=HOP)
    grid_end = np.append(grid_start[1:], duration)

    segments = []
    for i, s in enumerate(path):
        label = LABELS[s]
        if segments and segments[-1]["chord"] == label:
            segments[-1]["end"] = float(grid_end[i])
        else:
            segments.append({"chord": label, "start": float(grid_start[i]),
                             "end": float(grid_end[i])})
    merged = []
    for seg in segments:
        if merged and (seg["end"] - seg["start"]) < MIN_SEG:
            merged[-1]["end"] = seg["end"]
        else:
            merged.append(seg)
    return merged


# ----------------------------------------------------------------------
# Main analysis
# ----------------------------------------------------------------------

def analyze(path):
    # ---------- 1. primary engine (Essentia) ----------
    ess = essentia_chords(path)
    if ess is not None:
        segments, confidence, key, audio = ess
        sr = SR
        y = audio
        duration = float(len(audio) / SR)
        y_h = None
    else:
        segments = confidence = key = y = None

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

    # ---------- 4. silence map (harmonic RMS per grid cell) ----------
    rms_h = librosa.feature.rms(y=y2_h, hop_length=HOP)[0]
    rms_sync = librosa.util.sync(rms_h.reshape(1, -1), grid_frames,
                                 aggregate=np.mean)[0]
    if rms_sync.size and float(np.percentile(rms_sync, 95)) > 1e-6:
        sil_thr = 0.055 * float(np.percentile(rms_sync, 95))
    else:
        sil_thr = 0.0
    silent = rms_sync < sil_thr
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
        # re-fold N / duplicates
        folded = []
        for seg in segments:
            if folded and folded[-1]["chord"] == seg["chord"]:
                folded[-1]["end"] = seg["end"]
            else:
                folded.append(seg)
        segments = folded
        engine = "essentia-hpcp"
    else:
        segments = librosa_chords(y2_h, sr, C, B, silent_cols, duration)
        mean_chroma = chroma.mean(axis=1)
        key = detect_key(mean_chroma)
        confidence = None
        engine = "librosa-viterbi"

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
