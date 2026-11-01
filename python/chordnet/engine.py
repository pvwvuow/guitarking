"""Deep chord engine: CNN-LSTM ensemble + XHMM decoding + metrical beat Viterbi.

Frame-level probabilities come from a 5-fold ensemble of the ISMIR-2019
large-vocabulary ChordNet (trained on Billboard/McGill/RWC-style corpora,
~300 chord templates).  A frame-level XHMM pass produces a smooth harmonic
labelling (used for key candidates); per-BEAT emissions are pooled from the
same probabilities and re-decoded with a joint (chord x bar-position) HMM
under a key constraint, so every chord change lands exactly on a beat —
mostly on the bar line, on the half bar when the music really does it.
"""
import math
import os

import numpy as np
import librosa

from .model import load_net, SPEC_DIM, SHIFT_HIGH, SHIFT_STEP
from .complex_chord import Chord, NUM_TO_ABS_SCALE, shift_complex_chord_array

SR = 22050
HOP = 512
EM_TEMP = 0.7   # beat-level emission temperature (one column per beat)
_WEIGHTS = os.path.join(os.path.dirname(__file__), "weights")
_SUBMISSION = os.path.join(os.path.dirname(__file__), "chord_list.txt")

# model suffix -> display suffix (frontend supports major, m, 7, m7, maj7;
# 9/11/13 collapse onto 7ths, sus/dim stay textual)
_QUALITY_MAP = {
    "maj": "", "min": "m", "7": "7", "min7": "m7", "maj7": "maj7",
    "maj9": "maj7", "min9": "m7", "min11": "m7", "min13": "m7",
    "9": "7", "11": "7", "13": "7", "sus4": "sus4", "sus2": "sus2",
    "dim": "dim", "dim7": "dim", "hdim7": "m7b5", "aug": "aug",
}
_DEGREE_SEMIS = {"1": 0, "2": 2, "b3": 3, "3": 4, "4": 5, "b5": 6, "5": 7,
                 "b6": 8, "6": 9, "b7": 10, "7": 11, "9": 2, "11": 5,
                 "13": 9}

_TABLE_CACHE = None
_NETS_CACHE = None


def build_chord_table(template_file=None):
    """[((6-tuple ids), ('F:min7', bass_degree_or_None))] — all 12 roots."""
    global _TABLE_CACHE
    if _TABLE_CACHE is not None and template_file is None:
        return _TABLE_CACHE
    template_file = template_file or _SUBMISSION
    pool = {}
    with open(template_file) as f:
        tnames = [ln.strip() for ln in f if ln.strip()]
    for chord_name in tnames:
        if ":" not in chord_name:
            continue
        root_txt, qual = chord_name.split(":", 1)
        assert root_txt == "C"
        array = Chord(chord_name).to_numpy()
        if -2 in array:
            continue
        base_qual = qual.split("/")[0]
        bass = qual[qual.index("/") + 1:] if "/" in qual else None
        for shift in range(12):
            shift_name = "%s:%s" % (NUM_TO_ABS_SCALE[shift], base_qual)
            sa = tuple(shift_complex_chord_array(array, shift))
            if sa in pool:
                continue
            pool[sa] = (shift_name, bass)
    table = [((0, -1, -1, -1, -1, -1), ("N", None))] + list(pool.items())
    _TABLE_CACHE = table
    return table


def get_nets():
    global _NETS_CACHE
    if _NETS_CACHE is None:
        _NETS_CACHE = [load_net(os.path.join(_WEIGHTS, "fold%d.sdict" % i))
                       for i in range(5)]
    return _NETS_CACHE


def chord_obs(table, prob_list):
    """Joint log-prob of every template chord for a set of prob frames.

    prob_list: six arrays (n_frames, n_classes) or (n_classes,).
    Returns (names, id-array, logp (n_frames, n_chord)).
    """
    prob_list = [p if p.ndim == 2 else p.reshape(1, -1) for p in prob_list]
    names, arrs = [], []
    for array, ninfo in table:
        ok = array[0] >= 0 and all(
            array[i] < prob_list[i].shape[-1]
            for i in range(6) if array[i] >= 0)
        if ok:
            names.append(ninfo)
            arrs.append(list(array))
    arr = np.array(arrs, dtype=np.int32)
    arr[:, 1] += 1  # bass id -1 -> class 0 (no bass), 0 -> 1, ...
    triad_p, bass_p, sfx = prob_list[0], prob_list[1], prob_list[2:]
    logp = np.log(np.clip(triad_p[:, arr[:, 0]], 1e-10, None))
    bc = arr[:, 1] >= 0
    if bc.any():
        logp[:, bc] += np.log(np.clip(bass_p[:, arr[bc, 1]], 1e-10, None))
    for i in range(4):
        sc = arr[:, i + 2] >= 0
        if sc.any():
            logp[:, sc] += np.log(np.clip(
                sfx[i][:, arr[sc, i + 2]], 1e-10, None))
    return names, arr, logp


