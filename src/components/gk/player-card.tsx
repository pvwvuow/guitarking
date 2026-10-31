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
}

export function PlayerCard({
  audioRef,
  playing,
  time,
  duration,
  currentChord,
  onToggle,
  onSeek,
}: Props) {
  const isN = currentChord === "N";

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
              className={`chord-latin text-4xl sm:text-5xl font-black leading-none ${
                isN ? "text-muted-foreground" : "text-primary"
              }`}
            >
              {chordDisplay(currentChord)}
            </p>
            <p className="text-xs text-muted-foreground mt-1.5">
              {isN ? "بدون آکورد مشخص" : `${chordRootFa(currentChord)} — ${chordQuality(currentChord)}`}
            </p>
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
        </div>
      </div>
      <audio ref={audioRef} preload="auto" className="hidden" />
    </div>
  );
}
