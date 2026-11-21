"""Deep chord engine: CNN-LSTM ensemble + XHMM decoding + metrical beat Viterbi.

Frame-level probabilities come from a 5-fold ensemble of the ISMIR-2019
large-vocabulary ChordNet (trained on Billboard/McGill/RWC-style corpora,
~300 chord templates).  A frame-level XHMM pass produces a smooth harmonic
labelling (used for key candidates); per-BEAT emissions are pooled from the
same probabilities and re-decoded with a joint (chord x bar-position) HMM
under a key constraint, so every chord change lands exactly on a beat —
mostly on the bar line, on the half bar when the music really does it.

v7.1: the network runs in overlapping windows (no OOM on long songs), its
probabilities can be cached per song (GK_CACHE_DIR) so decode knobs can be
swept without re-running the nets, and the decode knobs read environment
overrides (GK_EM_TEMP, GK_KEY_PENALTY, GK_KEY_SLACK + the meter.py ones).

v7.2 (bench round 2): defaults moved to the round-2 sweep winner
(EM_TEMP 0.5, KEY_PENALTY 0.3); fast grids decode with 8-beat bars
(meter.py); chord runs shorter than GK_MIN_BEATS beats are absorbed by
the neighbour that explains them best (melody notes faked 1-beat chords).
v7.2.1 (bench round 3): MIN_BEATS default 4. Sweep on 28 trusted refs:
0.402 -> 0.416, change ratio 1.61 -> 1.48; MIN_BEATS 1 and 2 were no-ops.

v7.3: MIN_BEATS=4 alone deleted every real half-bar chord (synthetic
loop with 2-beat changes: 95% -> 61% frame accuracy), so a short chord now
survives when the audio clearly prefers it (GK_KEEP_GAIN, per-beat log
advantage after EM_TEMP; 95% restored). Repeated sections share chord
evidence before decoding (GK_REPEAT_W / GK_REPEAT_THR, meter.repeat_pool):
one noisy chorus no longer flips its chords (synthetic: 92% -> 98%).

v7.4 (one-beat chords): the owner: "many chords that are played for ONE
beat are not detected". Three things deleted them: the metrical decode
(a change off the bar line costs log 0.005), merge_short (runs < 4 beats)
and, last, chord_detect.fold_short (1.1 beats with a 0.8 s floor - it
removed every one-beat chord even when the audio was clear, and above
150 BPM even two-beat chords). Now, after the decode:
  rescue_short(): a run of 1..GK_RESCUE_MAX beats becomes the chord the
  network clearly hears there when ALL of these hold
    * its beat log-prob (repeat-pooled) beats the decoded chord by
      >= GK_RESCUE_GAIN, and BOTH half beats agree by >= GK_RESCUE_HALF
      (a melody note on one eighth is not a chord);
    * it is a different chord family (root or major/minor changes:
      C -> Cmaj7 / C7 / Csus4 is colour, not a change);
    * its bass moves (Fmaj7/A over Am = the same bass + a melody note);
    * it fits the song: diatonic to the decoded key, or used >= 4 beats
      elsewhere in the decode;
    * at most GK_RESCUE_CAP of the beats are rescued (strongest first).
  min_segment(): the deep path keeps a chord of >= GK_MIN_SEG_BEATS
  beats (0.7, floor 0.2 s). GK_RESCUE=0 gives back v7.3 exactly (bench
  baseline). LAST_INFO["rescued"] counts the rescued runs.
"""
import hashlib
import math
import os

import numpy as np
import librosa

from .complex_chord import Chord, NUM_TO_ABS_SCALE, shift_complex_chord_array

SR = 22050
HOP = 512
EM_TEMP = 0.5      # beat-level emission temperature (one column per beat)
KEY_PENALTY = 0.3  # emission multiplier for out-of-key templates
KEY_SLACK = 0.03   # key-constrained decode adopted if it costs <= this
MIN_BEATS = 4      # shortest chord run kept (beats); 1 = off
KEEP_GAIN = 1.0    # ...unless it beats its neighbour by this per beat
REPEAT_W = 0.5     # weight of the repeats' evidence (0 = off)
REPEAT_THR = 0.75  # centred chroma-window similarity for "a repeat"
RESCUE = 1          # v7.4 one-beat chord rescue (0 = v7.3 behaviour)
RESCUE_GAIN = 3.0   # beat log-prob advantage over the decoded chord
RESCUE_HALF = 1.0   # ...and on each half of the beat
RESCUE_MAX = 2      # longest rescued run (beats)
RESCUE_CAP = 0.08   # at most this share of the beats is rescued
MIN_SEG_BEATS = 0.7  # deep path: shortest chord segment kept (beats)
CACHE_VER = "p71"
SPEC_DIM = 252          # mirrors model.py (kept here: no torch on a cache hit)
SHIFT_HIGH, SHIFT_STEP = 6, 3
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
LAST_INFO = {}


