"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Bot,
  BookOpen,
  ExternalLink,
  ImageDown,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { SongEntry } from "@/lib/songs";
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
          });
      });
      li++;
    });
  });
  return out.sort((a, b) => a.t - b.t);
}

function isSilentText(text: string) {
  return !text.trim() || text.trim() === "—";
}

export function SongSheet({ song, onBack, onPlayDemo }: Props) {
  const [semi, setSemi] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(false);
  const t = useMemo(() => (c: string) => transposeChord(c, semi), [semi]);
  const currentKey = t(song.key);
  const diagrams = useMemo(() => songChords(song).map(t), [song, t]);

  // ---- play-along (karaoke) state: frame-accurate clock ----
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const { time: clock, playing, duration, seekTo } = useAudioClock(
    audioRef,
    song.audio
  );
  const time = clock + VISUAL_LEAD;
  const timed = useMemo(() => buildTimed(song), [song]);
  const hasSync = !!song.audio && timed.length > 1;

  // lyric clock (t) and chord clock (ct) are separate: singers push or
  // delay a syllable, the band changes chord on the beat
  const lyricStarts = useMemo(() => timed.map((e) => e.t), [timed]);
  const byChord = useMemo(() => [...timed].sort((a, b) => a.ct - b.ct), [timed]);
  const chordStarts = useMemo(() => byChord.map((e) => e.ct), [byChord]);

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
    if (!active || isSilentText(active.text)) return null;
    const next = timed[activeIdx + 1];
    const tNext = next ? next.t : duration || active.t + 6;
    return wordTimes(active.text, active.t, tNext, active.w);
  }, [active, activeIdx, timed, duration]);
  const wordIdx = karaoke ? lastAtOrBefore(karaoke.starts, time) : -1;

  // beat pulse (engine beat grid, when the sheet was synced)
  const beats = useMemo(() => song.beats ?? [], [song.beats]);
  const bpb = song.bpb ?? 4;
  const beatPos = useMemo(
    () => beatPositions(beats, song.downbeats, bpb),
    [beats, song.downbeats, bpb]
  );
  const beatNow = beats.length > 1 ? beatState(beats, beatPos, time) : null;
  const beatsToNext =
    chordNext && beats.length > 1 ? beatsBetween(beats, time, chordNext.ct) : null;

  // keep the active line in view while playing (very smooth scroll)
  const activeLi = active?.li ?? -1;
  useEffect(() => {
    if (!playing || activeLi < 0) return;
    const el = document.getElementById(`sheet-line-${activeLi}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [activeLi, playing]);

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
          />
          <p className="text-[11px] text-muted-foreground mt-2.5 leading-6">
            پخش کن؛ متن کلمه‌به‌کلمه همراه صدا قرمز می‌شود، اکورد هر بخش سرِ ضربش
            روشن می‌شود و صفحه خودش همراهی می‌کند. روی هر بخش برگه هم کلیک کنی،
            پخش از همان‌جا شروع می‌شود.
          </p>
        </section>
      )}

      {/* sheet — one uniform flow, no section labels, faint circular rays behind */}
      <section className="mt-10">
        <SectionTitle>برگه‌ی اکورد</SectionTitle>
        <div className="relative overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
          {/* faint circular light rays behind the text — square canvas +
              radial mask so no rectangle edge ever shows */}
          <div
            aria-hidden
            className="gk-rays-soft pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[125%] min-w-[500px] max-w-none -translate-x-1/2 -translate-y-1/2 rounded-full"
          />
          {/* emblem watermark behind the text */}
          <img
            src="/emblem.png"
            alt=""
            aria-hidden
            className="pointer-events-none absolute left-1/2 top-1/2 w-64 -translate-x-1/2 -translate-y-1/2 select-none opacity-[0.05] sm:w-80"
          />
          <div className="relative space-y-3 p-5 sm:p-8">
            {song.sections.flatMap((sec) => sec.lines).map((line, li) => (
              <div
                key={li}
                id={`sheet-line-${li}`}
                className="flex flex-wrap gap-x-8 gap-y-3 scroll-mt-32"
              >
                {line.map((seg, si) => {
                  const isNow =
                    !!active && active.li === li && active.si === si;
                  const isChordNow =
                    !!chordNow && chordNow.li === li && chordNow.si === si;
                  const seekable = typeof seg.t === "number" && hasSync;
                  return (
                    <button
                      key={si}
                      type="button"
                      onClick={
                        seekable
                          ? () => {
                              seek(seg.t! + 0.01);
                              document
                                .getElementById(`sheet-line-${li}`)
                                ?.scrollIntoView({
                                  behavior: "smooth",
                                  block: "center",
                                });
                            }
                          : undefined
                      }
                      disabled={!seekable}
                      className={cn(
                        "inline-flex flex-col min-w-14 items-start rounded-lg px-2 py-1 -mx-2 text-start transition-colors duration-200",
                        seekable && "cursor-pointer hover:bg-secondary/60",
                        isNow && "bg-primary/10 ring-1 ring-primary/25"
                      )}
                    >
                      <b
                        className={cn(
                          "chord-latin text-lg font-black leading-6 transition-colors duration-100",
                          isChordNow ? "text-primary" : "text-primary/60"
                        )}
                      >
                        {t(seg.chord)}
                      </b>
                      {isNow && karaoke ? (
                        <span className="text-sm leading-6">
                          {karaoke.words.map((w, wi) => (
                            <span
                              key={wi}
                              className={cn(
                                "transition-colors duration-100",
                                wi < wordIdx && SUNG,
                                wi === wordIdx &&
                                  `${SUNG} underline decoration-2 underline-offset-[6px]`,
                                wi > wordIdx && "text-foreground/90"
                              )}
                            >
                              {w}
                              {wi < karaoke.words.length - 1 ? " " : ""}
                            </span>
                          ))}
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
              </div>
            ))}
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-6">
          {song.source === "bot"
            ? "اکوردها بر پایه‌ی شنیده‌ی گیتارکینگ است. "
            : "اکوردها توسط تحریریه‌ی گیتارکینگ نوشته شده. "}
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

      {/* bot analysis card */}
      {song.bot && (
        <section className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-extrabold">
            <Sparkles className="w-4.5 h-4.5 text-primary" aria-hidden />
            تحلیل خودکار گیتارکینگ
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Chip>مدت: <b className="chord-latin">{song.bot.duration}</b></Chip>
            <Chip>تمپو: <b>{song.bot.tempo}</b></Chip>
            <Chip>کلید: <b className="chord-latin">{song.bot.key}</b></Chip>
            <Chip>اطمینان: <b>{song.bot.confidence}٪</b></Chip>
          </div>
          <div className="mt-4 space-y-2">
            {song.bot.sections.map((bs, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-card px-3 py-2"
              >
                <span className="chord-latin w-6 h-6 rounded-md bg-primary text-primary-foreground text-[11px] font-black flex items-center justify-center">
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
