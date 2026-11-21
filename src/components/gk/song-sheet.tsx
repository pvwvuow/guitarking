"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  BookOpen,
  ExternalLink,
  ImageDown,
  Loader2,
  LocateFixed,
  Minus,
  Plus,
  Repeat,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { SheetSeg, SongEntry } from "@/lib/songs";
import { songChords } from "@/lib/songs";
import { transposeChord } from "@/lib/transpose";
import { downloadSongSheetImage } from "@/lib/sheet-image";
import { useAudioClock, VISUAL_LEAD } from "@/lib/use-audio-clock";
import {
  beatPositions,
  beatState,
  beatsBetween,
  lastAtOrBefore,
  wordTimes,
} from "@/lib/sheet-sync";
import { beytRows } from "@/lib/sheet-rows";
import {
  faNum,
  foldSections,
  hidesChord,
  isSilent,
  mapChord,
  mapWord,
  runChords,
  runPreview,
  segWords,
  wordOffsets,
  type SectionView,
} from "@/lib/sheet-fold";
import { ChordDiagram } from "./chord-diagram";
import { PlayerCard } from "./player-card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  song: SongEntry;
  onBack: () => void;
  onPlayDemo?: () => void;
}

const SEG_NOTE =
  "متن‌های داخل برگه برای نمایش چیدمان اکورد نمونه‌سازی شده‌اند و به‌زودی با متن رسمی ترانه جایگزین می‌شوند.";

const SUNG = "text-[oklch(0.545_0.212_26)]";
const OFFSET_KEY = "gk-sync-offset";
const FOLLOW_PAUSE_MS = 4000;

interface TimedSeg {
  li: number;
  si: number;
  /** lyric start */
  t: number;
  /** chord start (beat-exact when the sheet was synced) */
  ct: number;
  chord: string;
  text: string;
  w?: number[];
  /** no new chord here: the same chord as the piece before it in the
      line, or the previous line's chord (carry) */
  cont: boolean;
}

/** flat timed entries of a sheet: one per segment that carries a time.
    li must be the index in the FLATTENED line list (same as render). */
function buildTimed(song: SongEntry): TimedSeg[] {
  const out: TimedSeg[] = [];
  let li = 0;
  song.sections.forEach((sec) => {
    sec.lines.forEach((line) => {
      line.forEach((seg, si) => {
        if (typeof seg.t === "number")
          out.push({
            li,
            si,
            t: seg.t,
            ct: typeof seg.ct === "number" ? seg.ct : seg.t,
            chord: seg.chord,
            text: seg.text,
            w: seg.w,
            cont: hidesChord(line, si),
          });
      });
      li++;
    });
  });
  return out.sort((a, b) => a.t - b.t);
}

type RepeatView = Extract<SectionView, { kind: "repeat" }>;

type SheetItem =
  | {
      type: "row";
      key: string;
      newSection: boolean;
      vi: number;
      lines: { li: number; line: SheetSeg[] }[];
      /** last row of a block that is played several times in a row */
      times?: number;
    }
  | {
      type: "card";
      key: string;
      newSection: boolean;
      vi: number;
      view: RepeatView;
      label: string;
      lines: SheetSeg[][];
      seekT: number | null;
    };

/** «تکرار بند دوم» -> «بند دوم» (the card already says "repeat") */
function cardLabel(label: string) {
  return label.replace(/^تکرار\s+/, "").trim() || label;
}

