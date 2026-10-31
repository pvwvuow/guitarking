/* Renders Guitar King chord sheets as shareable PNG images on a canvas.
   Paper look: warm white, ink+wood double frame, watermark emblem,
   chords above lyrics — the classic chord-sheet poster. */

import type { AnalysisResult } from "./types";
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
const CHIP_BG = "#ffffff";

const W = 1080;
const M = 78; // page margin
const CW = W - M * 2; // content width

const F_BODY = 'Vazirmatn, "Segoe UI", Tahoma, sans-serif';
const F_TITLE = '"Aref Ruqaa", Vazirmatn, serif';
const F_BRAND = '"Cinzel Decorative", Vazirmatn, serif';

export const SHEET_CREDIT = "Chords By Pouria Askarshahi";
const SITE = "guitarking.vcp.ir";

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
    '500 30px Vazirmatn',
    '700 26px Vazirmatn',
    '800 30px Vazirmatn',
    '700 60px "Aref Ruqaa"',
    '700 26px "Cinzel Decorative"',
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

/* ── shared decorations ─────────────────────────────────────────────── */

function drawFrame(ctx: Ctx, h: number) {
  ctx.save();
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, h);
  // outer ink frame
  ctx.strokeStyle = INK;
  ctx.lineWidth = 2;
  ctx.strokeRect(22, 22, W - 44, h - 44);
  // inner wood frame
  ctx.strokeStyle = WOOD;
  ctx.lineWidth = 1.4;
  ctx.globalAlpha = 0.75;
  ctx.strokeRect(34, 34, W - 68, h - 68);
  ctx.globalAlpha = 1;
  // corner diamonds (inner frame corners)
  const c = 34;
  const s = 5;
  diamond(ctx, c, c, s, WOOD);
  diamond(ctx, W - c, c, s, WOOD);
  diamond(ctx, c, h - c, s, WOOD);
  diamond(ctx, W - c, h - c, s, WOOD);
  ctx.restore();
}

