#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
GuitarKing — lyric alignment (v1)
=================================
Why: the lyric times `t` of the bot songs were typed by hand (taghas: 30,
37, 47, 51, 54 ...; bazi line 1 was 7 s late). sheet_sync puts every chord
on the beat NEAR its lyric time, so a wrong `t` moves the chord too:
lyrics, chords and music drift apart.

What: forced alignment of the sheet's OWN words to the audio with Meta's
multilingual MMS aligner (torchaudio.pipelines.MMS_FA; Persian goes
through a romanizer: `uroman` when installed, else the built-in map
below). Every sheet segment with words gets
  t  = the time its first word is sung,
  w  = the start time of every word (exact karaoke in the player),
and the report says per line how sure the aligner is and how far the
line moved. A line the aligner is not sure about keeps its old times.

Then run sheet_sync.py again on the output (plain sync, no --fill: the
chords already sit inside the lines) so every ct snaps to the beat near
the NEW lyric time, then --harmonize.

Usage:
  python3 python/lyric_align.py song.mp3 sheet.json [--vocals vocals.wav]
                                [--min-score 0.2] [--no-star] > aligned.json
  --vocals: a vocals stem (e.g. demucs --two-stems=vocals) aligns much
            better than the full mix; the timeline must be the same file.

Needs: torch + torchaudio >= 2.1 (MMS_FA), librosa; uroman optional.
"""
import hashlib
import json
import sys

import numpy as np

SR = 16000
CHUNK_S = 20.0           # wav2vec2 attention is O(T^2): emissions per chunk

# ---------------------------------------------------------------- romanize
# consonant skeleton + the long vowels the script writes; good enough for
# CTC alignment (the blank absorbs the unwritten short vowels)
FA_MAP = {
    "ا": "a", "آ": "a", "أ": "a", "إ": "e", "ب": "b", "پ": "p", "ت": "t",
    "ث": "s", "ج": "j", "چ": "ch", "ح": "h", "خ": "kh", "د": "d", "ذ": "z",
    "ر": "r", "ز": "z", "ژ": "zh", "س": "s", "ش": "sh", "ص": "s", "ض": "z",
    "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "gh", "ک": "k",
    "ك": "k", "گ": "g", "ل": "l", "م": "m", "ن": "n", "ه": "h", "ة": "h",
    "ء": "", "ئ": "y", "ؤ": "v", "\u200c": "", "\u064b": "", "\u064e": "a",
    "\u064f": "o", "\u0650": "e", "\u0651": "", "\u0652": "",
}


def romanize_builtin(word):
    out = []
    for i, ch in enumerate(word):
        if ch == "و":
            out.append("v" if i == 0 else "u")
        elif ch in ("ی", "ي", "ى"):
            out.append("y" if i == 0 else "i")
        elif ch in FA_MAP:
            out.append(FA_MAP[ch])
        elif ch.isascii() and ch.isalpha():
            out.append(ch.lower())
        # digits / punctuation: dropped
    return "".join(out)


def make_romanizer():
    try:
        import uroman as ur  # pip install uroman
        u = ur.Uroman()

        def rom(word):
            try:
                return u.romanize_string(word, lcode="fas").lower()
            except TypeError:
                return u.romanize_string(word).lower()
        return rom, "uroman"
    except Exception:
        return romanize_builtin, "builtin"


# ---------------------------------------------------------------- sheet words
def silent(text):
    t = str(text or "").strip()
    return not t or t == "—"


def sheet_words(sheet):
    """[(seg, words)] in SONG order (sections as listed, lines, segments);
    the sheet lists repeats (chorus, outro) where they are sung."""
    out = []
    for sec in sheet["sections"]:
        for li, line in enumerate(sec["lines"]):
            for si, seg in enumerate(line):
                if silent(seg.get("text")):
                    continue
                words = [w for w in str(seg["text"]).split() if w]
                if words:
                    out.append({"seg": seg, "words": words,
                                "section": sec["label"], "line": li, "si": si})
    return out


# ---------------------------------------------------------------- the aligner
def load_audio(path):
    import librosa
    y, _ = librosa.load(path, sr=SR, mono=True)
    return y.astype(np.float32)


def mms_align(y, tokens_per_word, star=True):
    """CTC forced alignment with torchaudio MMS_FA.
    tokens_per_word: list of romanized words ('' allowed, aligned as None).
    Returns per input word: (start_s, end_s, score) or None."""
    import torch
    import torchaudio

    bundle = torchaudio.pipelines.MMS_FA
    model = bundle.get_model(with_star=star)
    model.eval()
    dictionary = bundle.get_dict(star="*" if star else None)
    tokenizer = bundle.get_tokenizer()
    aligner = bundle.get_aligner()

    # emissions in chunks (full-song attention does not fit)
    wav = torch.from_numpy(y).unsqueeze(0)
    step = int(CHUNK_S * SR)
    ems = []
    with torch.inference_mode():
        for a in range(0, wav.shape[1], step):
            piece = wav[:, a:a + step]
            if piece.shape[1] < 400:
                break
            e, _ = model(piece)
            ems.append(e[0])
    emission = torch.cat(ems, dim=0)
    sec_per_frame = wav.shape[1] / emission.shape[0] / SR

    keep = []
    words = []
    for i, w in enumerate(tokens_per_word):
        w = "".join(ch for ch in w if ch in dictionary and ch not in ("*", "-"))
        if w:
            keep.append(i)
            words.append(w)
    if star:
        # '*' between every word lets the aligner park ad-libs and
        # instrumental parts instead of stretching a word over them
        seq = []
        for w in words:
            seq += ["*", w]
        seq.append("*")
    else:
        seq = words
    spans = aligner(emission, tokenizer(seq))
    if star:
        spans = [s for k, s in enumerate(spans) if seq[k] != "*"]
    out = [None] * len(tokens_per_word)
    for i, sp in zip(keep, spans):
        if not sp:
            continue
        a = sp[0].start * sec_per_frame
        b = sp[-1].end * sec_per_frame
        sc = float(np.mean([t.score for t in sp]))
        out[i] = (round(a, 3), round(b, 3), sc)
    return out


# ---------------------------------------------------------------- apply
def apply_alignment(entries, times, min_score=0.2):
    """entries: sheet_words() output; times: one (start, end, score)|None per
    word, flattened in the same order. Updates t + w of every segment whose
    words aligned with enough confidence; returns the report."""
    rep = []
    k = 0
    last = -1.0
    for e in entries:
        n = len(e["words"])
        tw = times[k:k + n]
        k += n
        got = [x for x in tw if x is not None]
        score = float(np.mean([x[2] for x in got])) if got else 0.0
        seg = e["seg"]
        old = seg.get("t")
        row = {"section": e["section"], "line": e["line"], "seg": e["si"],
               "text": seg.get("text", ""), "old_t": old,
               "score": round(score, 2)}
        if not got or score < min_score or len(got) < max(1, n // 2):
            rep.append(dict(row, type="kept", why="aligner not sure"))
            continue
        # fill words the romanizer dropped by interpolation
        starts = []
        for i, x in enumerate(tw):
            if x is not None:
                starts.append(x[0])
            else:
                starts.append(None)
        idx = [i for i, s in enumerate(starts) if s is not None]
        for i in range(n):
            if starts[i] is None:
                lo = max([j for j in idx if j < i], default=None)
                hi = min([j for j in idx if j > i], default=None)
                if lo is not None and hi is not None:
                    starts[i] = starts[lo] + (starts[hi] - starts[lo]) * (i - lo) / (hi - lo)
                elif lo is not None:
                    starts[i] = starts[lo] + 0.25 * (i - lo)
                else:
                    starts[i] = starts[hi] - 0.25 * (hi - i)
        for i in range(1, n):
            starts[i] = max(starts[i], starts[i - 1] + 0.01)
        if starts[0] <= last:
            rep.append(dict(row, type="kept", why="would run backwards"))
            continue
        seg["t"] = round(starts[0], 3)
        seg["w"] = [round(s, 3) for s in starts]
        last = starts[-1]
        moved = None if not isinstance(old, (int, float)) else round(seg["t"] - old, 2)
        rep.append(dict(row, type="aligned", new_t=seg["t"], moved=moved))
    return rep


def summary(rep):
    al = [r for r in rep if r["type"] == "aligned"]
    mv = [abs(r["moved"]) for r in al if isinstance(r.get("moved"), (int, float))]
    return {"segments": len(rep), "aligned": len(al),
            "kept": sum(1 for r in rep if r["type"] == "kept"),
            "median_move_s": round(float(np.median(mv)), 2) if mv else 0.0,
            "moved_over_1s": sum(1 for m in mv if m > 1.0),
            "moved_over_3s": sum(1 for m in mv if m > 3.0)}


def main():
    args = sys.argv[1:]
    if len(args) < 2:
        print(__doc__)
        sys.exit(1)
    audio, sheet_path = args[0], args[1]
    with open(sheet_path, encoding="utf-8") as f:
        sheet = json.load(f)
    src = args[args.index("--vocals") + 1] if "--vocals" in args else audio
    min_score = float(args[args.index("--min-score") + 1]) \
        if "--min-score" in args else 0.2
    rom, rom_name = make_romanizer()
    entries = sheet_words(sheet)
    flat = [rom(w) for e in entries for w in e["words"]]
    y = load_audio(src)
    times = mms_align(y, flat, star="--no-star" not in args)
    rep = apply_alignment(entries, times, min_score)
    with open(audio, "rb") as f:
        sha = hashlib.sha256(f.read()).hexdigest()
    out = {"sections": sheet["sections"], "report": rep,
           "summary": dict(summary(rep), romanizer=rom_name,
                           audio_sha256=sha, audio_seconds=round(len(y) / SR, 2))}
    if "key" in sheet:
        out["key"] = sheet["key"]
    print(json.dumps(out, ensure_ascii=False, indent=1))
    print("align: " + " ".join(f"{k}={v}" for k, v in out["summary"].items()),
          file=sys.stderr)


if __name__ == "__main__":
    main()
