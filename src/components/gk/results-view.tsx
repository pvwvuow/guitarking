"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
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
  AudioLines,
  LayoutGrid,
  ChartBar,
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
import { PlayerCard } from "./player-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const { toast } = useToast();

  // wire audio element
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.src = audioUrl;
    const onTime = () => setTime(a.currentTime);
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
    };
  }, [audioUrl]);

  const toggle = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    if (a.paused) a.play().catch(() => {});
    else a.pause();
  }, []);

  const seek = useCallback(
    (t: number) => {
      const a = audioRef.current;
      if (!a) return;
      const clamped = Math.min(Math.max(t, 0), result.duration);
      a.currentTime = clamped;
      setTime(clamped);
    },
    [result.duration]
  );

  const currentSegment = useMemo(
    () => result.segments.find((s) => time >= s.start && time < s.end) ?? null,
    [time, result.segments]
  );
  const currentSection = useMemo(
    () => result.sections.find((s) => time >= s.start && time < s.end) ?? null,
    [time, result.sections]
  );

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
      sub: "ضرب در دقیقه",
    },
    {
      icon: Clock3,
      label: "مدت آهنگ",
      value: fmtTime(result.duration),
      sub: `${result.sections.length} بخش شناسایی شد`,
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
        time={time}
        duration={result.duration}
        currentChord={currentSegment?.chord ?? "N"}
        onToggle={toggle}
        onSeek={seek}
      />

      {/* tabs */}
      <Tabs defaultValue="sections" dir="rtl">
        <TabsList className="grid grid-cols-3 w-full max-w-md mx-auto">
          <TabsTrigger value="sections" className="gap-1.5">
            <LayoutGrid className="w-4 h-4" aria-hidden />
            بخش‌ها
          </TabsTrigger>
          <TabsTrigger value="timeline" className="gap-1.5">
            <AudioLines className="w-4 h-4" aria-hidden />
            خط زمانی
          </TabsTrigger>
          <TabsTrigger value="overview" className="gap-1.5">
            <ChartBar className="w-4 h-4" aria-hidden />
            خلاصه
          </TabsTrigger>
        </TabsList>

        {/* ── sections ── */}
        <TabsContent value="sections" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {result.sections.map((sec) => {
              const isActive = currentSection?.id === sec.id;
              return (
                <div
                  key={sec.id}
                  className={cn(
                    "rounded-xl border bg-card/70 p-4 transition-colors",
                    isActive && "border-primary/60"
                  )}
                >
                  <div className="flex items-center gap-3 mb-3">
                    <span
                      className="chord-latin w-9 h-9 rounded-lg flex items-center justify-center font-black text-background text-lg"
                      style={{ backgroundColor: sec.color ?? "#f59e0b" }}
                    >
                      {sec.label}
                    </span>
                    <div>
                      <p className="font-bold text-sm">
                        بخش {sec.label}
                        {isActive && (
                          <Badge className="ms-2" variant="secondary">
                            در حال پخش
                          </Badge>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground chord-latin" dir="ltr">
                        {fmtTime(sec.start)} – {fmtTime(sec.end)}
                      </p>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground mb-2">ترتیب آکوردها:</p>
                  <div className="flex flex-wrap gap-1.5 mb-3" dir="ltr">
                    {sec.progression.length === 0 && (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {sec.progression.map((c, i) => (
                      <span
                        key={i}
                        className="chord-latin text-sm font-bold rounded-md bg-secondary px-2.5 py-1 border"
                      >
                        {chordDisplay(c)}
                      </span>
                    ))}
                  </div>

                  <div className="max-h-44 overflow-y-auto gk-scroll rounded-lg border">
                    {sec.segments.map((sg, i) => {
                      const active =
                        currentSegment !== null &&
                        time >= sg.start &&
                        time < sg.end;
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => seek(sg.start + 0.01)}
                          className={cn(
                            "w-full flex items-center justify-between px-3 py-2 text-sm transition-colors hover:bg-secondary/70",
                            active && "bg-primary/15",
                            i > 0 && "border-t"
                          )}
                        >
                          <span
                            className="chord-latin text-xs text-muted-foreground tabular-nums"
                            dir="ltr"
                          >
                            {fmtTime(sg.start)}
                          </span>
                          <span
                            className={cn(
                              "chord-latin font-bold",
                              active ? "text-primary" : "text-foreground"
                            )}
                          >
                            {chordDisplay(sg.chord)}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </TabsContent>

        {/* ── timeline ── */}
        <TabsContent value="timeline" className="mt-4 space-y-4">
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
                aria-valuenow={Math.round(time)}
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
                        return (
                          <div
                            key={i}
                            className="absolute top-0 h-full flex items-center justify-center"
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              backgroundColor: `${sec.color ?? "#f59e0b"}26`,
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
                style={{ left: `${(time / result.duration) * 100}%` }}
                aria-hidden
              />
            </div>
          </div>

          <div className="rounded-xl border bg-card/70">
            <p className="text-sm font-bold px-4 pt-3 pb-2">
              همه‌ی آکوردها به ترتیب
            </p>
            <div className="max-h-96 overflow-y-auto gk-scroll border-t">
              {result.segments.map((sg, i) => {
                const active =
                  currentSegment !== null &&
                  time >= sg.start &&
                  time < sg.end;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => seek(sg.start + 0.01)}
                    className={cn(
                      "w-full grid grid-cols-[70px_1fr_auto] items-center px-4 py-2 text-sm transition-colors hover:bg-secondary/70",
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
        </TabsContent>

        {/* ── overview ── */}
        <TabsContent value="overview" className="mt-4 space-y-4">
          <div className="rounded-xl border bg-card/70 p-4">
            <p className="text-sm font-bold mb-4">
              پرکاربردترین آکوردها (بر اساس مدت پخش)
            </p>
            <div className="space-y-3" dir="ltr">
              {result.chordSeconds.slice(0, 8).map((u) => (
                <div key={u.chord} className="flex items-center gap-3">
                  <span className="chord-latin font-bold text-sm w-16 text-left">
                    {u.chord}
                  </span>
                  <div className="flex-1 h-3 rounded-full bg-secondary overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{
                        width: `${
                          100 *
                          (u.percent /
                            (result.chordSeconds[0]?.percent || 100))
                        }%`,
                      }}
                    />
                  </div>
                  <span className="chord-latin text-xs text-muted-foreground w-20 text-right tabular-nums">
                    {u.percent}٪ · {Math.round(u.seconds)}s
                  </span>
                </div>
              ))}
              {result.chordSeconds.length === 0 && (
                <p className="text-sm text-muted-foreground">آکوردی شناسایی نشد.</p>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card/70 p-4">
            <p className="text-sm font-bold mb-2">ترتیب کلی بخش‌ها</p>
            <div className="flex flex-wrap gap-2">
              {result.sections.map((sec) => (
                <button
                  key={sec.id}
                  type="button"
                  onClick={() => seek(sec.start + 0.01)}
                  className="flex items-center gap-2 rounded-lg border bg-secondary/60 px-3 py-1.5 text-xs hover:bg-secondary transition-colors"
                >
                  <span
                    className="chord-latin w-5 h-5 rounded flex items-center justify-center font-black text-background text-[11px]"
                    style={{ backgroundColor: sec.color ?? "#f59e0b" }}
                  >
                    {sec.label}
                  </span>
                  <span className="chord-latin" dir="ltr">
                    {fmtTime(sec.start)} – {fmtTime(sec.end)}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground leading-6 px-1">
            نکته: تشخیص آکورد به‌صورت خودکار با تحلیل طیف هارمونیک انجام می‌شود و
            در آهنگ‌های پیچیده (مدولاسیون، جزئیات هفتم‌ها، سازهای پراکنده) ممکن
            است خطا داشته باشد؛ برگه را به‌عنوان نقطه شروع تمرین در نظر بگیر.
          </p>
        </TabsContent>
      </Tabs>
    </div>
  );
}