export function SongSheet({ song, onBack, onPlayDemo }: Props) {
  const [semi, setSemi] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(false);
  const [folded, setFolded] = useState(true);
  const [follow, setFollow] = useState(true);
  const [syncOffset, setSyncOffset] = useState(0);
  const t = useMemo(() => (c: string) => transposeChord(c, semi), [semi]);
  const currentKey = t(song.key);
  const diagrams = useMemo(() => songChords(song).map(t), [song, t]);

  // ---- play-along (karaoke) state: frame-accurate clock ----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { time: clock, playing, duration, seekTo } = useAudioClock(
    audioRef,
    song.audio
  );
  // the user's own latency fix (wireless headphones) on top of the lead
  const time = clock + VISUAL_LEAD + syncOffset;
  const timed = useMemo(() => buildTimed(song), [song]);
  const hasSync = !!song.audio && timed.length > 1;

  useEffect(() => {
    try {
      const v = Number(window.localStorage.getItem(OFFSET_KEY));
      if (Number.isFinite(v) && Math.abs(v) <= 0.5) setSyncOffset(v);
    } catch {
      /* private mode */
    }
  }, []);
  const changeOffset = (v: number) => {
    const c = Math.max(-0.5, Math.min(0.5, Math.round(v * 100) / 100));
    setSyncOffset(c);
    try {
      window.localStorage.setItem(OFFSET_KEY, String(c));
    } catch {
      /* private mode */
    }
  };

  // repeats written once (src/lib/sheet-fold.ts)
  const fold = useMemo(() => foldSections(song.sections, folded), [song, folded]);
  const canFold = useMemo(
    () => foldSections(song.sections, true).views.some((v) => v.kind !== "full"),
    [song]
  );
  const flatLines = useMemo(() => song.sections.flatMap((sec) => sec.lines), [song]);
  const sectionOfLine = useMemo(() => {
    const out: number[] = [];
    song.sections.forEach((sec, s) => sec.lines.forEach(() => out.push(s)));
    return out;
  }, [song]);

  // lyric clock (t) and chord clock (ct) are separate: singers push or
  // delay a syllable, the band changes chord on the beat
  const lyricStarts = useMemo(() => timed.map((e) => e.t), [timed]);
  const byChord = useMemo(
    () => timed.filter((e) => !e.cont).sort((a, b) => a.ct - b.ct),
    [timed]
  );
  const hasAuto = useMemo(
    () => song.sections.some((sec) => sec.lines.some((ln) => ln.some((sg) => sg.auto))),
    [song]
  );
  const chordStarts = useMemo(() => byChord.map((e) => e.ct), [byChord]);

  // beat grid (engine), for the pulse and the "next chord" countdown
  const beats = useMemo(() => song.beats ?? [], [song.beats]);
  const bpb = song.bpb ?? 4;
  const period = useMemo(() => {
    if (beats.length > 2) {
      const d = beats
        .slice(1)
        .map((x, i) => x - beats[i])
        .sort((a, b) => a - b);
      return d[d.length >> 1] || 0.5;
    }
    return song.tempo ? 60 / song.tempo : 0.5;
  }, [beats, song.tempo]);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  };

  const seek = (sec: number) => {
    if (!duration) return;
    seekTo(Math.min(Math.max(sec, 0), duration - 0.2));
  };
  /** jump so that the sheet lights up exactly at lyric time `lt` */
  const seekLyric = (lt: number) => seek(lt + 0.01 - VISUAL_LEAD - syncOffset);

  // which lyric segment is being sung right now?
  const activeIdx = hasSync ? lastAtOrBefore(lyricStarts, time) : -1;
  const active = activeIdx >= 0 ? timed[activeIdx] : null;

  // which chord is sounding right now (and which one comes next)?
  const chordIdx = hasSync ? lastAtOrBefore(chordStarts, time) : -1;
  const chordNow = chordIdx >= 0 ? byChord[chordIdx] : null;
  let chordNext: TimedSeg | null = null;
  for (let i = chordIdx + 1; i < byChord.length; i++) {
    if (byChord[i].chord !== chordNow?.chord) {
      chordNext = byChord[i];
      break;
    }
  }

  // word-by-word progress inside the active lyric segment
  const karaoke = useMemo(() => {
    if (!active || isSilent(active.text)) return null;
    const next = timed[activeIdx + 1];
    const tNext = next ? next.t : duration || active.t + 6;
    return { ...wordTimes(active.text, active.t, tNext, active.w), tNext };
  }, [active, activeIdx, timed, duration]);
  const wordIdx = karaoke ? lastAtOrBefore(karaoke.starts, time) : -1;
  let wordP = 0;
  if (karaoke && wordIdx >= 0) {
    const s0 = karaoke.starts[wordIdx];
    const s1 =
      karaoke.starts[wordIdx + 1] ??
      Math.min(karaoke.tNext, s0 + Math.max(0.45, karaoke.words[wordIdx].length * 0.13));
    wordP = s1 > s0 ? Math.min(1, Math.max(0, (time - s0) / (s1 - s0))) : 1;
  }

  // where that is on the DRAWN sheet (a folded repeat lights its original)
  let liveLi = -1;
  let liveSi = -1;
  let liveG = -1;
  const liveCur = !!karaoke && wordIdx >= 0;
  if (active) {
    liveLi = fold.alias[active.li] ?? active.li;
    const m = mapWord(
      flatLines[active.li],
      active.si,
      liveCur ? wordIdx : 0,
      flatLines[liveLi]
    );
    liveSi = m.si;
    liveG = m.g;
  }
  const drawnChord = (e: TimedSeg | null) => {
    if (!e) return { li: -1, si: -1 };
    const li = fold.alias[e.li] ?? e.li;
    return { li, si: mapChord(flatLines[e.li], e.si, flatLines[li]) };
  };
  const chordAt = drawnChord(chordNow);
  const nextAt = drawnChord(chordNext);
  const toNext = chordNext ? chordNext.ct - time : Infinity;
  const nextP =
    chordNext && toNext > 0 && toNext <= 2 * period ? 1 - toNext / (2 * period) : 0;

  // beat pulse (engine beat grid, when the sheet was synced)
  const beatPos = useMemo(
    () => beatPositions(beats, song.downbeats, bpb),
    [beats, song.downbeats, bpb]
  );
  const beatNow = beats.length > 1 ? beatState(beats, beatPos, time) : null;
  const beatsToNext =
    chordNext && beats.length > 1 ? beatsBetween(beats, time, chordNext.ct) : null;

  // the sheet: beyt rows (src/lib/sheet-rows.ts) + one card per folded repeat
  const sheetItems = useMemo(() => {
    const out: SheetItem[] = [];
    fold.views.forEach((view, vi) => {
      if (view.kind === "again") return;
      const sec = song.sections[view.s];
      const base = fold.base[view.s];
      if (view.kind === "repeat") {
        const firstT = sec.lines
          .flat()
          .map((sg) => sg.t)
          .find((x): x is number => typeof x === "number");
        out.push({
          type: "card",
          key: `c-${vi}`,
          newSection: out.length > 0,
          vi,
          view,
          label: cardLabel(song.sections[view.of].label),
          lines: song.sections[view.of].lines.slice(view.from, view.from + view.count),
          seekT: firstT ?? null,
        });
        return;
      }
      const rows = beytRows(sec.lines);
      rows.forEach((grp, r) => {
        out.push({
          type: "row",
          key: `${view.s}-${r}`,
          newSection: out.length > 0 && r === 0,
          vi,
          lines: grp.map((i) => ({ li: base + i, line: sec.lines[i] })),
          times: r === rows.length - 1 && view.times > 1 ? view.times : undefined,
        });
      });
    });
    return out;
  }, [song, fold]);
  const rowOfLine = useMemo(() => {
    const m = new Map<number, number>();
    sheetItems.forEach((it, ri) => {
      if (it.type === "row") it.lines.forEach((l) => m.set(l.li, ri));
    });
    return m;
  }, [sheetItems]);

  // which pass of a repeated block is playing (×N badges, repeat cards)
  const activeView = active ? fold.viewOfLine[active.li] ?? -1 : -1;
  const liveViewRoot =
    activeView >= 0
      ? (() => {
          const v = fold.views[activeView];
          return v.kind === "again" ? v.view : activeView;
        })()
      : -1;
  const passOf = (vi: number) => {
    if (!active || liveViewRoot !== vi) return 0;
    const secs = [fold.views[vi].s].concat(
      fold.views
        .filter((v): v is Extract<SectionView, { kind: "again" }> => v.kind === "again" && v.view === vi)
        .map((v) => v.s)
    );
    return secs.indexOf(sectionOfLine[active.li]) + 1;
  };

  // keep the active row in view while playing - unless the user is
  // scrolling the page himself (then follow again after a few seconds)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const hold = () => {
      setFollow(false);
      clearTimeout(timer);
      timer = setTimeout(() => setFollow(true), FOLLOW_PAUSE_MS);
    };
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End"].includes(e.key)) hold();
    };
    window.addEventListener("wheel", hold, { passive: true });
    window.addEventListener("touchmove", hold, { passive: true });
    window.addEventListener("keydown", onKey);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("wheel", hold);
      window.removeEventListener("touchmove", hold);
      window.removeEventListener("keydown", onKey);
    };
  }, []);
  const activeRow = liveLi >= 0 ? rowOfLine.get(liveLi) ?? -1 : -1;
  const scrollToRow = (ri: number) =>
    document
      .getElementById(`sheet-row-${ri}`)
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  useEffect(() => {
    if (!playing || !follow || activeRow < 0) return;
    scrollToRow(activeRow);
  }, [activeRow, playing, follow]);

  const handleExport = async () => {
    setExporting(true);
    setExportErr(false);
    try {
      await downloadSongSheetImage(song, semi);
    } catch {
      setExportErr(true);
    } finally {
      setExporting(false);
    }
  };

  /** one lyric word; the word being sung fills from right to left */
  const renderWord = (w: string, gi: number, last: boolean, live: boolean) => {
    const sp = last ? "" : " ";
    if (!live || gi > liveG || (gi === liveG && !liveCur)) {
      return (
        <Fragment key={gi}>
          <span className="text-foreground/90 transition-colors duration-100">{w}</span>
          {sp}
        </Fragment>
      );
    }
    if (gi < liveG) {
      return (
        <Fragment key={gi}>
          <span className={SUNG}>{w}</span>
          {sp}
        </Fragment>
      );
    }
    return (
      <Fragment key={gi}>
        <span className="relative inline-block">
          <span className="text-foreground/90">{w}</span>
          <span
            aria-hidden
            className={`absolute inset-0 ${SUNG} underline decoration-2 underline-offset-[6px]`}
            style={{ clipPath: `inset(0 0 0 ${Math.round((1 - wordP) * 100)}%)` }}
          >
            {w}
          </span>
        </span>
        {sp}
      </Fragment>
    );
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-16">
      {/* back */}
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به آرشیو اکوردها
      </button>

      {/* header */}
      <div className="mt-5 grid sm:grid-cols-[220px_1fr] gap-6 sm:gap-8 items-start">
        <div className="rounded-2xl overflow-hidden ring-1 ring-foreground/10 shadow-xl shadow-foreground/15 mx-auto w-52 sm:w-full">
          <img
            src={song.poster}
            alt={`پوستر ${song.title}`}
            className="w-full aspect-square object-cover"
          />
        </div>
        <div>
          <p className="font-display text-[11px] tracking-[0.35em] text-[oklch(0.617_0.093_62)] mb-1">
            {song.genre.toUpperCase()}
          </p>
          <h1 className="font-fantasy text-4xl sm:text-5xl leading-[1.9]">
            {song.title}
          </h1>
          <p className="text-lg text-muted-foreground mt-1">{song.artist}</p>

          <div className="flex flex-wrap gap-2 mt-4">
            <Chip>کلید اصلی: <b className="chord-latin">{song.key}</b></Chip>
            {song.tempo && <Chip>تمپو: <b>{song.tempo}</b></Chip>}
            <Chip>سطح: <b>{song.difficulty}</b></Chip>
            {song.source === "bot" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs">
                <Bot className="w-3.5 h-3.5" aria-hidden />
                شنیده‌شده توسط گیتارکینگ
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5" aria-hidden />
                برگه‌ی تحریریه
              </span>
            )}
          </div>

          <p className="text-sm leading-7 text-muted-foreground mt-4">
            {song.description}
          </p>
        </div>
      </div>

      {/* transpose toolbar */}
      <div className="rounded-2xl border border-border/70 bg-card shadow-sm mt-8 p-4 sm:px-6 flex flex-wrap items-center gap-3">
        <p className="font-bold text-sm">تغییر گام:</p>
        <div className="flex items-center gap-2" dir="ltr">
          <Button
            size="icon"
            variant="outline"
            aria-label="نیم‌پرده پایین"
            onClick={() => setSemi((s) => Math.max(s - 1, -6))}
          >
            <Minus className="w-4 h-4" aria-hidden />
          </Button>
          <span className="chord-latin text-2xl font-black text-primary w-20 text-center">
            {currentKey}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label="نیم‌پرده بالا"
            onClick={() => setSemi((s) => Math.min(s + 1, 6))}
          >
            <Plus className="w-4 h-4" aria-hidden />
          </Button>
        </div>
        {semi !== 0 && (
          <>
            <span className="text-xs bg-secondary rounded-full px-3 py-1 chord-latin">
              {semi > 0 ? `+${semi}` : semi} نیم‌پرده
            </span>
            <button
              type="button"
              onClick={() => setSemi(0)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              گام اصلی
            </button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="gap-1.5 sm:ms-auto"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <ImageDown className="w-4 h-4" aria-hidden />
          )}
          {exporting ? "در حال ساخت عکس…" : "خروجی عکس برگه"}
        </Button>
        {exportErr && (
          <p className="text-xs text-destructive w-full">ساخت عکس ناموفق بود؛ دوباره تلاش کنید.</p>
        )}
        <p className="text-[11px] text-muted-foreground w-full sm:w-auto">
          خروجی یک عکس A4 است؛ اگر برگه بلند باشد، متن خودکار ستون‌بندی می‌شود. اول گام را عوض کن، بعد خروجی بگیر.
        </p>
      </div>

      {/* chord diagrams */}
      <section className="mt-8">
        <SectionTitle>دیاگرام اکوردهای این برگه</SectionTitle>
        <div className="flex flex-wrap gap-2.5" dir="ltr">
          {diagrams.map((c, i) => (
            <ChordDiagram key={`${c}-${i}`} chord={c} />
          ))}
        </div>
      </section>

      {/* play-along player — follows the sheet word by word, chords on the beat */}
      {hasSync && (
        <section className="mt-8">
          <SectionTitle>پخش همراه برگه</SectionTitle>
          <PlayerCard
            audioRef={audioRef}
            playing={playing}
            time={clock}
            duration={duration}
            currentChord={chordNow ? t(chordNow.chord) : "N"}
            onToggle={toggle}
            onSeek={seek}
            nextChord={chordNext ? t(chordNext.chord) : null}
            beatsToNext={beatsToNext}
            beatInBar={beatNow ? beatNow.inBar : null}
            bpb={beats.length > 1 ? bpb : undefined}
            syncOffset={syncOffset}
            onSyncOffset={changeOffset}
          />
          <p className="text-[11px] text-muted-foreground mt-2.5 leading-6">
            پخش کن؛ هر کلمه همان لحظه که خوانده می‌شود پر می‌شود، اکورد هر بخش سرِ
            ضربش روشن می‌شود و اکورد بعدی دو ضرب قبل خبر می‌دهد. صفحه خودش همراهی
            می‌کند (اگر خودت اسکرول کنی، چند ثانیه صبر می‌کند). روی هر بخش برگه
            کلیک کنی، پخش از همان‌جا شروع می‌شود.
          </p>
        </section>
      )}

      {/* sheet — one uniform flow, no section labels, faint circular rays behind */}
      <section className="mt-10">
        <SectionTitle>برگه‌ی اکورد</SectionTitle>
        {canFold && (
          <button
            type="button"
            onClick={() => setFolded((f) => !f)}
            className="-mt-2 mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            <Repeat className="w-3.5 h-3.5" aria-hidden />
            {folded
              ? "بخش‌های تکراری با همان اکوردها یک بار نوشته شده‌اند · نمایش کامل"
              : "جمع کردن بخش‌های تکراری"}
          </button>
        )}
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          {/* faint circular light rays behind the text — square canvas +
              radial mask so no rectangle edge ever shows */}
          <div
            aria-hidden
            className="gk-rays-soft pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[125%] min-w-[500px] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
          {/* emblem watermark behind the text */}
          <img
            src="emblem.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 w-64 -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.05] sm:w-80"
          />
          <div className="relative p-5 sm:p-8">
            {sheetItems.map((item, ri) => {
              const gap = ri > 0 && (item.newSection ? "mt-7" : "mt-3");
              if (item.type === "card") {
                const live = liveViewRoot === item.vi;
                const pass = passOf(item.vi);
                const chords = runChords(item.lines);
                return (
                  <button
                    key={item.key}
                    id={`sheet-row-${ri}`}
                    type="button"
                    onClick={
                      hasSync && item.seekT !== null
                        ? () => seekLyric(item.seekT as number)
                        : undefined
                    }
                    className={cn(
                      "w-full text-start rounded-xl border border-dashed px-3 py-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 scroll-mt-32 transition-colors duration-200",
                      gap,
                      live && playing
                        ? "border-primary/60 bg-primary/5 ring-1 ring-primary/25"
                        : "border-border bg-card/60 hover:bg-secondary/50"
                    )}
                  >
                    <span className="inline-flex items-center gap-1.5 text-sm font-bold">
                      <Repeat className="w-4 h-4 text-primary" aria-hidden />
                      تکرار «{item.label}»
                      {item.view.count < song.sections[item.view.of].lines.length && (
                        <span className="font-normal text-xs text-muted-foreground">
                          ({faNum(item.view.count)} خط)
                        </span>
                      )}
                    </span>
                    {item.view.times > 1 && (
                      <span className="rounded-full bg-primary text-primary-foreground text-[11px] px-2 py-0.5">
                        {live && pass > 0
                          ? `دور ${faNum(pass)} از ${faNum(item.view.times)}`
                          : `${faNum(item.view.times)} بار`}
                      </span>
                    )}
                    {live && playing && (
                      <span className="text-[11px] text-primary">در حال پخش، همان بالا را بخوان</span>
                    )}
                    <span className="flex flex-wrap gap-1" dir="ltr">
                      {chords.map((c, i) => (
                        <span
                          key={`${c}-${i}`}
                          className="chord-latin text-xs font-bold rounded-md bg-secondary px-2 py-0.5 border"
                        >
                          {t(c)}
                        </span>
                      ))}
                    </span>
                    <span className="w-full text-xs text-muted-foreground truncate">
                      {runPreview(item.lines)}
                    </span>
                  </button>
                );
              }
              const rowLive = playing && item.lines.some((l) => l.li === liveLi);
              const pass = item.times ? passOf(item.vi) : 0;
              return (
                <div
                  key={item.key}
                  id={`sheet-row-${ri}`}
                  className={cn(
                    "flex flex-wrap gap-x-4 gap-y-2 sm:gap-x-8 sm:gap-y-3 scroll-mt-32 rounded-xl px-2 -mx-2 transition-colors duration-300",
                    gap,
                    rowLive && "bg-primary/[0.04]"
                  )}
                >
                  {item.lines.map(({ li, line }, k) => {
                    const off = wordOffsets(line);
                    const isLiveLine = li === liveLi;
                    return (
                      <Fragment key={li}>
                        {k > 0 && (
                          <i
                            aria-hidden
                            className="self-center w-1.5 h-1.5 border border-primary/40 rotate-45 inline-block"
                          />
                        )}
                        {line.map((seg, si) => {
                          const isNow = isLiveLine && si === liveSi;
                          const isChordNow = li === chordAt.li && si === chordAt.si;
                          const isChordNext =
                            nextP > 0 && li === nextAt.li && si === nextAt.si && !isChordNow;
                          const seekable = typeof seg.t === "number" && hasSync;
                          const hide = hidesChord(line, si);
                          const words = segWords(seg);
                          return (
                            <button
                              key={si}
                              type="button"
                              onClick={
                                seekable
                                  ? () => {
                                      seekLyric(seg.t!);
                                      setFollow(true);
                                      scrollToRow(ri);
                                    }
                                  : undefined
                              }
                              disabled={!seekable}
                              className={cn(
                                "inline-flex flex-col min-w-10 sm:min-w-14 items-start rounded-lg px-2 py-1 -mx-2 text-start transition-colors duration-200",
                                seekable && "cursor-pointer hover:bg-secondary/60",
                                isNow && "bg-primary/10 ring-1 ring-primary/25"
                              )}
                            >
                              <b
                                className={cn(
                                  "relative inline-block origin-right chord-latin text-lg font-black leading-6 transition-[color,transform] duration-150",
                                  isChordNow
                                    ? "text-primary scale-110"
                                    : isChordNext
                                      ? "text-primary/85"
                                      : "text-primary/60",
                                  seg.auto &&
                                    !hide &&
                                    "underline decoration-dotted decoration-1 underline-offset-4"
                                )}
                                title={
                                  seg.auto && !hide
                                    ? "این اکورد را موتور گیتارکینگ وسط خط شنیده"
                                    : undefined
                                }
                                aria-hidden={hide || undefined}
                              >
                                {hide ? "\u00a0" : t(seg.chord)}
                                {isChordNext && !hide && (
                                  <i
                                    aria-hidden
                                    className="absolute -bottom-0.5 right-0 h-0.5 rounded-full bg-primary/70"
                                    style={{ width: `${Math.round(nextP * 100)}%` }}
                                  />
                                )}
                              </b>
                              {isLiveLine && words.length ? (
                                <span className="text-sm leading-6">
                                  {words.map((w, wi) =>
                                    renderWord(w, off[si] + wi, wi === words.length - 1, true)
                                  )}
                                </span>
                              ) : (
                                <span
                                  className={cn(
                                    "text-sm leading-6 transition-colors duration-200",
                                    isNow ? SUNG : "text-foreground/90"
                                  )}
                                >
                                  {seg.text}
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                  {item.times && (
                    <span
                      className={cn(
                        "self-end inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors",
                        pass > 0 && playing
                          ? "border-primary/50 text-primary"
                          : "text-muted-foreground"
                      )}
                    >
                      <Repeat className="w-3 h-3" aria-hidden />
                      {pass > 0 && playing
                        ? `دور ${faNum(pass)} از ${faNum(item.times)}`
                        : `${faNum(item.times)} بار`}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-6">
          {song.source === "bot"
            ? "اکوردها بر پایه‌ی شنیده‌ی گیتارکینگ است. "
            : "اکوردها توسط تحریریه‌ی گیتارکینگ نوشته شده. "}
          {hasAuto &&
            "اکوردهای نقطه‌چین را موتور گیتارکینگ وسط خط شنیده و به برگه افزوده است. "}
          {!song.officialLyrics && SEG_NOTE}
        </p>
        {song.sourceRef && (
          <p className="text-[11px] text-muted-foreground mt-1.5">
            منبع متن و آهنگ:{" "}
            <a
              href={song.sourceRef.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-primary hover:underline"
            >
              {song.sourceRef.name}
              <ExternalLink className="w-3 h-3" aria-hidden />
            </a>
          </p>
        )}
      </section>

      {/* back to the line that is playing (after the user scrolled away) */}
      {hasSync && playing && !follow && activeRow >= 0 && (
        <button
          type="button"
          onClick={() => {
            setFollow(true);
            scrollToRow(activeRow);
          }}
          className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-4 py-2 text-xs shadow-lg shadow-primary/30"
        >
          <LocateFixed className="w-4 h-4" aria-hidden />
          برگرد به خطی که پخش می‌شود
        </button>
      )}

      {/* bot analysis card */}
      {song.bot && (
        <section className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-extrabold">
            <Sparkles className="w-4.5 h-4.5 text-primary" aria-hidden />
            تحلیل خودکار گیتارکینگ
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            {song.bot.duration ? (
              <Chip>مدت: <b className="chord-latin">{song.bot.duration}</b></Chip>
            ) : null}
            <Chip>تمپو: <b>{song.bot.tempo}</b></Chip>
            <Chip>کلید: <b className="chord-latin">{song.bot.key}</b></Chip>
            <Chip>
              اطمینان:{" "}
              <b>
                {botConfidence(song.bot.confidence)}
                ٪
              </b>
            </Chip>
          </div>
          <div className="mt-4 space-y-2">
            {song.bot.sections.map((bs, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-card px-3 py-2"
              >
                <span className="chord-latin min-w-6 h-6 px-1.5 rounded-md bg-primary text-primary-foreground text-[11px] font-black flex items-center justify-center whitespace-nowrap">
                  {bs.label}
                </span>
                <span className="chord-latin text-xs text-muted-foreground" dir="ltr">
                  {bs.time}
                </span>
                <span className="flex flex-wrap gap-1.5" dir="ltr">
                  {bs.chords.map((c, ci) => (
                    <span
                      key={`${c}-${ci}`}
                      className="chord-latin text-xs font-bold rounded-md bg-secondary px-2 py-0.5 border"
                    >
                      {t(c)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {onPlayDemo && (
            <Button className="mt-5" onClick={onPlayDemo}>
              پخش و تحلیل کامل این آهنگ
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

/** engine confidence as a whole percent (data may carry 0-1 or 0-100) */
function botConfidence(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n <= 1 ? n * 100 : n);
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground [&_b]:text-foreground">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-fantasy text-2xl font-bold mb-4">
      <i className="w-2.5 h-2.5 border-2 border-primary rotate-45 inline-block" aria-hidden />
      {children}
    </h2>
  );
}
