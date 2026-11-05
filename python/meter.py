"""Beat grid + metrical chord decoding (GuitarKing engine v7.2).

Why: chords in pop music change ON a beat, almost always on the bar line
and sometimes on the half bar. v7 decodes on the BEAT grid with a joint
(chord x bar-position) HMM:
  * a chord change is cheap on beat 1, moderate on the half bar and
    expensive elsewhere -> changes snap to the beat, mostly to the bar;
  * the bar phase is a hidden variable chosen by the decode itself
    (where the harmony really changes), helped by onset accents;
  * 4/4, 3/4 and 6/8 are decoded and the better explanation is kept.

v7.1 (bench round 1):
  * tempo-octave selection: the tracker's tempo competes with x2, x1/2,
    x3/2, x2/3, x4/3, x3/4. A grid wins when the HARMONY (chord-change
    novelty) and the onsets sit on its beats. A non-commensurate grid
    (e.g. 123 BPM on a 94/47 BPM song) put changes between beats;
  * 6/8 meter: fast triple pulses (an eighth-note grid) no longer allow a
    change every half bar;
  * every decode knob can be overridden by an environment variable
    (GK_CP4, GK_CP3, GK_CP6, GK_CP8, GK_SLIP_P, GK_ACCENT_W,
    GK_METER_PRIOR, GK_TEMPO_SELECT, GK_TEMPO_CENTER, GK_TEMPO_PRIOR_W,
    GK_TEMPO_MARGIN, GK_TEMPO_RATIO_EVIDENCE, GK_FAST_BPM)
    so python/sweep.py can tune them against the benchmark.

v7.2 (bench round 2): on the trusted refs songs whose grid is fast
(129-161 BPM) wrote ~2x the human sheet's chord changes, slower songs
~1.0-1.3x: a fast grid simply offers twice the change slots. Above
GK_FAST_BPM the decode uses 8-beat "bars" (two 4/4 bars, cheap change on
1, moderate on 5) or 6/8 instead of 4/4 / 3/4. Defaults moved toward the
round-2 sweep winner (lower mid-bar change probability).
"""
import math
import os

import numpy as np
import librosa

HOP = 512
VERSION = "7.2"

# P(chord change) when ARRIVING on bar position q (index 0 = downbeat)
CHANGE_P = {
    4: (0.25, 0.005, 0.03, 0.005),
    3: (0.30, 0.012, 0.012),
    6: (0.30, 0.005, 0.005, 0.04, 0.005, 0.005),
    8: (0.30, 0.004, 0.004, 0.004, 0.15, 0.004, 0.004, 0.004),
}
SLIP_P = 0.002        # beat tracker dropped / doubled a beat
ACCENT_W = 0.35       # weight of the onset accent on the downbeat state
METER_PRIOR = {4: 0.65, 3: 0.17, 6: 0.18, 8: 0.65}
METERS = (4, 3, 6)
FAST_METERS = (8, 6)
FAST_BPM = 125.0      # grids faster than this decode with FAST_METERS

TEMPO_RATIOS = (1.0, 2.0, 0.5, 1.5, 2.0 / 3.0, 4.0 / 3.0, 0.75)
TEMPO_MIN, TEMPO_MAX = 50.0, 200.0
TEMPO_CENTER = 100.0  # BPM; gentle log-tempo prior between octaves
TEMPO_PRIOR_W = 0.35
TEMPO_MARGIN = 0.06   # an alternative grid must win by this much
TEMPO_RATIO_EVIDENCE = 0.15  # x3/2, x2/3, x4/3, x3/4 need real evidence


# ----------------------------------------------------------------------
# Knobs (environment overrides, read at call time)
# ----------------------------------------------------------------------

def _env(name):
    v = os.environ.get("GK_" + name)
    return v.strip() if v and v.strip() else None


def knob(name, default):
    v = _env(name)
    if v is None:
        return default
    try:
        return type(default)(v)
    except ValueError:
        return default


def _floats(v):
    return tuple(float(x) for x in v.replace("/", ",").split(",") if x.strip())


def change_p(bpb):
    v = _env("CP%d" % bpb)
    if v:
        try:
            cp = _floats(v)
            if len(cp) == bpb and all(0.0 < x < 1.0 for x in cp):
                return cp
        except ValueError:
            pass
    return CHANGE_P[bpb]


