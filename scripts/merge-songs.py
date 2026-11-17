#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Merge sheet_sync QA output (sections) back into src/lib/songs.ts.
Same splicer as the fill pass: repo TS style, only the `sections` blocks of
the given slugs are replaced."""
import json
import sys

REPO = "/home/z/my-project/guitarking-repo"
SONGS = f"{REPO}/src/lib/songs.ts"


def ts_num(x):
    if isinstance(x, bool):
        return "true" if x else "false"
    if isinstance(x, int):
        return str(x)
    return f"{round(float(x), 3):g}"


def ts_str(s):
    return "'" + str(s).replace("\\", "\\\\").replace("'", "\\'") + "'"


def ts_seg(seg, ind):
    p = " " * ind
    lines = [f"{p}{{"]
    lines.append(f"{p}  chord: {ts_str(seg['chord'])},")
    lines.append(f"{p}  text: {ts_str(seg.get('text', '—'))},")
    lines.append(f"{p}  t: {ts_num(seg.get('t', 0))},")
    if isinstance(seg.get("ct"), (int, float)):
        lines.append(f"{p}  ct: {ts_num(seg['ct'])},")
    if isinstance(seg.get("w"), list) and seg["w"]:
        w = ", ".join(ts_num(x) for x in seg["w"])
        lines.append(f"{p}  w: [{w}],")
    if seg.get("auto"):
        lines.append(f"{p}  auto: true,")
    lines.append(f"{p}}},")
    return "\n".join(lines)


def ts_sections(sections):
    out = ["  sections: ["]
    for sec in sections:
        out.append("    {")
        out.append(f"      label: {ts_str(sec['label'])},")
        out.append("      lines: [")
        for line in sec["lines"]:
            if not line:
                continue
            out.append("        [")
            for seg in line:
                out.append(ts_seg(seg, 10))
            out.append("        ],")
        out.append("      ],")
        out.append("    },")
    out.append("  ],")
    return "\n".join(out) + "\n"


def splice(src, slug, block):
    i = src.index(f"  slug: '{slug}',")
    j = src.index("\n  sections: [\n", i) + 1
    k = src.index("[", j)
    depth = 0
    while True:
        c = src[k]
        if c == "[":
            depth += 1
        elif c == "]":
            depth -= 1
            if depth == 0:
                break
        k += 1
    end = src.index("\n", k) + 1
    return src[:j] + block + src[end:]


src = open(SONGS, encoding="utf-8").read()
for slug in sys.argv[1:]:
    d = json.load(open(f"/home/z/my-project/work/{slug}-qa-out.json",
                       encoding="utf-8"))
    n = sum(len(l) for s in d["sections"] for l in s["lines"])
    src = splice(src, slug, ts_sections(d["sections"]))
    print(f"{slug}: {n} segments merged")
open(SONGS, "w", encoding="utf-8").write(src)
print("songs.ts updated")