def _knob(name, default):
    v = os.environ.get("GK_" + name)
    try:
        return float(v) if v not in (None, "") else default
    except ValueError:
        return default


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
        from .model import load_net
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


# ------------------------------------------------------- network + cache ---
def _cache_path(y):
    cdir = os.environ.get("GK_CACHE_DIR")
    if not cdir:
        return None
    h = hashlib.sha1(np.ascontiguousarray(y, dtype=np.float32).tobytes())
    return os.path.join(cdir, "%s.%s.npz" % (h.hexdigest()[:24], CACHE_VER))


def network_probs(y):
    """-> (six ensemble-mean prob arrays (frames, k), chroma (12, frames)).
    Cached per song in GK_CACHE_DIR when set."""
    cp = _cache_path(y)
    if cp and os.path.exists(cp):
        try:
            z = np.load(cp)
            return [z["p%d" % i] for i in range(6)], z["chroma"]
        except Exception:
            pass
    cqt = np.abs(librosa.hybrid_cqt(
        y, bins_per_octave=36, fmin=librosa.note_to_hz("F#0"),
        n_bins=288, tuning=None, hop_length=HOP)).T.astype(np.float32)
    chroma = cqt_chroma(cqt)
    cqt = np.ascontiguousarray(
        cqt[:, SHIFT_HIGH * SHIFT_STEP: SHIFT_HIGH * SHIFT_STEP + SPEC_DIM])
    nets = get_nets()
    outs = None
    for net in nets:
        p = net.probs(cqt)
        outs = p if outs is None else [a + b for a, b in zip(outs, p)]
    del cqt
    probs = [(a / len(nets)).astype(np.float32) for a in outs]
    chroma = chroma.astype(np.float32)
    if cp:
        try:
            os.makedirs(os.path.dirname(cp), exist_ok=True)
            tmp = cp + ".tmp.npz"
            np.savez_compressed(tmp, chroma=chroma,
                                **{"p%d" % i: p for i, p in enumerate(probs)})
            os.replace(tmp, cp)
        except Exception:
            pass
    return probs, chroma


def beat_emissions(table, probs, frame_beat, frame_t, beats):
    """Per-beat log emissions (n_chord, n_beats): ensemble probabilities
    averaged over each beat, then scored against every template."""
    n_beats = len(beats)
    n_frames = len(frame_t)
    counts = np.bincount(frame_beat, minlength=n_beats).astype(float)
    pooled = []
    for p in probs:
        acc = np.zeros((n_beats, p.shape[1]))
        np.add.at(acc, frame_beat, p)
        pooled.append(acc)
    empty = np.where(counts == 0)[0]
    for j in empty:
        # beat shorter than a frame: borrow the nearest frame
        k = int(np.clip(np.searchsorted(frame_t, beats[j]), 0, n_frames - 1))
        for acc, p in zip(pooled, probs):
            acc[j] = p[k]
    counts[empty] = 1.0
    pooled = [acc / counts[:, None] for acc in pooled]
    _n, _a, lp = chord_obs(table, pooled)
    return lp.T


# ------------------------------------------------------ one-beat chords ---
def half_beat_emissions(table, probs, frame_t, beats, dur, cell_index):
    """(n_chord, 2 * n_beats) log emissions: column 2j = first half of
    beat j, 2j + 1 = second half."""
    b = np.asarray(beats, dtype=float)
    if not len(b):
        return None
    nxt = np.append(b[1:], max(float(dur), float(b[-1]) + 1e-3))
    grid = np.empty(2 * len(b))
    grid[0::2] = b
    grid[1::2] = 0.5 * (b + nxt)
    cell = cell_index(frame_t, grid)
    return beat_emissions(table, probs, cell, frame_t, grid)


_NOTE_PC = {n: i for i, n in enumerate(
    "C C# D D# E F F# G G# A A# B".split())}
_NOTE_PC.update({"Db": 1, "Eb": 3, "Gb": 6, "Ab": 8, "Bb": 10})


def _root_pc(txt):
    txt = txt or ""
    if len(txt) >= 2 and txt[:2] in _NOTE_PC:
        return _NOTE_PC[txt[:2]], txt[2:]
    if txt[:1] in _NOTE_PC:
        return _NOTE_PC[txt[:1]], txt[1:]
    return None, ""