def meter_prior():
    v = _env("METER_PRIOR")          # e.g. "4:0.65/3:0.17/6:0.18"
    pri = dict(METER_PRIOR)
    if v:
        try:
            for part in v.replace(",", "/").split("/"):
                if ":" in part:
                    k, p = part.split(":", 1)
                    pri[int(k)] = float(p)
        except ValueError:
            pri = dict(METER_PRIOR)
    return {k: math.log(max(p, 1e-6)) for k, p in pri.items() if p > 0}


# ----------------------------------------------------------------------
# Beat grid
# ----------------------------------------------------------------------

def regularize(bt, period, dur):
    """Fill tracker gaps, drop doubles, extend the grid over [0, dur)."""
    out = []
    for t in np.asarray(bt, dtype=float):
        if out and t - out[-1] < 0.5 * period:
            continue
        if out:
            gap = t - out[-1]
            n = int(round(gap / period))
            if n >= 2:
                base, step = out[-1], gap / n
                out.extend([base + step * k for k in range(1, n)])
        out.append(float(t))
    if not out:
        out = [0.0]
    head = []
    t = out[0] - period
    while t > 0.15 * period:
        head.append(t)
        t -= period
    out = head[::-1] + out
    t = out[-1] + period
    while t < dur - 0.25 * period:
        out.append(t)
        t += period
    return np.array(out, dtype=float)


def beat_accent(oenv, beats, sr, hop=HOP):
    """z-scored onset strength right on every beat."""
    ot = librosa.frames_to_time(np.arange(len(oenv)), sr=sr, hop_length=hop)
    idx = np.searchsorted(ot, beats)
    a = np.zeros(len(beats))
    for i, k in enumerate(idx):
        lo, hi = max(0, k - 2), min(len(oenv), k + 3)
        a[i] = float(oenv[lo:hi].max()) if hi > lo else 0.0
    sd = a.std()
    a = (a - a.mean()) / sd if sd > 1e-9 else np.zeros_like(a)
    return np.clip(a, -2.0, 3.0)


