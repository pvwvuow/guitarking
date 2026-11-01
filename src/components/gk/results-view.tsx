"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  KeyRound,
  Gauge,
  Clock3,
  Sparkles,
  RotateCcw,
  Download,
  Copy,
  ImageDown,
  Loader2,
  ListMusic,
} from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import {
  buildChordSheet,
  chordDisplay,
  chordRootFa,
  fmtTime,
  keyLabelFa,
  keyLabelLatin,
} from "@/lib/format";
import { downloadAnalysisSheetImage } from "@/lib/sheet-image";
import { useAudioClock, VISUAL_LEAD } from "@/lib/use-audio-clock";
import {
  beatPositions,
  beatState,
  beatsBetween,
  lastAtOrBefore,
} from "@/lib/sheet-sync";
import { PlayerCard } from "./player-card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

interface Props {
  result: AnalysisResult;
  audioUrl: string;
  fileName: string;
  onReset: () => void;
}

export function ResultsView({ result, audioUrl, fileName, onReset }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const { toast } = useToast();

  // frame-accurate clock (timeupdate only fires ~4x/s)
  const { time: clock, playing, seekTo } = useAudioClock(audioRef, audioUrl);
  const time = clock + VISUAL_LEAD;

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback(
    (t: number) => {
      seekTo(Math.min(Math.max(t, 0), result.duration));
    },
    [result.duration, seekTo]
  );

  // ---- chord timeline (beat-exact since engine v7) ----
  const segStarts = useMemo(
    () => result.segments.map((s) => s.start),
    [result.segments]
  );
  const curIdx = useMemo(() => {
    const i = lastAtOrBefore(segStarts, time);
    return i >= 0 && time < result.segments[i].end ? i : -1;
  }, [segStarts, time, result.segments]);
  const currentSegment = curIdx >= 0 ? result.segments[curIdx] : null;
  const nextSegment = useMemo(() => {
    for (let i = Math.max(curIdx + 1, 0); i < result.segments.length; i++) {
      const s = result.segments[i];
      if (s.chord !== "N" && s.chord !== currentSegment?.chord) return s;
    }
    return null;
  }, [curIdx, currentSegment, result.segments]);

  // ---- beat grid ----
  const beats = useMemo(() => result.beats ?? [], [result.beats]);
  const bpb = result.bpb ?? 4;
  const beatPos = useMemo(
    () => beatPositions(beats, result.downbeats, bpb),
    [beats, result.downbeats, bpb]
  );
  const beatNow = beats.length > 1 ? beatState(beats, beatPos, time) : null;
  const beatsToNext =
    nextSegment && beats.length > 1 ? beatsBetween(beats, time, nextSegment.start) : null;

  // keep the active row centred inside the list while playing
  useEffect(() => {
    if (!playing || curIdx < 0) return;
    const box = listRef.current;
    const row = box?.querySelector<HTMLElement>(`[data-seg="${curIdx}"]`);
    if (!box || !row) return;
    box.scrollTo({
      top: row.offsetTop - box.clientHeight / 2 + row.clientHeight / 2,
      behavior: "smooth",
    });
  }, [curIdx, playing]);

  const ribbonSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    seek((x / rect.width) * result.duration);
  };

  const copySheet = async () => {
    try {
      await navigator.clipboard.writeText(buildChordSheet(fileName, result));
      toast({ title: "کپی شد", description: "برگه‌ی آکورد در کلیپ‌بورد است." });
    } catch {
      toast({ title: "کپی ناموفق بود", variant: "destructive" });
    }
  };

  const downloadSheet = () => {
    const blob = new Blob([buildChordSheet(fileName, result)], {
      type: "text/plain;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fileName.replace(/\.[^.]+$/, "") || "chords"}-chords.txt`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "دانلود شد", description: "برگه‌ی آکورد ذخیره شد." });
  };

  const [exportingImg, setExportingImg] = useState(false);
  const downloadImage = async () => {
    setExportingImg(true);
    try {
      await downloadAnalysisSheetImage(fileName, result);
      toast({ title: "عکس ساخته شد", description: "برگه‌ی اکورد به‌صورت تصویر ذخیره شد." });
    } catch {
      toast({ title: "ساخت عکس ناموفق بود", variant: "destructive" });
    } finally {
      setExportingImg(false);
    }
  };

  const stats = [
    {
      icon: KeyRound,
      label: "کلید آهنگ",
      value: keyLabelFa(result.key),
      sub: keyLabelLatin(result.key),
    },
    {
      icon: Gauge,
      label: "تمپو",
      value: `${Math.round(result.tempo)}`,
      sub: result.bpb === 3 ? "ضرب در دقیقه · سه‌ضربی" : "ضرب در دقیقه",
    },
    {
      icon: Clock3,
      label: "مدت آهنگ",
      value: fmtTime(result.duration),
      sub: "از اول تا آخر",
    },
    {
      icon: Sparkles,
      label: "اطمینان تشخیص",
      value: `${Math.round(result.confidence * 100)}٪`,
      sub: "میانگین تطبیق الگوها",
    },
  ];

  return (
    <div className="w-full max-w-4xl mx-auto space-y-5">
      {/* back — the analyze & play section had no way out */}
      <button
        type="button"
        onClick={onReset}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت
      </button>

      {/* header row */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <h2 className="text-lg font-extrabold">برگه‌ی آکورد آماده است!</h2>
          <p className="text-sm text-muted-foreground chord-latin truncate max-w-sm" dir="ltr">
            {fileName}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={downloadImage} disabled={exportingImg}>
            {exportingImg ? (
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
            ) : (
              <ImageDown className="w-4 h-4" aria-hidden />
            )}
            خروجی عکس
          </Button>
          <Button variant="outline" size="sm" onClick={downloadSheet}>
            <Download className="w-4 h-4" aria-hidden />
            دانلود برگه
          </Button>
          <Button variant="outline" size="sm" onClick={copySheet}>
            <Copy className="w-4 h-4" aria-hidden />
            کپی متن
          </Button>
          <Button variant="secondary" size="sm" onClick={onReset}>
            <RotateCcw className="w-4 h-4" aria-hidden />
            آهنگ جدید
          </Button>
        </div>
      </div>

      {/* stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-xl border bg-card/70 p-4">
            <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2">
              <s.icon className="w-4 h-4 text-primary" aria-hidden />
              {s.label}
            </div>
            <p
              className={cn(
                "text-xl font-extrabold",
                s.label === "کلید آهنگ" && "text-lg"
              )}
            >
              {s.value}
            </p>
            <p className="text-[11px] text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* player */}
      <PlayerCard
        audioRef={audioRef}
        playing={playing}
        time={clock}
        duration={result.duration}
        currentChord={currentSegment?.chord ?? "N"}
        onToggle={toggle}
        onSeek={seek}
        nextChord={nextSegment?.chord ?? null}
        beatsToNext={beatsToNext}
        beatInBar={beatNow ? beatNow.inBar : null}
        bpb={beats.length > 1 ? bpb : undefined}
      />

      {/* chord ribbon — the whole song at a glance, click to jump */}
      <div>
        <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1.5">
          <ListMusic className="w-4 h-4" aria-hidden />
          روی خط زمانی کلیک کن تا پخش از آن نقطه شروع شود:
        </p>
        <div
          dir="ltr"
          className="relative rounded-xl border overflow-hidden select-none"
        >
          <div
            className="flex h-20 w-full cursor-pointer bg-secondary/50"
            onClick={ribbonSeek}
            role="slider"
            aria-label="خط زمانی آکوردها"
            aria-valuenow={Math.round(clock)}
            aria-valuemin={0}
            aria-valuemax={Math.round(result.duration)}
          >
            {result.sections.map((sec) => {
              const frac = (sec.end - sec.start) / result.duration;
              return (
                <div
                  key={sec.id}
                  className="relative h-full border-r-2 border-background/60 overflow-hidden"
                  style={{ width: `${frac * 100}%` }}
                >
                  {sec.segments.map((sg, i) => {
                    const left =
                      ((sg.start - sec.start) / (sec.end - sec.start)) * 100;
                    const width =
                      ((sg.end - sg.start) / (sec.end - sec.start)) * 100;
                    const now = time >= sg.start && time < sg.end;
                    return (
                      <div
                        key={i}
                        className="absolute top-0 h-full flex items-center justify-center"
                        style={{
                          left: `${left}%`,
                          width: `${width}%`,
                          backgroundColor: `${sec.color ?? "#f59e0b"}${now ? "66" : "26"}`,
                          borderLeft: `1px solid ${sec.color ?? "#f59e0b"}55`,
                        }}
                      >
                        {width > 7 && (
                          <span className="chord-latin text-[10px] sm:text-xs font-bold text-foreground/90 truncate px-0.5">
                            {chordDisplay(sg.chord)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                  <span
                    className="chord-latin absolute bottom-0.5 left-1 text-[10px] font-black"
                    style={{ color: sec.color ?? "#f59e0b" }}
                  >
                    {sec.label}
                  </span>
                </div>
              );
            })}
          </div>
          {/* playhead */}
          <div
            className="absolute top-0 h-full w-0.5 bg-white/90 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.7)]"
            style={{ left: `${(clock / result.duration) * 100}%` }}
            aria-hidden
          />
        </div>
      </div>

      {/* all chords in order */}
      <div className="rounded-xl border bg-card/70">
        <p className="text-sm font-bold px-4 pt-3 pb-2">همه‌ی آکوردها به ترتیب</p>
        <div ref={listRef} className="relative max-h-96 overflow-y-auto gk-scroll border-t">
          {result.segments.map((sg, i) => {
            const active = i === curIdx;
            return (
              <button
                key={i}
                type="button"
                data-seg={i}
                onClick={() => seek(sg.start + 0.01)}
                className={cn(
                  "w-full grid grid-cols-[70px_1fr_auto] items-center px-4 py-2 text-sm transition-colors duration-100 hover:bg-secondary/70",
                  active && "bg-primary/15",
                  i > 0 && "border-t"
                )}
              >
                <span
                  className="chord-latin text-xs text-muted-foreground tabular-nums text-left"
                  dir="ltr"
                >
                  {fmtTime(sg.start)}
                </span>
                <span
                  className={cn(
                    "chord-latin font-bold text-left",
                    active ? "text-primary" : "text-foreground"
                  )}
                >
                  {chordDisplay(sg.chord)}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {active ? "◄ همین حالا" : `${chordRootFa(sg.chord)}`}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-6 px-1">
        نکته: تشخیص آکورد به‌صورت خودکار با تحلیل طیف هارمونیک انجام می‌شود و در
        آهنگ‌های پیچیده ممکن است خطا داشته باشد؛ برگه را به‌عنوان نقطه‌ی شروع
        تمرین در نظر بگیر.
      </p>
    </div>
  );
}
