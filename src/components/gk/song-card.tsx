"use client";

import { useState } from "react";
import { Bot, BookOpen } from "lucide-react";
import type { SongEntry } from "@/lib/songs";
import { cn } from "@/lib/utils";

/* Poster with graceful fallback (initial letter on brand gradient) */
export function Poster({
  song,
  className,
}: {
  song: SongEntry;
  className?: string;
}) {
  const [err, setErr] = useState(false);
  if (err) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-gradient-to-br from-primary to-[oklch(0.32_0.13_25)]",
          className
        )}
        role="img"
        aria-label={`پوستر ${song.title}`}
      >
        <span className="font-fantasy text-5xl text-white/95">
          {song.title.slice(0, 1)}
        </span>
      </div>
    );
  }
  return (
    <img
      src={song.poster}
      alt={`پوستر ${song.title} — ${song.artist}`}
      loading="lazy"
      onError={() => setErr(true)}
      className={className}
    />
  );
}

/* Archive card — a classic magazine plate: square photo mounted in a
   white gutter, editorial caption block underneath with an overline,
   Markazi headline and a hairline-ruled meta row. */
export function SongCard({
  song,
  onOpen,
  delay,
}: {
  song: SongEntry;
  onOpen: () => void;
  delay: number;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ transitionDelay: `${delay}s` }}
      className="group text-start rv"
      aria-label={`دیدن اکورد ${song.title} از ${song.artist}`}
    >
      <div className="gk-lift">
        {/* mounted photo */}
        <div className="gk-photo">
          <div className="relative aspect-square overflow-hidden gk-photo-fill">
            <Poster
              song={song}
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.05]"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {song.isNew && (
              <span className="absolute top-2.5 start-2.5 bg-primary text-primary-foreground text-[10px] font-black px-2 py-0.5 rounded-[3px]">
                جدید
              </span>
            )}

            {/* hover CTA */}
            <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
              <span className="rounded-[4px] bg-white/95 text-foreground text-xs font-bold px-4 py-2 shadow-lg inline-flex items-center gap-1.5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
                <BookOpen className="w-3.5 h-3.5 text-primary" aria-hidden />
                دیدن برگه‌ی اکورد
              </span>
            </span>
          </div>
        </div>

        {/* caption block */}
        <div className="pt-3.5">
          <p className="flex items-center gap-2 text-[10px] font-bold tracking-wide">
            <span className="text-[oklch(0.617_0.093_62)]">{song.genre}</span>
            <i
              className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block"
              aria-hidden
            />
            <span className="text-muted-foreground font-medium">
              {song.dateFa}
            </span>
          </p>
          <h3 className="font-fantasy text-[23px] leading-8 mt-0.5 line-clamp-1 group-hover:text-primary transition-colors">
            {song.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {song.artist}
          </p>

          {/* hairline meta row */}
          <div className="mt-2.5 pt-2.5 border-t border-border/70 flex items-center justify-between">
            <span className="chord-latin text-[13px] font-black text-foreground/85">
              {song.key}
            </span>
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
              {song.source === "bot" ? (
                <>
                  <Bot className="w-3 h-3" aria-hidden />
                  ربات
                </>
              ) : (
                <>
                  <BookOpen className="w-3 h-3" aria-hidden />
                  تحریریه
                </>
              )}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