def harmonic_novelty(y, sr, hop=HOP):
    """Frame-wise positive chroma change (where the harmony moves)."""
    ch = librosa.feature.chroma_stft(y=y, sr=sr, hop_length=hop, n_fft=4096)
    ch = ch / np.maximum(ch.sum(axis=0, keepdims=True), 1e-9)
    ch = librosa.decompose.nn_filter(ch, aggregate=np.median, metric="cosine",
                                     width=3) if ch.shape[1] > 64 else ch
    nov = np.zeros(ch.shape[1])
    lag = 4
    if ch.shape[1] > 2 * lag:
        nov[lag:] = 0.5 * np.abs(ch[:, lag:] - ch[:, :-lag]).sum(axis=0)
        nov = np.roll(nov, -lag // 2)
    return nov


def _grid_energy(env, grid, sr, hop, half=2):
    ot_idx = librosa.time_to_frames(grid, sr=sr, hop_length=hop)
    e = 0.0
    for k in ot_idx:
        lo, hi = max(0, k - half), min(len(env), k + half + 1)
        if hi > lo:
            e += float(env[lo:hi].max())
    return e / max(len(grid), 1)


def fix_offbeat(beats, period, oenv, nov, sr, dur, hop=HOP):
    """Trackers like to lock onto hi-hats on the OFF-beat. Chords change on
    the beat, so the half-period-shifted grid wins when the harmony (and
    the low-band onsets) move on it instead."""
    alt = beats + 0.5 * period
    alt = alt[alt < dur]
    alt = regularize(alt, period, dur)

    def score(g):
        n = _grid_energy(nov, g, sr, hop)
        o = _grid_energy(oenv, g, sr, hop)
        return n / (np.mean(nov) + 1e-9) + 0.25 * o / (np.mean(oenv) + 1e-9)

    return alt if score(alt) > 1.05 * score(beats) else beats


def _peaks(env, rel=1.0):
    """Salient local maxima of an envelope -> (frame idx, weight)."""
    env = np.asarray(env, dtype=float)
    if len(env) < 8:
        return np.array([], dtype=int), np.array([])
    thr = np.median(env) + rel * np.std(env)
    loc = np.where((env[1:-1] > env[:-2]) & (env[1:-1] >= env[2:])
                   & (env[1:-1] > thr))[0] + 1
    return loc, env[loc] - thr


def phase_lock(times, w, grid, div=1):
    """Circular concentration (0..1) of events on the grid: 1 = every event
    sits exactly on a grid beat (div=1) / on beat k*div (div>1)."""
    g = np.asarray(grid, dtype=float)
    if len(times) == 0 or len(g) < 4 or np.sum(w) <= 0:
        return 0.0
    idx = np.interp(times, g, np.arange(len(g)),
                    left=np.nan, right=np.nan)
    ok = np.isfinite(idx)
    if ok.sum() < 3:
        return 0.0
    ph = 2.0 * np.pi * idx[ok] / div
    ww = np.asarray(w)[ok]
    return float(np.abs(np.sum(ww * np.exp(1j * ph))) / np.sum(ww))


def grid_score(grid, period, harm, onset, prior_w=None, center=None):
    """How well a beat grid explains the music.

    harm/onset: (event times, weights). Harmony changes must land on beats
    (and repeat at the bar scale); onsets must sit on the beats; a gentle
    log-tempo prior settles octave ties."""
    prior_w = TEMPO_PRIOR_W if prior_w is None else prior_w
    center = TEMPO_CENTER if center is None else center
    h1 = phase_lock(harm[0], harm[1], grid, 1)
    hb = max(phase_lock(harm[0], harm[1], grid, b) for b in (3, 4))
    o1 = phase_lock(onset[0], onset[1], grid, 1)
    bpm = 60.0 / period
    prior = -prior_w * math.log2(bpm / center) ** 2
    return h1 + 0.5 * hb + 0.5 * o1 + prior, {
        "h1": round(h1, 3), "hb": round(hb, 3), "o1": round(o1, 3),
        "prior": round(prior, 3)}


def _track(oenv, sr, hop, dur, bpm=None):
    try:
        kw = {"bpm": float(bpm)} if bpm else {}
        _tempo, bf = librosa.beat.beat_track(onset_envelope=oenv, sr=sr,
                                             hop_length=hop, trim=False, **kw)
        bt = librosa.frames_to_time(np.atleast_1d(bf), sr=sr, hop_length=hop)
    except Exception:
        bt = np.array([])
    bt = np.asarray(bt, dtype=float)
    return bt[(bt >= 0) & (bt < dur)]


def _period_of(bt, default=0.5):
    if len(bt) >= 8:
        d = np.diff(bt)
        d = d[(d > 0.2) & (d < 2.0)]
        if len(d):
            return float(np.median(d))
    return default


def select_tempo(y, sr, dur, oenv, nov, bt0, period0, hop=HOP, lo=None):
    """Tempo-octave / ratio competition around the tracker's estimate.
    -> (beats, period, info)"""
    ft = librosa.frames_to_time(np.arange(len(nov)), sr=sr, hop_length=hop)
    hi_, hw = _peaks(nov, 1.0)
    harm = (ft[hi_], hw)
    oi, ow = _peaks(lo if lo is not None else oenv, 1.0)
    fo = librosa.frames_to_time(np.arange(len(oenv)), sr=sr, hop_length=hop)
    onset = (fo[oi], ow)
    prior_w = knob("TEMPO_PRIOR_W", TEMPO_PRIOR_W)
    center = knob("TEMPO_CENTER", TEMPO_CENTER)
    margin = knob("TEMPO_MARGIN", TEMPO_MARGIN)

    t0 = 60.0 / period0
    base = regularize(bt0, period0, dur) if len(bt0) >= 8 else \
        np.arange(0.0, dur, period0)
    base = fix_offbeat(base, period0, lo if lo is not None else oenv, nov,
                       sr, dur, hop)
    s0, d0 = grid_score(base, period0, harm, onset, prior_w, center)
    cands = [{"bpm": round(t0, 1), "ratio": 1.0, "score": round(s0, 3),
              **d0}]
    best = (s0, base, period0)
    tried = [t0]
    for r in TEMPO_RATIOS[1:]:
        tb = t0 * r
        if not (TEMPO_MIN <= tb <= TEMPO_MAX):
            continue
        if any(abs(tb - x) / x < 0.04 for x in tried):
            continue
        tried.append(tb)
        bt = _track(oenv, sr, hop, dur, bpm=tb)
        p = _period_of(bt, 60.0 / tb)
        if len(bt) < 8 or abs(60.0 / p - tb) / tb > 0.08:
            continue
        g = regularize(bt, p, dur)
        g = fix_offbeat(g, p, lo if lo is not None else oenv, nov, sr, dur,
                        hop)
        s, d = grid_score(g, p, harm, onset, prior_w, center)
        cands.append({"bpm": round(60.0 / p, 1), "ratio": round(r, 3),
                      "score": round(s, 3), **d})
        octave = r in (2.0, 0.5)
        # a non-octave ratio changes WHERE the beats are, not just how many:
        # it must be earned by the music itself, never by the tempo prior
        earned = octave or (s - d["prior"]) > (s0 - d0["prior"]) + \
            knob("TEMPO_RATIO_EVIDENCE", TEMPO_RATIO_EVIDENCE)
        if earned and s > best[0] and s > s0 + margin:
            best = (s, g, p)
    return best[1], best[2], {"candidates": cands,
                              "chosen": round(60.0 / best[2], 1)}


LAST_TEMPO_INFO = {}


def track_beats(y, sr, dur, hop=HOP):
    """-> (beat times covering [0, dur), beat period, per-beat accent)."""
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    bt = _track(oenv, sr, hop, dur)
    period = _period_of(bt, 0.5)
    if len(bt) < 8:
        bt = np.arange(0.0, dur, period)
    period = float(np.clip(period, 0.25, 1.5))
    LAST_TEMPO_INFO.clear()
    try:
        lo = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop,
                                          fmax=250.0, n_mels=32)
        nov = harmonic_novelty(y, sr, hop)
    except Exception:
        lo, nov = None, None
    if nov is not None and knob("TEMPO_SELECT", 1):
        try:
            beats, period, info = select_tempo(y, sr, dur, oenv, nov, bt,
                                               period, hop, lo)
            LAST_TEMPO_INFO.update(info)
            return beats, period, beat_accent(oenv, beats, sr, hop)
        except Exception:
            pass
    beats = regularize(bt, period, dur)
    if nov is not None:
        try:
            beats = fix_offbeat(beats, period, lo, nov, sr, dur, hop)
        except Exception:
            pass
    return beats, period, beat_accent(oenv, beats, sr, hop)