def chord_family(label):
    """'Am7' -> (9, 'min'); 'Csus4'/'Cmaj7'/'C7' -> (0, 'maj'); N -> None."""
    if not label or label == "N":
        return None
    pc, q = _root_pc(label.split("/")[0])
    if pc is None:
        return None
    if q.startswith("dim") or q.startswith("m7b5"):
        kind = "dim"
    elif q.startswith("aug"):
        kind = "aug"
    elif q.startswith("m") and not q.startswith("maj"):
        kind = "min"
    else:
        kind = "maj"
    return pc, kind


def chord_bass(label):
    """bass pitch class: the slash bass, else the root (None for N)."""
    if not label or label == "N":
        return None
    parts = label.split("/")
    if len(parts) > 1:
        pc, _q = _root_pc(parts[1])
        if pc is not None:
            return pc
    pc, _q = _root_pc(parts[0])
    return pc


def rescue_allowed(disp_all, key, path, min_beats_total=4):
    """states a rescue may use: diatonic to the key or used >= 4 beats"""
    base = [d.split("/")[0] for d in disp_all]
    allowed_key = set()
    if key:
        try:
            allowed_key = _key_allowed_set(key["tonic"], key["mode"])
        except Exception:
            allowed_key = set()
    counts = {}
    for st in path:
        b = base[int(st)]
        counts[b] = counts.get(b, 0) + 1
    vocab = {b for b, c in counts.items() if c >= min_beats_total and b != "N"}
    ok = np.array([(b in allowed_key or b in vocab) and b != "N"
                   for b in base], dtype=bool)
    if len(ok):
        ok[0] = False
    return ok


def rescue_short(path, em, em_half, allowed, disp_all, gain=RESCUE_GAIN,
                 half_gain=RESCUE_HALF, max_beats=RESCUE_MAX, cap=RESCUE_CAP):
    """Give 1..max_beats beat runs the chord the network clearly hears there.
    em: (n_chord, T) beat log emissions (silence already masked);
    em_half: (n_chord, 2T) half-beat log emissions or None.
    -> (new path, number of rescued runs)"""
    path = np.array(path, dtype=np.int32)
    T = len(path)
    if T < 3 or allowed is None or not np.any(allowed):
        return path, 0
    fam = [chord_family(d) for d in disp_all]
    bass = [chord_bass(d) for d in disp_all]
    cand = np.where(np.asarray(allowed)[:, None], em, -np.inf)
    best = np.argmax(cand, axis=0)
    cols = np.arange(T)
    adv = cand[best, cols] - em[path, cols]
    ok = np.zeros(T, dtype=bool)
    for j in range(T):
        b, c = int(best[j]), int(path[j])
        if b == c or not np.isfinite(adv[j]) or adv[j] < gain:
            continue
        if fam[b] is None or fam[c] is None or fam[b] == fam[c]:
            continue
        if bass[b] is not None and bass[b] == bass[c]:
            continue        # same bass + a melody note on top
        ok[j] = True
    if em_half is not None and em_half.shape[1] >= 2 * T:
        h0 = em_half[best, 2 * cols] - em_half[path, 2 * cols]
        h1 = em_half[best, 2 * cols + 1] - em_half[path, 2 * cols + 1]
        ok &= (h0 >= half_gain) & (h1 >= half_gain)
    runs = []
    i = 0
    while i < T:
        if not ok[i]:
            i += 1
            continue
        j = i
        while j + 1 < T and ok[j + 1] and fam[int(best[j + 1])] == fam[int(best[i])]:
            j += 1
        if j - i + 1 <= max_beats:
            runs.append((float(np.mean(adv[i:j + 1])), i, j))
        i = j + 1
    if cap > 0:
        runs.sort(key=lambda r: -r[0])
        runs = runs[:max(int(cap * T), 0)]
    for _g, i, j in runs:
        path[i:j + 1] = best[i]
    return path, len(runs)


def rescue_on():
    return _knob("RESCUE", RESCUE) > 0


def min_segment(period, floor_s):
    """shortest chord segment the deep path keeps (s); v7.3 when off"""
    if rescue_on():
        return float(np.clip(_knob("MIN_SEG_BEATS", MIN_SEG_BEATS) * period,
                             0.2, 1.7))
    return float(np.clip(1.1 * period, floor_s, 1.7))


