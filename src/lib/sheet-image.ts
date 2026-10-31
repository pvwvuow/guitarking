/* Renders Guitar King chord sheets as ONE shareable PNG on a canvas.
   Fixed A4 portrait sheet (1240×1754 @150dpi). Long songs never spill
   into extra images: the flow first widens into magazine columns
   (1 → 2 → 3) and only then steps the type size down until everything
   fits the single sheet. No section captions — one continuous piece.
   Paper look: warm white, ink+wood double frame, watermark emblem,
   chords above lyrics, guitarking.ir credit at the foot. */

import type { AnalysisResult, ChordSegment } from "./types";
import type { SongEntry } from "./songs";
import { transposeChord } from "./transpose";
import { fmtTime, keyLabelLatin } from "./format";

/* ── palette (mirrors the site theme) ── */
const INK = "#2e2924";
const INK_SOFT = "#3d3730";
const MUTED = "#7a7264";
const RED = "#c13b32";
const WOOD = "#b17f4e";
const PAPER = "#fdfcf7";
const LINE = "#e6dfd2";

/* A4 portrait @ 150dpi */
const W = 1240;
const H = 1754;
const M = 88; // page margin
const CW = W - M * 2; // content width

const F_BODY = 'Vazirmatn, "Segoe UI", Tahoma, sans-serif';
const F_TITLE = 'Vazirmatn, "Segoe UI", Tahoma, sans-serif';
const F_BRAND = '"Cinzel Decorative", Vazirmatn, serif';

export const SHEET_CREDIT = "guitarking.ir";

type Ctx = CanvasRenderingContext2D;

/* ── low-level helpers ──────────────────────────────────────────────── */

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error("image load failed"));
    im.src = src;
  });
}

async function loadEmblem(): Promise<HTMLImageElement | null> {
  try {
    return await loadImage("/emblem.png");
  } catch {
    return null;
  }
}

async function ensureFonts(): Promise<void> {
  const wanted = [
    '400 27px Vazirmatn',
    '500 28px Vazirmatn',
    '700 22px Vazirmatn',
    '800 29px Vazirmatn',
    '700 24px "Cinzel Decorative"',
  ];
  try {
    await Promise.all(
      wanted.map((f) => document.fonts.load(f).catch(() => undefined))
    );
    await document.fonts.ready;
  } catch {
    /* fonts unavailable — system fallback still renders */
  }
}

function rr(ctx: Ctx, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  const rad = Math.min(r, w / 2, h / 2);
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function diamond(ctx: Ctx, cx: number, cy: number, s: number, color: string) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy - s);
  ctx.lineTo(cx + s, cy);
  ctx.lineTo(cx, cy + s);
  ctx.lineTo(cx - s, cy);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** set latin (LTR) text mode */
function latin(ctx: Ctx) {
  ctx.direction = "ltr";
}
/** set persian (RTL) text mode */
function fa(ctx: Ctx) {
  ctx.direction = "rtl";
}

/* ── page furniture ─────────────────────────────────────────────────── */

function drawFrame(ctx: Ctx) {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);
  // outer ink frame
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(24, 24, W - 48, H - 48);
  // inner wood frame
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.75;
  ctx.strokeRect(36, 36, W - 72, H - 72);
  ctx.globalAlpha = 1;
  // corner diamonds (inner frame corners)
  const c = 36;
  const s = 5;
  diamond(ctx, c, c, s, WOOD);
  diamond(ctx, W - c, c, s, WOOD);
  diamond(ctx, c, H - c, s, WOOD);
  diamond(ctx, W - c, H - c, s, WOOD);
  ctx.restore();
}

