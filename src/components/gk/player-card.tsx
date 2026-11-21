"use client";

import type { RefObject } from "react";
import { Play, Pause } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { fmtTime, chordDisplay, chordRootFa, chordQuality } from "@/lib/format";

interface Props {
  audioRef: RefObject<HTMLAudioElement | null>;
  playing: boolean;
  time: number;
  duration: number;
  currentChord: string;
  onToggle: () => void;
  onSeek: (t: number) => void;
  /** next chord (beat-synced timeline) */
  nextChord?: string | null;
  /** beats left until the next chord */
  beatsToNext?: number | null;
  /** 0-based position of the current beat in its bar */
  beatInBar?: number | null;
  /** beats per bar */
  bpb?: number;
  /** lyric/chord highlight offset (s): + earlier, - later (wireless
      headphones play late, so the sheet must follow later) */
  syncOffset?: number;
  onSyncOffset?: (v: number) => void;
}

const STEP = 0.05;

function offsetLabel(v: number) {
  if (Math.abs(v) < 0.005) return "هم‌زمان";
  const s = Math.abs(v).toFixed(2);
  return v > 0 ? `${s} ثانیه زودتر` : `${s} ثانیه دیرتر`;
}

export function PlayerCard({
  audioRef,
  playing,
  time,
  duration,
  currentChord,
  onToggle,
  onSeek,
  nextChord,
  beatsToNext,
  beatInBar,
  bpb,
  syncOffset = 0,
  onSyncOffset,
}: Props) {
  const isN = currentChord === "N";
  const showBeats = typeof beatInBar === "number" && !!bpb && bpb > 1;
  const showNext = !!nextChord && nextChord !== "N" && nextChord !== currentChord;
  const soon = showNext && typeof beatsToNext === "number" && beatsToNext > 0 && beatsToNext <= 2;

  return (
    <div className="rounded-2xl border bg-card p-4 sm:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        {/* current chord */}
        <div
          className={`flex items-center gap-4 sm:gap-5 rounded-xl bg-secondary/70 border px-5 py-4 min-w-40 justify-center ${
            playing && !isN ? "gk-glow" : ""
          }`}
          aria-live="polite"
        >
          <div className="text-center">
            <p className="text-[11px] text-muted-foreground mb-1">آکورد همین حالا</p>
            <p
              key={currentChord}
              className={`chord-latin text-4xl sm:text-5xl font-black leading-none transition-transform duration-150 ${
                isN ? "text-muted-foreground" : "text-primary"
              } ${playing && !isN ? "animate-in zoom-in-90 fade-in-0 duration-150" : ""}`}
            >
              {chordDisplay(currentChord)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isN ? "بدون آکورد مشخص" : `${chordRootFa(currentChord)} — ${chordQuality(currentChord)}`}
            </p>
            {showBeats && (
              <div className="flex justify-center gap-1.5 mt-2.5" dir="ltr" aria-hidden>
                {Array.from({ length: bpb as number }, (_, i) => (
                  <span
                    key={i}
                    className={`h-2 w-2 rounded-full transition-transform duration-75 ${
                      playing && i === beatInBar
                        ? i === 0
                          ? "bg-primary scale-150"
                          : "bg-primary/70 scale-125"
                        : "bg-foreground/15"
                    }`}
                  />
                ))}
              </div>
            )}
            {showNext && (
              <p
                className={`text-[11px] mt-1.5 transition-colors ${
                  soon ? "text-primary font-bold" : "text-muted-foreground"
                }`}
              >
                بعدی:{" "}
                <b className="chord-latin text-foreground">{chordDisplay(nextChord as string)}</b>
                {typeof beatsToNext === "number" && beatsToNext > 0 && beatsToNext <= 16 && (
                  <>
                    {" · "}
                    <span className="chord-latin tabular-nums">{beatsToNext}</span> ضرب دیگر
                  </>
                )}
              </p>
            )}
          </div>
        </div>

        {/* transport */}
        <div className="flex-1 w-full">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              onClick={onToggle}
              className="w-12 h-12 rounded-full shrink-0"
              aria-label={playing ? "مکث" : "پخش"}
            >
              {playing ? (
                <Pause className="w-5 h-5" aria-hidden />
              ) : (
                <Play className="w-5 h-5 -me-0.5" aria-hidden />
              )}
            </Button>
            <div className="flex-1" dir="ltr">
              <Slider
                value={[Math.min(time, duration || 0)]}
                max={duration || 1}
                step={0.1}
                onValueChange={(v) => onSeek(v[0])}
                aria-label="جلو و عقب بردن آهنگ"
              />
            </div>
            <span className="chord-latin text-xs text-muted-foreground tabular-nums shrink-0" dir="ltr">
              {fmtTime(time)} / {fmtTime(duration)}
            </span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            روی هر آکورد در بخش‌ها یا خط زمانی کلیک کن تا پخش از همان‌جا شروع شود.
          </p>
          {onSyncOffset && (
            <div className="flex flex-wrap items-center gap-1.5 mt-2.5 text-[11px] text-muted-foreground">
              <span>هماهنگی متن با صدا:</span>
              <button
                type="button"
                onClick={() => onSyncOffset(syncOffset - STEP)}
                className="rounded-md border px-2 py-0.5 hover:border-primary hover:text-primary transition-colors"
                title="متن و آکورد کمی دیرتر روشن شوند (مثلاً با هدفون بی‌سیم)"
              >
                دیرتر
              </button>
              <span className="min-w-24 text-center tabular-nums text-foreground">
                {offsetLabel(syncOffset)}
              </span>
              <button
                type="button"
                onClick={() => onSyncOffset(syncOffset + STEP)}
                className="rounded-md border px-2 py-0.5 hover:border-primary hover:text-primary transition-colors"
                title="متن و آکورد کمی زودتر روشن شوند"
              >
                زودتر
              </button>
              {Math.abs(syncOffset) >= 0.005 && (
                <button
                  type="button"
                  onClick={() => onSyncOffset(0)}
                  className="px-1.5 py-0.5 hover:text-primary transition-colors"
                >
                  بازنشانی
                </button>
              )}
            </div>
          )}
        </div>
      </div>
      <audio ref={audioRef} preload="auto" className="hidden" />
    </div>
  );
}