def xhmm_frame_decode(names, logp, diff_pen=10.0):
    """Frame Viterbi; a chord change costs diff_pen log-prob units."""
    n_frame, n_chord = logp.shape
    dp = np.full(n_chord, -np.inf)
    dp[0] = logp[0, 0]  # force the very first frame to start on 'N'
    dp_max = np.zeros(n_frame, dtype=np.int32)
    dp_max[0] = int(np.argmax(dp))
    pre = np.zeros((n_frame, n_chord), dtype=np.int32)
    pre[0, :] = -1
    same_idx = np.arange(n_chord)
    for t in range(1, n_frame):
        same = dp
        diff = dp[dp_max[t - 1]] - diff_pen
        use_same = same > diff
        dp = np.maximum(diff, same) + logp[t, :]
        pre[t, :] = np.where(use_same, same_idx, dp_max[t - 1])
        dp_max[t] = int(np.argmax(dp))
    ids = [0] * n_frame
    ids[-1] = int(dp_max[-1])
    for t in range(n_frame - 2, -1, -1):
        ids[t] = int(pre[t + 1, ids[t + 1]])
    return [names[i] for i in ids]


def cqt_chroma(cqt):
    """(frames, 288) CQT magnitude -> normalized (12, frames) chroma."""
    pcs = (np.arange(cqt.shape[1]) // 3 + 6) % 12  # bin0 = F#0 -> pc 6
    ch = np.zeros((12, cqt.shape[0]))
    for pc in range(12):
        ch[pc] = cqt[:, pcs == pc].sum(axis=1)
    ch = np.log1p(3.0 * np.maximum(ch, 0.0))
    n = np.linalg.norm(ch, axis=0, keepdims=True)
    n[n < 1e-9] = 1.0
    return ch / n


def display_label(name_bass):
    """('F', 'min7' [, 'b7' bass]) -> 'Fm7' / 'Fm/Bb' / 'N'."""
    name, bass = name_bass
    if name == "N":
        return "N"
    root, qual = name.split(":", 1)
    label = root + _QUALITY_MAP.get(qual, "")
    if bass:
        semis = _DEGREE_SEMIS.get(bass)
        if semis is not None and semis not in (0, 7):
            bass_pc = (NUM_TO_ABS_SCALE.index(root) + semis) % 12
            label += "/" + NUM_TO_ABS_SCALE[bass_pc]
    return label


# ------------------------------------------------------------------ main ---
def analyze_deep(y, dur, beats, silent, accent=None):
    """Deep analysis on the beat grid.

    -> (segments, key|None, confidence, beat_chroma (12, n_beats),
        meter {"bpb": 3|4, "pos": bar position of every beat})"""
    import meter as mt

    cqt = np.abs(librosa.hybrid_cqt(
        y, bins_per_octave=36, fmin=librosa.note_to_hz("F#0"),
        n_bins=288, tuning=None, hop_length=HOP)).T.astype(np.float32)
    cqt = cqt[:, SHIFT_HIGH * SHIFT_STEP:
              SHIFT_HIGH * SHIFT_STEP + SPEC_DIM]

    nets = get_nets()
    outs = None
    for net in nets:
        p = net.probs(cqt)
        outs = p if outs is None else [a + b for a, b in zip(outs, p)]
    probs = [a / len(nets) for a in outs]

    frame_dur = HOP / SR
    n_frames = cqt.shape[0]
    frame_t = np.arange(n_frames) * frame_dur

    # ---- frame-level XHMM labelling (key candidates) ----
    table = build_chord_table()
    names, _arr, logp = chord_obs(table, probs)
    frame_labels = xhmm_frame_decode(names, logp)

    # ---- beat-grid emissions pooled from the same probabilities ----
    n_beats = len(beats)
    frame_beat = mt.cell_index(frame_t, beats)
    em = np.zeros((logp.shape[1], n_beats))
    for j in range(n_beats):
        sel = frame_beat == j
        if not sel.any():
            # beat shorter than a frame: borrow the nearest frame
            k = int(np.clip(np.searchsorted(frame_t, beats[j]), 0,
                            n_frames - 1))
            sel = np.zeros(n_frames, dtype=bool)
            sel[k] = True
        mp = [p[sel].mean(axis=0) for p in probs]
        _n2, _a2, lp2 = chord_obs(table, mp)
        em[:, j] = lp2[0]

    for j in range(min(n_beats, len(silent))):
        if silent[j]:
            em[1:, j] = -1e9
        else:
            em[0, j] = -1e9

    em_t = EM_TEMP * np.maximum(em, -1e6)

    # ---- metrical decode; meter settled on the free decode ----
    disp_all = [display_label(n) for n in names]
    free = mt.decode_meter(em_t, accent)
    bpb = free["bpb"]
    path, pos = free["path"], free["pos"]
    frame_segs = _frame_segments(frame_labels, frame_t)
    free_segs = _bars_to_segments(beats, dur, path, disp_all)
    try:
        import chord_detect as cd
        cands = [cd.key_from_chords(frame_segs),
                 cd.best_key_overall(free_segs)]
    except Exception:
        cands = []
    free_score = float(np.mean([em[path[j], j] for j in range(n_beats)]))
    best_path, best_pos, best_key, best_score = path, pos, None, free_score
    seen = set()
    for k in cands:
        if not k:
            continue
        kk = (k["tonic"], k["mode"])
        if kk in seen:
            continue
        seen.add(kk)
        em_k = _apply_key_penalty(em_t, disp_all, k, penalty=0.45)
        p_k, q_k, _sc = mt.metrical_viterbi(em_k, bpb, accent)
        sc = float(np.mean([em[p_k[j], j] for j in range(n_beats)]))
        # adopt the constrained decoding when it costs almost nothing:
        # one key => consistent repeats, fewer out-of-key decoys
        if sc >= free_score - 0.03 and (best_key is None or sc > best_score):
            best_path, best_pos, best_key, best_score = p_k, q_k, k, sc
    path, pos, key = best_path, best_pos, best_key

    chosen = np.array([em[path[j], j] for j in range(n_beats)])
    conf = float(np.mean(np.exp(np.clip(chosen, -20.0, 0.0)))) if n_beats else 0.0
    conf = float(np.clip(conf ** 0.45, 0.0, 1.0))

    chroma = cqt_chroma(cqt)
    counts = np.maximum(np.bincount(frame_beat, minlength=n_beats), 1)
    beat_chroma = np.zeros((12, n_beats))
    for pc in range(12):
        beat_chroma[pc] = np.bincount(
            frame_beat, weights=chroma[pc], minlength=n_beats) / counts

    segs = _bars_to_segments(beats, dur, path, disp_all)
    return segs, key, conf, beat_chroma, {"bpb": int(bpb), "pos": pos}


def _bars_to_segments(bars, dur, path, disp_all):
    segs = []
    for j, st in enumerate(path):
        a = float(bars[j]) if j < len(bars) else dur
        b = float(bars[j + 1]) if j + 1 < len(bars) else dur
        lab = disp_all[st] if 0 <= st < len(disp_all) else "N"
        if segs and segs[-1]["chord"] == lab:
            segs[-1]["end"] = b
        else:
            segs.append({"chord": lab, "start": a, "end": b})
    return segs


def _frame_segments(frame_labels, frame_t):
    """Frame (name,bass) labels -> [{'chord','start','end'}] display segs."""
    segs = []
    for lab, t in zip(frame_labels, frame_t):
        lab = display_label(lab)
        if segs and segs[-1]["chord"] == lab:
            segs[-1]["end"] = float(t)
        else:
            segs.append({"chord": lab, "start": float(t), "end": float(t)})
    return segs


_ALLOWED_CACHE = {}


def _key_allowed_set(tonic, mode):
    """Display-labels allowed in (tonic, mode): diatonic triads + their
    7th variants (maj->7/maj7, min->m7), harmonic-minor V, slash variants
    resolved to their base name."""
    kk = (tonic, mode)
    if kk in _ALLOWED_CACHE:
        return _ALLOWED_CACHE[kk]
    ti = "C C# D D# E F F# G G# A A# B".split().index(tonic)
    if mode == "major":
        deg = {0: "maj", 5: "maj", 7: "maj", 2: "min", 4: "min", 9: "min"}
    else:
        deg = {0: "min", 5: "min", 3: "maj", 8: "maj", 10: "maj",
               7: "min"}  # v minor; V major added below
    allowed = set()
    roots = {}
    for st, q in deg.items():
        roots[(ti + st) % 12] = q
    if mode == "minor":
        roots[(ti + 7) % 12] = "maj"  # harmonic-minor V
    for rpc, q in roots.items():
        root = "C C# D D# E F F# G G# A A# B".split()[rpc]
        if q == "maj":
            allowed |= {root, root + "7", root + "maj7"}
        elif q == "min":
            allowed |= {root + "m", root + "m7"}
        else:
            allowed.add(root + "dim")
    _ALLOWED_CACHE[kk] = allowed
    return allowed


def _apply_key_penalty(em, disp_all, key, penalty=0.45):
    """Log-penalty for out-of-key templates (returns a copy)."""
    try:
        allowed = _key_allowed_set(key["tonic"], key["mode"])
    except Exception:
        return em
    ok = np.zeros(em.shape[0], dtype=bool)
    ok[0] = True  # N
    for k, dlab in enumerate(disp_all):
        if k == 0:
            continue
        ok[k] = dlab.split("/")[0] in allowed
    out = em.copy()
    out[~ok, :] += math.log(penalty)
    return out