function brandRow(ctx: Ctx, y: number): number {
  // centered: ✦ GUITAR KING ✦
  latin(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.save();
  try {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = "5px";
  } catch {
    /* older browsers */
  }
  ctx.font = `700 22px ${F_BRAND}`;
  ctx.fillStyle = INK;
  ctx.fillText("GUITAR KING", W / 2, y);
  ctx.restore();
  const brandW = Math.max(ctx.measureText("GUITAR KING").width + 30, 190);
  diamond(ctx, W / 2 - brandW / 2 - 20, y - 8, 4.5, RED);
  diamond(ctx, W / 2 + brandW / 2 + 20, y - 8, 4.5, RED);
  return y;
}

function ornamentRule(ctx: Ctx, y: number): number {
  ctx.save();
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(M, y);
  ctx.lineTo(W - M, y);
  ctx.stroke();
  diamond(ctx, W / 2, y, 5, WOOD);
  ctx.restore();
  return y;
}

function drawWatermark(ctx: Ctx, img: HTMLImageElement | null, cy: number) {
  if (!img) return;
  const h = 700;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.drawImage(img, W / 2 - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function footer(ctx: Ctx, y: number): number {
  ornamentRule(ctx, y);
  latin(ctx);
  ctx.textAlign = "center";
  ctx.save();
  try {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = "2px";
  } catch {
    /* noop */
  }
  ctx.font = `700 21px ${F_BRAND}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(SHEET_CREDIT, W / 2, y + 42);
  ctx.restore();
  return y + 42;
}

/** centered meta line: parts separated by small red diamonds */
function metaLine(ctx: Ctx, parts: string[], y: number): number {
  fa(ctx);
  ctx.font = `500 21px ${F_BODY}`;
  ctx.fillStyle = INK_SOFT;
  const gap = 26;
  const widths = parts.map((p) => ctx.measureText(p).width);
  const total =
    widths.reduce((a, b) => a + b, 0) + gap * 2 * (parts.length - 1);
  let x = W / 2 - total / 2;
  parts.forEach((p, i) => {
    ctx.textAlign = "left";
    ctx.fillText(p, x, y);
    x += widths[i] + gap;
    if (i < parts.length - 1) {
      diamond(ctx, x, y - 7, 4, RED);
      x += gap;
    }
  });
  return y;
}

/* ── download ───────────────────────────────────────────────────────── */

async function savePng(canvas: HTMLCanvasElement, name: string) {
  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png")
  );
  if (!blob) throw new Error("export failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ── single-sheet fitting engine ──────────────────────────────────────
   One continuous flow of rows. For a candidate type size and column
   count we measure every row, then greedily fill the columns top-down
   (right to left, RTL). The first (size, columns) pair that fits wins;
   sizes step down only after 3 columns still overflow. */

interface Row {
  h: number;
  paint: (ctx: Ctx, colRight: number, colW: number, y: number) => void;
}

const FONT_SIZES = [
  34, 32, 30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15,
];
const COL_GAP = 46;

/** greedy pack rows into `cols` columns of height `ch`; false if overflow */
function packRows(rows: Row[], ch: number, cols: number): boolean {
  let used = 0;
  let col = 0;
  for (const r of rows) {
    if (used + r.h > ch) {
      col += 1;
      used = 0;
      if (col >= cols) return false;
    }
    used += r.h;
  }
  return true;
}

/** columns flow right→left (RTL); returns left x of column c */
function colLeft(c: number, colW: number, cols: number): number {
  return W - M - colW - c * (colW + COL_GAP);
}

/* ── song sheet (archive entries, with lyrics) ──────────────────────── */

interface Seg {
  chord: string;
  text: string;
  /** width of the whole segment box at current size */
  w: number;
  /** local shrink factor for over-wide segments (rare) */
  k: number;
}

function layoutSongRows(
  ctx: Ctx,
  song: SongEntry,
  semi: number,
  F: number,
  colW: number
): Row[] {
  const t = (c: string) => transposeChord(c, semi);
  const chordFont = (k = 1) => `800 ${Math.max(13, (F + 2) * k)}px ${F_BODY}`;
  const textFont = (k = 1) => `400 ${Math.max(12, F * k)}px ${F_BODY}`;
  /* vertical rhythm: compact chord↔lyric pairing — the user asked to
     kill the dead air between a chord and its word; rows still breathe
     enough that a chord can't be misread as belonging to the line above */
  const chordOff = F * 0.92; // chord baseline from row top
  const lyricOff = chordOff + F * 0.2 + F * 0.95; // lyric baseline
  const rowH = lyricOff + F * 0.3; // room for descenders
  const rowGap = F * 1.35; // air between rows
  const segPad = 8;
  const segGap = Math.max(20, F * 1.2);

  fa(ctx);
  ctx.font = textFont();
  const textW = (s: string, k = 1) => {
    ctx.font = textFont(k);
    return ctx.measureText(s).width;
  };
  latin(ctx);
  const chordW = (s: string, k = 1) => {
    ctx.font = chordFont(k);
    return ctx.measureText(s).width;
  };

  const rows: Row[] = [];

  for (const sec of song.sections) {
    for (const line of sec.lines) {
      // measure segments; wrap into visual lines within colW
      let cur: Seg[] = [];
      let curW = 0;
      const flush = () => {
        if (!cur.length) return;
        const segs = cur;
        rows.push({
          h: rowH + rowGap,
          paint: (c2, colRight, _cw, y) => {
            let x = colRight; // RTL flow, from the right edge
            for (const sg of segs) {
              const cx = x - sg.w / 2;
              const k = sg.k;
              // chord
              latin(c2);
              c2.textAlign = "center";
              c2.font = chordFont(k);
              c2.fillStyle = RED;
              c2.fillText(t(sg.chord), cx, y);
              // lyric
              fa(c2);
              c2.font = textFont(k);
              c2.fillStyle = INK_SOFT;
              c2.fillText(sg.text, cx, y + lyricOff);
              x -= sg.w + segGap;
            }
          },
        });
        cur = [];
        curW = 0;
      };
      for (const seg of line) {
        const tw = textW(seg.text);
        const chw = chordW(seg.chord);
        let w = Math.max(tw, chw) + segPad * 2;
        let k = 1;
        if (w > colW) {
          // over-wide segment: shrink locally (floor 0.55)
          k = Math.max(0.55, (colW - segPad * 2) / w);
          w = colW;
        }
        if (curW + w > colW && cur.length) flush();
        cur.push({ chord: seg.chord, text: seg.text, w, k });
        curW += w + segGap;
      }
      flush();
    }
  }
  return rows;
}

/* header: brand, title, artist, meta line; returns body top y */
function paintSongHeader(ctx: Ctx, song: SongEntry, semi: number): number {
  let y = brandRow(ctx, 96) + 26;
  ornamentRule(ctx, y);
  y += 78;

  fa(ctx);
  ctx.textAlign = "center";
  ctx.font = `700 58px ${F_TITLE}`;
  ctx.fillStyle = INK;
  let title = song.title;
  while (ctx.measureText(title).width > CW && title.length > 4)
    title = title.slice(0, -2);
  ctx.fillText(title, W / 2, y);
  y += 56;

  ctx.font = `500 28px ${F_BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(song.artist, W / 2, y);
  y += 52;

  const parts = [song.genre, `گام ${transposeChord(song.key, semi)}`];
  if (song.tempo) parts.push(`تمپو ${song.tempo}`);
  parts.push(`سطح ${song.difficulty}`);
  if (semi !== 0)
    parts.push(`تغییر ${semi > 0 ? "+" : ""}${semi} نیم‌پرده`);
  metaLine(ctx, parts, y);
  y += 30;
  ornamentRule(ctx, y);
  y += 64;
  return y;
}

export async function downloadSongSheetImage(
  song: SongEntry,
  semi: number
): Promise<void> {
  await ensureFonts();
  const emblem = await loadEmblem();

  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("canvas unavailable");

  const bodyTop = paintSongHeader(sctx, song, semi);
  const footTop = H - 132;
  const ch = footTop - bodyTop - 28;

  /* find the first (size, columns) combo where everything fits */
  let chosen: { F: number; cols: number; rows: Row[]; colW: number } | null =
    null;
  outer: for (const F of FONT_SIZES) {
    for (const cols of [1, 2, 3]) {
      const colW = (CW - COL_GAP * (cols - 1)) / cols;
      const rows = layoutSongRows(sctx, song, semi, F, colW);
      if (packRows(rows, ch, cols)) {
        chosen = { F, cols, rows, colW };
        break outer;
      }
    }
  }
  /* extreme fallback: smallest type, 3 columns, may clip the tail */
  if (!chosen) {
    const F = FONT_SIZES[FONT_SIZES.length - 1];
    const cols = 3;
    const colW = (CW - COL_GAP * (cols - 1)) / cols;
    chosen = { F, cols, rows: layoutSongRows(sctx, song, semi, F, colW), colW };
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  drawFrame(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(44, 44, W - 88, H - 88);
  ctx.clip();
  paintSongHeader(ctx, song, semi);
  drawWatermark(ctx, emblem, bodyTop + ch / 2);

  /* paint the columns right→left */
  const { rows, colW, cols } = chosen;
  let used = 0;
  let col = 0;
  for (const r of rows) {
    if (used + r.h > ch) {
      col += 1;
      used = 0;
      if (col >= cols) break; // overflow guard (should not happen)
    }
    r.paint(ctx, colLeft(col, colW, cols) + colW, colW, bodyTop + used);
    used += r.h;
  }
  ctx.restore();
  footer(ctx, footTop);
  await savePng(canvas, `guitarking-${song.slug}-chords.png`);
}

/* ── bot analysis sheet (uploaded songs, no lyrics) ─────────────────── */

interface BotSeg {
  chord: string;
  dim: boolean;
}

function layoutBotRows(
  ctx: Ctx,
  sections: { segments: ChordSegment[] }[],
  perRow: number,
  colW: number
): Row[] {
  const flat: BotSeg[] = [];
  for (const sec of sections)
    for (const sg of sec.segments)
      flat.push({ chord: sg.chord === "N" ? "—" : sg.chord, dim: sg.chord === "N" });

  const gap = 12;
  const chipW = (colW - gap * (perRow - 1)) / perRow;
  const chipH = 46;
  const rowGap = 14;
  const rows: Row[] = [];
  for (let i = 0; i < flat.length; i += perRow) {
    const segs = flat.slice(i, i + perRow);
    rows.push({
      h: chipH + rowGap,
      paint: (c2, colRight, _cw, y) => {
        segs.forEach((sg, j) => {
          const x = colRight - chipW - j * (chipW + gap); // RTL flow
          rr(c2, x, y - chipH + 12, chipW, chipH, 10);
          c2.fillStyle = sg.dim ? "#f5f1e8" : "#ffffff";
          c2.fill();
          c2.strokeStyle = sg.dim ? LINE : WOOD;
          c2.lineWidth = 1.2;
          c2.stroke();
          latin(c2);
          c2.textAlign = "center";
          c2.font = `700 21px ${F_BODY}`;
          c2.fillStyle = sg.dim ? MUTED : RED;
          c2.fillText(sg.chord, x + chipW / 2, y - chipH / 2 + 17);
        });
      },
    });
  }
  return rows;
}

function paintBotHeader(
  ctx: Ctx,
  fileName: string,
  r: AnalysisResult
): number {
  let y = brandRow(ctx, 96) + 26;
  ornamentRule(ctx, y);
  y += 72;

  // title (file name, LTR, shrink to fit)
  latin(ctx);
  ctx.textAlign = "center";
  ctx.font = `700 40px ${F_BODY}`;
  ctx.fillStyle = INK;
  let title = fileName.replace(/\.[^.]+$/, "") || "Untitled";
  while (ctx.measureText(title).width > CW && title.length > 4)
    title = title.slice(0, -2);
  ctx.fillText(title, W / 2, y);
  y += 50;

  fa(ctx);
  ctx.font = `500 24px ${F_BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("برگه‌ی اکوردِ شنیده‌شده توسط ربات گیتارکینگ", W / 2, y);
  y += 48;

  metaLine(
    ctx,
    [
      `کلید ${keyLabelLatin(r.key)}`,
      `تمپو ${Math.round(r.tempo)}`,
      `مدت ${fmtTime(r.duration)}`,
      `اطمینان ${Math.round(r.confidence * 100)}٪`,
    ],
    y
  );
  y += 30;
  ornamentRule(ctx, y);
  y += 64;
  return y;
}

export async function downloadAnalysisSheetImage(
  fileName: string,
  r: AnalysisResult
): Promise<void> {
  await ensureFonts();
  const emblem = await loadEmblem();

  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("canvas unavailable");

  const bodyTop = paintBotHeader(sctx, fileName, r);
  const footTop = H - 132;
  const ch = footTop - bodyTop - 28;

  let chosen: { cols: number; rows: Row[]; colW: number } | null = null;
  for (const cols of [1, 2, 3]) {
    const perRow = cols === 1 ? 6 : cols === 2 ? 4 : 3;
    const colW = (CW - COL_GAP * (cols - 1)) / cols;
    const rows = layoutBotRows(sctx, r.sections, perRow, colW);
    if (packRows(rows, ch, cols)) {
      chosen = { cols, rows, colW };
      break;
    }
  }
  if (!chosen) {
    const cols = 3;
    const colW = (CW - COL_GAP * (cols - 1)) / cols;
    chosen = { cols, rows: layoutBotRows(sctx, r.sections, 3, colW), colW };
  }

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  drawFrame(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(44, 44, W - 88, H - 88);
  ctx.clip();
  paintBotHeader(ctx, fileName, r);
  drawWatermark(ctx, emblem, bodyTop + ch / 2);

  const { rows, colW, cols } = chosen;
  let used = 0;
  let col = 0;
  for (const row of rows) {
    if (used + row.h > ch) {
      col += 1;
      used = 0;
      if (col >= cols) break;
    }
    row.paint(ctx, colLeft(col, colW, cols) + colW, colW, bodyTop + used);
    used += row.h;
  }
  ctx.restore();
  footer(ctx, footTop);
  const safe =
    fileName.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").slice(0, 40) ||
    "chords";
  await savePng(canvas, `guitarking-${safe}.png`);
}