def cell_index(times, grid):
    """Grid cell of every time stamp (times before grid[0] -> cell 0)."""
    return np.clip(np.searchsorted(grid, times, side="right") - 1,
                   0, max(len(grid) - 1, 0))


def pool_cells(M, cell_of_frame, n_cells, agg=np.median):
    """(d, frames) -> (d, n_cells) pooled per grid cell (empty -> 0)."""
    out = np.zeros((M.shape[0], n_cells))
    order = np.argsort(cell_of_frame, kind="stable")
    cs = cell_of_frame[order]
    starts = np.searchsorted(cs, np.arange(n_cells), side="left")
    ends = np.searchsorted(cs, np.arange(n_cells), side="right")
    for j in range(n_cells):
        if ends[j] > starts[j]:
            out[:, j] = agg(M[:, order[starts[j]:ends[j]]], axis=1)
    return out


# ----------------------------------------------------------------------
# Metrical Viterbi
# ----------------------------------------------------------------------

_OFFS = np.array([1, 0, 2])   # advance one beat / slip (stay) / skip one


def metrical_viterbi(logem, bpb, accent=None, change_prob=None):
    """Joint (bar position x chord) Viterbi over beats.

    logem: (n_chords, n_beats) log emissions.
    Returns (chord path, bar-position path, total log score)."""
    S, T = logem.shape
    cp = np.asarray(change_prob if change_prob is not None
                    else change_p(bpb), dtype=float)
    lmove, lstay = np.log(cp), np.log(1.0 - cp)
    slip = knob("SLIP_P", SLIP_P)
    opts_w = np.array([math.log(1.0 - 2 * slip), math.log(slip),
                       math.log(slip)])
    acc = np.zeros((bpb, T))
    if accent is not None and len(accent):
        a = np.zeros(T)
        m = min(T, len(accent))
        a[:m] = accent[:m]
        acc[0] = knob("ACCENT_W", ACCENT_W) * a
    rows = np.arange(bpb)
    dp = logem[:, 0][None, :] + acc[:, 0][:, None] - math.log(bpb)
    bc = np.zeros((T, bpb, S), dtype=np.int32)
    bq = np.zeros((T, bpb, S), dtype=np.int8)
    ar = np.arange(S)
    for t in range(1, T):
        stack = np.stack([np.roll(dp, int(o), axis=0) + w
                          for o, w in zip(_OFFS, opts_w)])
        k = stack.argmax(axis=0)                        # (bpb, S)
        pb = np.take_along_axis(stack, k[None], 0)[0]   # (bpb, S)
        stay = pb + lstay[:, None]
        mv_arg = pb.argmax(axis=1)
        mv = pb[rows, mv_arg] + lmove
        use_mv = mv[:, None] > stay
        dp = (np.where(use_mv, mv[:, None], stay) + logem[:, t][None, :]
              + acc[:, t][:, None])
        bc[t] = np.where(use_mv, mv_arg[:, None], ar[None, :])
        k_used = np.where(use_mv, k[rows, mv_arg][:, None], k)
        bq[t] = (rows[:, None] - _OFFS[k_used]) % bpb
    flat = int(np.argmax(dp))
    q, s = divmod(flat, S)
    score = float(dp[q, s])
    path = np.zeros(T, dtype=np.int32)
    pos = np.zeros(T, dtype=np.int32)
    path[-1], pos[-1] = s, q
    for t in range(T - 1, 0, -1):
        s, q = int(bc[t, q, s]), int(bq[t, q, s])
        path[t - 1], pos[t - 1] = s, q
    return path, pos, score


