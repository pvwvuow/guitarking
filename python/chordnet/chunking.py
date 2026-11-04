"""Chunked sequence inference (torch-free helper).

Running the CNN-BiLSTM over a whole 5-7 minute song at once allocated
~1 GB of activations per net and OOM-killed 4 GB machines (bench round 1:
6 long songs died with exit 137). Overlapping windows keep memory flat;
the overlap gives the BiLSTM / instance norm context at every seam and
only the window centres are kept.
"""
import os

import numpy as np

CHUNK = 2048   # frames (~47 s at 22050/512)
PAD = 160      # frames of context on each side (~3.7 s)


def _int_env(name, default):
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


def chunked_apply(fn, x, chunk=None, pad=None):
    """fn: (frames, d) array -> list of (frames, k_i) arrays.
    Applies fn on overlapping windows and stitches the centres."""
    chunk = chunk or _int_env("GK_CHUNK", CHUNK)
    pad = _int_env("GK_CHUNK_PAD", PAD) if pad is None else pad
    n = len(x)
    if n <= chunk + 2 * pad:
        return fn(x)
    out = None
    for s in range(0, n, chunk):
        e = min(n, s + chunk)
        a, b = max(0, s - pad), min(n, e + pad)
        part = fn(x[a:b])
        if out is None:
            out = [np.empty((n,) + p.shape[1:], dtype=p.dtype) for p in part]
        for o, p in zip(out, part):
            o[s:e] = p[s - a:s - a + (e - s)]
    return out
