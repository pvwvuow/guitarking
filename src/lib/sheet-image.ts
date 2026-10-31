/* Renders Guitar King chord sheets as shareable PNG images on a canvas.
   Paper look: warm white, ink+wood double frame, watermark emblem,
   chords above lyrics — the classic chord-sheet poster.
   Long songs are split into several A4-ratio pages automatically. */

import type { AnalysisResult, ChordSegment, SongSection } from "./types";
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
const F_TITLE = 'Gulzar, Vazirmatn, serif';
const F_BRAND = '"Cinzel Decorative", Vazirmatn, serif';

const SITE = "guitarking.ir";
export const SHEET_CREDIT = SITE;

/* pagination: every page is a fixed A4-ish sheet; if the song fits,
   a single free-flowing page is produced exactly like before. */
const PAGE_H = 1560;
const BODY_BOTTOM = PAGE_H - 172; // body must end above the pinned footer
const CONT_BODY_TOP = 156; // body top on continuation pages

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
    '400 56px Gulzar',
    '400 26px Gulzar',
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
  // centered: ✦ GUITAR KING ✦
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
  const brandW = Math.max(ctx.measureText("GUITAR KING").width, 190);
  diamond(ctx, W / 2 - brandW / 2 - 22, y - 9, 4.5, RED);
  diamond(ctx, W / 2 + brandW / 2 + 22, y - 9, 4.5, RED);
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
  ctx.font = `700 22px ${F_BRAND}`;
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

/* ── download helpers ───────────────────────────────────────────────── */

async function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

async function saveAll(pages: { canvas: HTMLCanvasElement; name: string }[]) {
  for (let i = 0; i < pages.length; i++) {
    const blob = await new Promise<Blob | null>((res) =>
      pages[i].canvas.toBlob(res, "image/png")
    );
    if (!blob) throw new Error("export failed");
    await saveBlob(blob, pages[i].name);
    if (i < pages.length - 1)
      await new Promise((r) => setTimeout(r, 450)); // browsers block rapid downloads
  }
}

/* ── page furniture for paginated exports ───────────────────────────── */

function paintContHeader(ctx: Ctx, titleText: string): number {
  latin(ctx);
  ctx.textAlign = "center";
  ctx.save();
  try {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = "3px";
  } catch {
    /* noop */
  }
  ctx.font = `700 15px ${F_BRAND}`;
  ctx.fillStyle = MUTED;
  ctx.fillText("GUITAR KING", W / 2, 66);
  ctx.restore();
  diamond(ctx, W / 2 - 91, 60, 3.5, RED);
  diamond(ctx, W / 2 + 91, 60, 3.5, RED);
  fa(ctx);
  ctx.font = `400 26px ${F_TITLE}`;
  ctx.fillStyle = INK;
  let t = titleText;
  while (ctx.measureText(t).width > CW && t.length > 4) t = t.slice(0, -2);
  ctx.fillText(t, W / 2, 110);
  ornamentRule(ctx, 134);
  return CONT_BODY_TOP;
}

function pinnedNote(note: string, idx: number, n: number): string {
  return n > 1 ? `${note} · برگه ${idx + 1} از ${n}` : note;
}

/* ── flow items (shared pagination logic) ───────────────────────────── */

interface FlowItem {
  tag: "label" | "row";
  h: number;
}

/** split flow items into pages; a section label always travels
    together with its first row */
export function chunkFlow<T extends FlowItem>(
  items: T[],
  firstCap: number,
  restCap: number
): T[][] {
  const pages: T[][] = [];
  let cur: T[] = [];
  let used = 0;
  let cap = firstCap;
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const next = items[i + 1];
    const need =
      it.h + (it.tag === "label" && next && next.tag !== "label" ? next.h : 0);
    if (used + need > cap && cur.length) {
      pages.push(cur);
      cur = [];
      used = 0;
      cap = restCap;
    }
    cur.push(it);
    used += it.h;
  }
  if (cur.length) pages.push(cur);
  return pages;
}

/* ── song sheet (archive entries, with lyrics) ──────────────────────── */

interface LaidSeg {
  chord: string;
  text: string;
  cx: number;
}
interface LaidRow {
  segs: LaidSeg[];
  h: number;
  tag: "row";
}
interface LaidLabel {
  label: string;
  h: number;
  tag: "label";
}
type SongItem = LaidLabel | LaidRow;