def meters_for(period=None):
    """Meters to decode with: fast grids get 8-beat bars / 6/8."""
    if period and 60.0 / period > knob("FAST_BPM", FAST_BPM):
        return FAST_METERS
    return METERS


def decode_meter(logem, accent=None, meters=None, period=None):
    """Decode under every meter; keep the best (with a meter prior).
    period (s) selects the fast-grid meters when given."""
    if meters is None:
        meters = meters_for(period)
    best = None
    pri = meter_prior()
    for b in meters:
        if b not in pri:
            continue
        path, pos, sc = metrical_viterbi(logem, b, accent)
        sc += pri[b]
        if best is None or sc > best["score"]:
            best = {"path": path, "pos": pos, "score": sc, "bpb": b}
    if best is None:
        path, pos, sc = metrical_viterbi(logem, 4, accent)
        best = {"path": path, "pos": pos, "score": sc, "bpb": 4}
    return best


def display_meter(bpb, pos):
    """8-beat decode bars are two 4/4 bars for the player."""
    pos = np.asarray(pos)
    if int(bpb) == 8:
        return 4, pos % 4
    return int(bpb), pos


def merge_short(path, em, min_beats):
    """Absorb chord runs shorter than min_beats beats into the neighbour
    chord that explains those beats best (sum of beat log emissions).
    Silence runs (state 0 = N) are never merged or merged into."""
    path = np.array(path, dtype=np.int32)
    if min_beats <= 1 or len(path) < 3:
        return path
    skip = set()
    while True:
        runs = []
        s = 0
        for i in range(1, len(path) + 1):
            if i == len(path) or path[i] != path[s]:
                runs.append((s, i, int(path[s])))
                s = i
        cand = [(e - a, a, k) for k, (a, e, c) in enumerate(runs)
                if e - a < min_beats and c != 0 and a not in skip]
        if not cand or len(runs) < 2:
            break
        _l, a, k = min(cand)
        e = runs[k][1]
        nbrs = [runs[j][2] for j in (k - 1, k + 1)
                if 0 <= j < len(runs) and runs[j][2] != 0]
        if not nbrs:
            skip.add(a)
            continue
        path[a:e] = max(nbrs, key=lambda c: float(em[c, a:e].sum()))
    return path


def downbeat_times(beats, pos):
    beats = np.asarray(beats, dtype=float)
    pos = np.asarray(pos)
    m = min(len(beats), len(pos))
    return beats[:m][pos[:m] == 0]