function brandRow(ctx: Ctx, y: number): number {
  // centered: ✦ GUITAR KING ✦  ·  site
  latin(ctx);
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";
  ctx.save();
  try {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = "4px";
  } catch {
    /* older browsers */
  }
  ctx.font = `700 24px ${F_BRAND}`;
  ctx.fillStyle = INK;
  ctx.fillText("GUITAR KING", W / 2, y);
  ctx.restore();
  const brandW = Math.max(
    ctx.measureText("GUITAR KING").width,
    190
  );
  // diamonds flanking the brand
  diamond(ctx, W / 2 - brandW / 2 - 22, y - 9, 4.5, RED);
  diamond(ctx, W / 2 + brandW / 2 + 22, y - 9, 4.5, RED);
  fa(ctx);
  ctx.font = `500 17px ${F_BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(SITE, W / 2, y + 30);
  return y + 30;
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
  const h = 640;
  const w = (img.width / img.height) * h;
  ctx.save();
  ctx.globalAlpha = 0.075;
  ctx.drawImage(img, W / 2 - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function footer(ctx: Ctx, y: number, note: string): number {
  ornamentRule(ctx, y);
  latin(ctx);
  ctx.textAlign = "center";
  ctx.save();
  try {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = "1.5px";
  } catch {
    /* noop */
  }
  ctx.font = `700 21px ${F_BRAND}`;
  ctx.fillStyle = INK_SOFT;
  ctx.fillText(SHEET_CREDIT, W / 2, y + 44);
  ctx.restore();
  fa(ctx);
  ctx.font = `400 16px ${F_BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(note, W / 2, y + 76);
  return y + 76;
}

interface Chip {
  label: string;
  value?: string;
}

function chipRow(ctx: Ctx, chips: Chip[], y: number): number {
  fa(ctx);
  ctx.font = `500 21px ${F_BODY}`;
  ctx.textBaseline = "alphabetic";
  const h = 44;
  const gap = 14;
  const pad = 20;
  const widths = chips.map((c) => {
    const t = c.value ? `${c.label}: ${c.value}` : c.label;
    return ctx.measureText(t).width + pad * 2;
  });
  const total = widths.reduce((a, b) => a + b, 0) + gap * (chips.length - 1);
  let x = (W - total) / 2;
  chips.forEach((c, i) => {
    const w = widths[i];
    rr(ctx, x, y - h + 10, w, h, h / 2);
    ctx.fillStyle = CHIP_BG;
    ctx.fill();
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    ctx.fillStyle = INK_SOFT;
    const t = c.value ? `${c.label}: ${c.value}` : c.label;
    ctx.textAlign = "center";
    ctx.fillText(t, x + w / 2, y - h / 2 + 11);
    x += w + gap;
  });
  return y;
}

/* ── song sheet (archive entries, with lyrics) ──────────────────────── */

interface LaidSeg {
  chord: string;
  text: string;
  cx: number;
}
interface LaidRow {
  segs: LaidSeg[];
}
interface LaidSection {
  label: string;
  rows: LaidRow[];
}

const SEG_GAP = 40;
const COL_PAD = 12;
const ROW_H = 88; // chord line + text line
const ROW_GAP = 24;

function layoutSongSections(ctx: Ctx, song: SongEntry, semi: number): LaidSection[] {
  fa(ctx);
  ctx.font = `400 27px ${F_BODY}`;
  latin(ctx);
  const chordFont = `800 29px ${F_BODY}`;
  return song.sections.map((sec) => {
    const rows: LaidRow[] = [];
    let cur: LaidSeg[] = [];
    let curW = 0;
    const flush = () => {
      if (cur.length) rows.push({ segs: cur });
      cur = [];
      curW = 0;
    };
    for (const line of sec.lines) {
      for (const seg of line) {
        ctx.font = `400 27px ${F_BODY}`;
        const tw = ctx.measureText(seg.text).width;
        ctx.font = chordFont;
        const chw = ctx.measureText(transposeChord(seg.chord, semi)).width;
        const colW = Math.max(tw, chw) + COL_PAD * 2;
        if (curW + colW > CW && cur.length) flush();
        // column centre measured from the right edge (RTL flow)
        const cx = W - M - curW - colW / 2;
        cur.push({ chord: seg.chord, text: seg.text, cx });
        curW += colW + SEG_GAP;
      }
      flush(); // each source line starts a new row
    }
    flush();
    return { label: sec.label, rows };
  });
}

function measureSongHeight(sections: LaidSection[]): number {
  const labelH = 52;
  const labelGap = 26;
  const secGap = 40;
  let h = 0;
  sections.forEach((s, i) => {
    h += labelH + labelGap + s.rows.length * ROW_H + (s.rows.length - 1) * ROW_GAP;
    if (i < sections.length - 1) h += secGap;
  });
  return h;
}

function paintSongSheet(
  ctx: Ctx,
  song: SongEntry,
  semi: number,
  emblem: HTMLImageElement | null
): number {
  const t = (c: string) => transposeChord(c, semi);
  let y = 0;

  // ── brand ──
  y = brandRow(ctx, 108) + 26;
  ornamentRule(ctx, y);
  y += 66;

  // ── title / artist ──
  fa(ctx);
  ctx.textAlign = "center";
  ctx.font = `700 58px ${F_TITLE}`;
  ctx.fillStyle = INK;
  let title = song.title;
  while (ctx.measureText(title).width > CW && title.length > 4)
    title = title.slice(0, -2);
  ctx.fillText(title, W / 2, y);
  y += 52;
  ctx.font = `500 29px ${F_BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(song.artist, W / 2, y);
  y += 56;

  // ── meta chips ──
  const chips: Chip[] = [
    { label: song.genre },
    { label: "گام", value: t(song.key) },
  ];
  if (song.tempo) chips.push({ label: "تمپو", value: String(song.tempo) });
  chips.push({ label: "سطح", value: song.difficulty });
  if (semi !== 0)
    chips.push({
      label: "تغییر",
      value: `${semi > 0 ? "+" : ""}${semi}`,
    });
  chipRow(ctx, chips, y);
  y += 34;
  ornamentRule(ctx, y);
  y += 58;

  // ── body ──
  const sections = layoutSongSections(ctx, song, semi);
  const bodyH = measureSongHeight(sections);
  drawWatermark(ctx, emblem, y + bodyH / 2);

  const bodyTop = y;
  sections.forEach((sec, si) => {
    // section label row: diamond at right margin, label, rule to the left
    fa(ctx);
    ctx.textAlign = "right";
    ctx.font = `700 27px ${F_BODY}`;
    ctx.fillStyle = INK;
    const lw = ctx.measureText(sec.label).width;
    ctx.fillText(sec.label, W - M - 34, y);
    diamond(ctx, W - M, y - 9, 5.5, RED);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(M, y - 3);
    ctx.lineTo(W - M - 34 - lw - 20, y - 3);
    ctx.stroke();
    y += 52 + 26;

    sec.rows.forEach((row, ri) => {
      row.segs.forEach((seg) => {
        // chord
        latin(ctx);
        ctx.textAlign = "center";
        ctx.font = `800 29px ${F_BODY}`;
        ctx.fillStyle = RED;
        ctx.fillText(t(seg.chord), seg.cx, y);
        // lyric text
        fa(ctx);
        ctx.font = `400 27px ${F_BODY}`;
        ctx.fillStyle = INK_SOFT;
        ctx.fillText(seg.text, seg.cx, y + 44);
      });
      y += ROW_H + (ri < sec.rows.length - 1 ? ROW_GAP : 0);
    });
    if (si < sections.length - 1) y += 40;
  });
  void bodyTop;

  y += 44;
  const note =
    song.source === "bot"
      ? "اکوردها بر پایه‌ی شنیده‌ی ربات گیتارکینگ نوشته شده است"
      : "اکوردها توسط تحریریه‌ی گیتارکینگ نوشته شده است";
  y = footer(ctx, y, note) + 58;
  return y;
}

export async function downloadSongSheetImage(
  song: SongEntry,
  semi: number
): Promise<void> {
  await ensureFonts();
  const emblem = await loadEmblem();

  // measure pass (scratch canvas)
  const scratch = document.createElement("canvas");
  const sctx = scratch.getContext("2d");
  if (!sctx) throw new Error("canvas unavailable");
  const contentH = paintSongSheet(sctx, song, semi, emblem);

  const H = Math.ceil(contentH);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  drawFrame(ctx, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(40, 40, W - 80, H - 80);
  ctx.clip();
  paintSongSheet(ctx, song, semi, emblem);
  ctx.restore();

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png")
  );
  if (!blob) throw new Error("export failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `guitarking-${song.slug}-chords.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ── bot analysis sheet (uploaded songs, no lyrics) ─────────────────── */

const BOT_ROW_H = 52;

function paintAnalysisSheet(
  ctx: Ctx,
  fileName: string,
  r: AnalysisResult,
  emblem: HTMLImageElement | null
): number {
  let y = 0;
  y = brandRow(ctx, 108) + 26;
  ornamentRule(ctx, y);
  y += 62;

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
  y += 52;

  const chips: Chip[] = [
    { label: "کلید", value: keyLabelLatin(r.key) },
    { label: "تمپو", value: String(Math.round(r.tempo)) },
    { label: "مدت", value: fmtTime(r.duration) },
    { label: "اطمینان", value: `${Math.round(r.confidence * 100)}٪` },
  ];
  chipRow(ctx, chips, y);
  y += 34;
  ornamentRule(ctx, y);
  y += 56;

  // watermark behind the body
  const rowsEstimate =
    r.sections.reduce((acc, s) => {
      const chipRows = Math.max(1, Math.ceil(s.segments.length / 6));
      return acc + 40 + 26 + chipRows * BOT_ROW_H + 36;
    }, 0);
  drawWatermark(ctx, emblem, y + rowsEstimate / 2);

  r.sections.forEach((sec, si) => {
    fa(ctx);
    ctx.textAlign = "right";
    ctx.font = `700 26px ${F_BODY}`;
    ctx.fillStyle = INK;
    const label = `بخش ${sec.label}`;
    const lw = ctx.measureText(label).width;
    ctx.fillText(label, W - M - 34, y);
    diamond(ctx, W - M, y - 9, 5.5, RED);
    latin(ctx);
    ctx.font = `500 19px ${F_BODY}`;
    ctx.fillStyle = MUTED;
    ctx.textAlign = "left";
    ctx.fillText(`${fmtTime(sec.start)} – ${fmtTime(sec.end)}`, M, y);
    ctx.strokeStyle = LINE;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(M + 120, y - 3);
    ctx.lineTo(W - M - 34 - lw - 20, y - 3);
    ctx.stroke();
    y += 40 + 26;

    // chord chips, wrapped 6 per row
    const perRow = 6;
    const gap = 12;
    const chipW = (CW - gap * (perRow - 1)) / perRow;
    for (let i = 0; i < sec.segments.length; i += perRow) {
      const row = sec.segments.slice(i, i + perRow);
      row.forEach((sg, j) => {
        const x = W - M - chipW - j * (chipW + gap); // RTL flow
        rr(ctx, x, y - 34, chipW, 44, 10);
        ctx.fillStyle = sg.chord === "N" ? "#f5f1e8" : CHIP_BG;
        ctx.fill();
        ctx.strokeStyle = sg.chord === "N" ? LINE : WOOD;
        ctx.lineWidth = 1.2;
        ctx.stroke();
        latin(ctx);
        ctx.textAlign = "center";
        ctx.font = `700 22px ${F_BODY}`;
        ctx.fillStyle = sg.chord === "N" ? MUTED : RED;
        ctx.fillText(sg.chord === "N" ? "—" : sg.chord, x + chipW / 2, y - 5);
      });
      y += BOT_ROW_H;
    }
    if (si < r.sections.length - 1) y += 36;
  });

  y += 40;
  y = footer(ctx, y, "خروجی ربات اکوردنویس گیتارکینگ") + 58;
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
  const contentH = paintAnalysisSheet(sctx, fileName, r, emblem);

  const H = Math.ceil(contentH);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas unavailable");
  drawFrame(ctx, H);
  ctx.save();
  ctx.beginPath();
  ctx.rect(40, 40, W - 80, H - 80);
  ctx.clip();
  paintAnalysisSheet(ctx, fileName, r, emblem);
  ctx.restore();

  const blob = await new Promise<Blob | null>((res) =>
    canvas.toBlob(res, "image/png")
  );
  if (!blob) throw new Error("export failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safe = fileName.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").slice(0, 40) || "chords";
  a.download = `guitarking-${safe}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