const SEG_GAP = 40;
const COL_PAD = 12;
const ROW_H = 88; // chord line + text line
const ROW_GAP = 24;
const LABEL_H = 86;

function layoutSongSections(
  ctx: Ctx,
  song: SongEntry,
  semi: number
): SongItem[] {
  fa(ctx);
  ctx.font = `400 27px ${F_BODY}`;
  latin(ctx);
  const chordFont = `800 29px ${F_BODY}`;
  const items: SongItem[] = [];
  for (const sec of song.sections) {
    items.push({ tag: "label", label: sec.label, h: LABEL_H });
    let cur: LaidSeg[] = [];
    let curW = 0;
    const flush = () => {
      if (cur.length) items.push({ tag: "row", segs: cur, h: ROW_H + ROW_GAP });
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
  }
  return items;
}

function paintSongHeader(ctx: Ctx, song: SongEntry, semi: number): number {
  let y = brandRow(ctx, 92) + 20;
  ornamentRule(ctx, y);
  y += 66;

  // ── title / artist (Gulzar Nastaliq descends deep — extra room) ──
  fa(ctx);
  ctx.textAlign = "center";
  ctx.font = `400 56px ${F_TITLE}`;
  ctx.fillStyle = INK;
  let title = song.title;
  while (ctx.measureText(title).width > CW && title.length > 4)
    title = title.slice(0, -2);
  ctx.fillText(title, W / 2, y);
  y += 78;
  ctx.font = `500 29px ${F_BODY}`;
  ctx.fillStyle = MUTED;
  ctx.fillText(song.artist, W / 2, y);
  y += 54;

  // ── meta chips ──
  const chips: Chip[] = [
    { label: song.genre },
    { label: "گام", value: transposeChord(song.key, semi) },
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
  y += 56;
  return y;
}

function paintSongItems(
  ctx: Ctx,
  items: SongItem[],
  y0: number,
  semi: number
): void {
  const t = (c: string) => transposeChord(c, semi);
  let y = y0;
  for (const it of items) {
    if (it.tag === "label") {
      fa(ctx);
      ctx.textAlign = "right";
      ctx.font = `700 27px ${F_BODY}`;
      ctx.fillStyle = INK;
      const lw = ctx.measureText(it.label).width;
      ctx.fillText(it.label, W - M - 34, y);
      diamond(ctx, W - M, y - 9, 5.5, RED);
      ctx.strokeStyle = LINE;
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(M, y - 3);
      ctx.lineTo(W - M - 34 - lw - 20, y - 3);
      ctx.stroke();
      y += it.h;
    } else {
      it.segs.forEach((seg) => {
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
      y += it.h;
    }
  }
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
  const bodyTop = paintSongHeader(sctx, song, semi);
  const items = layoutSongSections(sctx, song, semi);
  const itemsH = items.reduce((a, b) => a + b.h, 0);

  const note =
    song.source === "bot"
      ? "اکوردها بر پایه‌ی شنیده‌ی ربات گیتارکینگ نوشته شده است"
      : "اکوردها توسط تحریریه‌ی گیتارکینگ نوشته شده است";

  /* single page keeps the free-flowing layout (page height = content) */
  const singleH = bodyTop + itemsH + 154;
  const multi = singleH > PAGE_H;
  const pages: { canvas: HTMLCanvasElement; name: string }[] = [];
  const base = `guitarking-${song.slug}-chords`;

  if (!multi) {
    const H = Math.ceil(singleH);
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
    paintSongHeader(ctx, song, semi);
    drawWatermark(ctx, emblem, bodyTop + itemsH / 2);
    paintSongItems(ctx, items, bodyTop, semi);
    footer(ctx, bodyTop + itemsH + 20, note);
    ctx.restore();
    pages.push({ canvas, name: `${base}.png` });
  } else {
    /* paginate: fixed A4-ish sheets, header + footer on every page */
    const chunks = chunkFlow(
      items,
      BODY_BOTTOM - bodyTop,
      BODY_BOTTOM - CONT_BODY_TOP
    );
    const n = chunks.length;
    for (let i = 0; i < n; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = PAGE_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      drawFrame(ctx, PAGE_H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(40, 40, W - 80, PAGE_H - 80);
      ctx.clip();
      const top =
        i === 0 ? paintSongHeader(ctx, song, semi) : paintContHeader(ctx, song.title);
      drawWatermark(ctx, emblem, (top + BODY_BOTTOM) / 2);
      paintSongItems(ctx, chunks[i], top, semi);
      footer(ctx, PAGE_H - 150, pinnedNote(note, i, n));
      ctx.restore();
      pages.push({ canvas, name: `${base}-p${i + 1}.png` });
    }
  }

  await saveAll(pages);
}

/* ── bot analysis sheet (uploaded songs, no lyrics) ─────────────────── */

const BOT_ROW_H = 52;

interface AnItem extends FlowItem {
  kind: "sec" | "chips";
  sec?: SongSection;
  segs?: ChordSegment[];
  pad: number; // extra lead-in when not first on page
}

function buildAnalysisFlow(r: AnalysisResult): AnItem[] {
  const items: AnItem[] = [];
  r.sections.forEach((sec, i) => {
    items.push({
      kind: "sec",
      tag: "label",
      sec,
      h: 66,
      pad: i === 0 ? 0 : 30,
    });
    for (let j = 0; j < sec.segments.length; j += 6) {
      items.push({
        kind: "chips",
        tag: "row",
        segs: sec.segments.slice(j, j + 6),
        h: BOT_ROW_H,
        pad: 0,
      });
    }
  });
  return items;
}

function paintAnalysisHeader(
  ctx: Ctx,
  fileName: string,
  r: AnalysisResult
): number {
  let y = brandRow(ctx, 92) + 20;
  ornamentRule(ctx, y);
  y += 58;

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
  return y;
}

function paintAnalysisItems(
  ctx: Ctx,
  items: AnItem[],
  y0: number
): void {
  let y = y0;
  let first = true;
  for (const it of items) {
    if (!first && it.pad) y += it.pad;
    if (it.kind === "sec" && it.sec) {
      const sec = it.sec;
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
    } else if (it.kind === "chips" && it.segs) {
      // chord chips, wrapped 6 per row
      const gap = 12;
      const chipW = (CW - gap * 5) / 6;
      it.segs.forEach((sg, j) => {
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
    }
    y += it.h;
  }
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
  const bodyTop = paintAnalysisHeader(sctx, fileName, r);
  const items = buildAnalysisFlow(r);
  const itemsH = items.reduce((a, b) => a + b.pad + b.h, 0);

  const note = "خروجی ربات اکوردنویس گیتارکینگ";
  const singleH = bodyTop + itemsH + 154;
  const multi = singleH > PAGE_H;
  const pages: { canvas: HTMLCanvasElement; name: string }[] = [];
  const safe =
    fileName.replace(/[^\w-]+/g, "-").replace(/-+/g, "-").slice(0, 40) ||
    "chords";
  const base = `guitarking-${safe}`;

  if (!multi) {
    const H = Math.ceil(singleH);
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
    paintAnalysisHeader(ctx, fileName, r);
    drawWatermark(ctx, emblem, bodyTop + itemsH / 2);
    paintAnalysisItems(ctx, items, bodyTop);
    footer(ctx, bodyTop + itemsH + 20, note);
    ctx.restore();
    pages.push({ canvas, name: `${base}.png` });
  } else {
    const chunks = chunkFlow(
      items,
      BODY_BOTTOM - bodyTop,
      BODY_BOTTOM - CONT_BODY_TOP
    );
    const n = chunks.length;
    for (let i = 0; i < n; i++) {
      const canvas = document.createElement("canvas");
      canvas.width = W;
      canvas.height = PAGE_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("canvas unavailable");
      drawFrame(ctx, PAGE_H);
      ctx.save();
      ctx.beginPath();
      ctx.rect(40, 40, W - 80, PAGE_H - 80);
      ctx.clip();
      const top =
        i === 0
          ? paintAnalysisHeader(ctx, fileName, r)
          : paintContHeader(ctx, fileName.replace(/\.[^.]+$/, "") || "Untitled");
      drawWatermark(ctx, emblem, (top + BODY_BOTTOM) / 2);
      paintAnalysisItems(ctx, chunks[i], top);
      footer(ctx, PAGE_H - 150, pinnedNote(note, i, n));
      ctx.restore();
      pages.push({ canvas, name: `${base}-p${i + 1}.png` });
    }
  }

  await saveAll(pages);
}
