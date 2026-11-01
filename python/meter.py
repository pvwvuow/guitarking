"""Beat grid + metrical chord decoding (GuitarKing engine v7).

Why: chords in pop music change ON a beat, almost always on the bar line
and sometimes on the half bar. v6 decoded one chord per *bar* on a bar
grid whose phase came from a single onset heuristic. When that phase was
off by a beat or two, every change landed early/late, two chords shared
one bar (blurred label = wrong chord) and a half-bar change could not be
represented at all.

v7 decodes on the BEAT grid with a joint (chord x bar-position) HMM:
  * a chord change is cheap on beat 1, moderate on beat 3 and expensive
    on beats 2/4 -> changes snap to the beat, mostly to the bar line;
  * the bar phase is a hidden variable chosen by the decode itself
    (where the harmony really changes), helped by onset accents;
  * 4/4 and 3/4 are both decoded and the better explanation is kept.
"""
import math

import numpy as np
import librosa

HOP = 512

# P(chord change) when ARRIVING on bar position q (index 0 = downbeat)
CHANGE_P = {
    4: (0.30, 0.012, 0.08, 0.012),
    3: (0.30, 0.015, 0.015),
}
SLIP_P = 0.002        # beat tracker dropped / doubled a beat
ACCENT_W = 0.35       # weight of the onset accent on the downbeat state
METER_PRIOR = {4: math.log(0.75), 3: math.log(0.25)}


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


def track_beats(y, sr, dur, hop=HOP):
    """-> (beat times covering [0, dur), beat period, per-beat accent)."""
    oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
    try:
        _tempo, bf = librosa.beat.beat_track(onset_envelope=oenv, sr=sr,
                                             hop_length=hop, trim=False)
        bt = librosa.frames_to_time(np.atleast_1d(bf), sr=sr, hop_length=hop)
    except Exception:
        bt = np.array([])
    bt = np.asarray(bt, dtype=float)
    bt = bt[(bt >= 0) & (bt < dur)]
    period = 0.5
    if len(bt) >= 8:
        d = np.diff(bt)
        d = d[(d > 0.2) & (d < 2.0)]
        if len(d):
            period = float(np.median(d))
    else:
        bt = np.arange(0.0, dur, period)
    period = float(np.clip(period, 0.25, 1.5))
    beats = regularize(bt, period, dur)
    try:
        lo = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop,
                                          fmax=250.0, n_mels=32)
        beats = fix_offbeat(beats, period, lo, harmonic_novelty(y, sr, hop),
                            sr, dur, hop)
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


def metrical_viterbi(logem, bpb, accent=None, change_p=None):
    """Joint (bar position x chord) Viterbi over beats.

    logem: (n_chords, n_beats) log emissions.
    Returns (chord path, bar-position path, total log score)."""
    S, T = logem.shape
    cp = np.asarray(change_p if change_p is not None else CHANGE_P[bpb],
                    dtype=float)
    lmove, lstay = np.log(cp), np.log(1.0 - cp)
    opts_w = np.array([math.log(1.0 - 2 * SLIP_P), math.log(SLIP_P),
                       math.log(SLIP_P)])
    acc = np.zeros((bpb, T))
    if accent is not None and len(accent):
        a = np.zeros(T)
        m = min(T, len(accent))
        a[:m] = accent[:m]
        acc[0] = ACCENT_W * a
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


def decode_meter(logem, accent=None, meters=(4, 3)):
    """Decode under every meter; keep the best (with a 4/4 prior)."""
    best = None
    for b in meters:
        path, pos, sc = metrical_viterbi(logem, b, accent)
        sc += METER_PRIOR.get(b, 0.0)
        if best is None or sc > best["score"]:
            best = {"path": path, "pos": pos, "score": sc, "bpb": b}
    return best


def downbeat_times(beats, pos):
    beats = np.asarray(beats, dtype=float)
    pos = np.asarray(pos)
    m = min(len(beats), len(pos))
    return beats[:m][pos[:m] == 0]