# ------------------------------------------------------------------ main ---
def analyze_deep(y, dur, beats, silent, accent=None):
    """Deep analysis on the beat grid.

    -> (segments, key|None, confidence, beat_chroma (12, n_beats),
        meter {"bpb": 3|4|6, "pos": bar position of every beat})"""
    import meter as mt

    em_temp = _knob("EM_TEMP", EM_TEMP)
    key_pen = _knob("KEY_PENALTY", KEY_PENALTY)
    key_slack = _knob("KEY_SLACK", KEY_SLACK)
    min_beats = int(round(_knob("MIN_BEATS", MIN_BEATS)))
    keep_gain = _knob("KEEP_GAIN", KEEP_GAIN)
    keep_gain = None if keep_gain >= 50 else keep_gain
    repeat_w = _knob("REPEAT_W", REPEAT_W)
    repeat_thr = _knob("REPEAT_THR", REPEAT_THR)

    probs, chroma = network_probs(y)

    frame_dur = HOP / SR
    n_frames = probs[0].shape[0]
    frame_t = np.arange(n_frames) * frame_dur

    # ---- frame-level XHMM labelling (key candidates) ----
    table = build_chord_table()
    names, _arr, logp = chord_obs(table, probs)
    frame_labels = xhmm_frame_decode(names, logp)
    del logp

    # ---- beat-grid emissions pooled from the same probabilities ----
    n_beats = len(beats)
    frame_beat = mt.cell_index(frame_t, beats)
    em_raw = beat_emissions(table, probs, frame_beat, frame_t, beats)

    m = min(chroma.shape[1], n_frames)
    counts = np.maximum(np.bincount(frame_beat[:m], minlength=n_beats), 1)
    beat_chroma = np.zeros((12, n_beats))
    for pc in range(12):
        beat_chroma[pc] = np.bincount(
            frame_beat[:m], weights=chroma[pc, :m], minlength=n_beats) / counts

    # ---- repeated sections share their chord evidence ----
    em = mt.repeat_pool(em_raw, beat_chroma, weight=repeat_w,
                        thr=repeat_thr) if repeat_w > 0 else em_raw.copy()

    for e in (em, em_raw):
        for j in range(min(n_beats, len(silent))):
            if silent[j]:
                e[1:, j] = -1e9
            else:
                e[0, j] = -1e9

    em_t = em_temp * np.maximum(em, -1e6)
    period = float(np.median(np.diff(beats))) if n_beats > 2 else None

    # ---- metrical decode; meter settled on the free decode ----
    disp_all = [display_label(n) for n in names]
    free = mt.decode_meter(em_t, accent, period=period)
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
        em_k = _apply_key_penalty(em_t, disp_all, k, penalty=key_pen)
        p_k, q_k, _sc = mt.metrical_viterbi(em_k, bpb, accent)
        sc = float(np.mean([em[p_k[j], j] for j in range(n_beats)]))
        # adopt the constrained decoding when it costs almost nothing:
        # one key => consistent repeats, fewer out-of-key decoys
        if sc >= free_score - key_slack and (best_key is None
                                             or sc > best_score):
            best_path, best_pos, best_key, best_score = p_k, q_k, k, sc
    path, pos, key = best_path, best_pos, best_key
    path = mt.merge_short(path, em_t, min_beats, keep_gain)

    # ---- v7.4: chords that last one (or two) beats ----
    rescued = 0
    if rescue_on():
        try:
            em_half = half_beat_emissions(table, probs, frame_t, beats, dur,
                                          mt.cell_index)
            allowed = rescue_allowed(disp_all, key, path)
            path, rescued = rescue_short(
                path, em, em_half, allowed, disp_all,
                gain=_knob("RESCUE_GAIN", RESCUE_GAIN),
                half_gain=_knob("RESCUE_HALF", RESCUE_HALF),
                max_beats=int(round(_knob("RESCUE_MAX", RESCUE_MAX))),
                cap=_knob("RESCUE_CAP", RESCUE_CAP))
        except Exception:
            rescued = -1    # rescue failed: the v7.3 path stays
    LAST_INFO.clear()
    LAST_INFO["rescued"] = int(rescued)

    chosen = np.array([em_raw[path[j], j] for j in range(n_beats)])
    conf = float(np.mean(np.exp(np.clip(chosen, -20.0, 0.0)))) if n_beats else 0.0
    conf = float(np.clip(conf ** 0.45, 0.0, 1.0))

    segs = _bars_to_segments(beats, dur, path, disp_all)
    bpb_out, pos_out = mt.display_meter(bpb, pos)
    return segs, key, conf, beat_chroma, {"bpb": bpb_out, "pos": pos_out}


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


def _apply_key_penalty(em, disp_all, key, penalty=KEY_PENALTY):
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
