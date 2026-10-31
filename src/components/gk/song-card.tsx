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

/* Archive card — modern minimal: a soft white tile with a square
   photo, floating key chip, gentle hover lift and red accents. */
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
      <div className="rounded-2xl border border-border/70 bg-card overflow-hidden shadow-sm transition-all duration-300 group-hover:-translate-y-1.5 group-hover:shadow-xl group-hover:shadow-foreground/10 group-hover:border-primary/40">
        {/* square photo */}
        <div className="relative aspect-square overflow-hidden">
          <Poster
            song={song}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          {song.isNew && (
            <span className="absolute top-3 start-3 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-full shadow-lg shadow-primary/40">
              جدید
            </span>
          )}

          {/* key chip — always visible, glassy */}
          <span className="absolute bottom-3 end-3 rounded-lg bg-black/35 backdrop-blur-md text-white chord-latin text-xs font-black px-2.5 py-1 ring-1 ring-white/25">
            {song.key}
          </span>

          {/* hover CTA — floating round play/read button */}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <span className="w-12 h-12 rounded-full bg-white/95 shadow-xl flex items-center justify-center scale-75 group-hover:scale-100 transition-transform duration-300">
              <BookOpen className="w-5 h-5 text-primary" aria-hidden />
            </span>
          </span>
        </div>

        {/* body */}
        <div className="p-4">
          <p className="flex items-center gap-2 text-[11px]">
            <span className="rounded-full bg-secondary px-2.5 py-0.5 font-bold text-[oklch(0.45_0.07_62)]">
              {song.genre}
            </span>
            <span className="text-muted-foreground">{song.dateFa}</span>
          </p>
          <h3 className="font-extrabold text-[17px] leading-7 mt-2 line-clamp-1 group-hover:text-primary transition-colors">
            {song.title}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
            {song.artist}
          </p>

          <div className="mt-3 pt-3 border-t border-border/60 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground inline-flex items-center gap-1.5">
              {song.source === "bot" ? (
                <>
                  <span className="w-5 h-5 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                    <Bot className="w-3 h-3" aria-hidden />
                  </span>
                  گیتارکینگ
                </>
              ) : (
                <>
                  <span className="w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-[oklch(0.45_0.07_62)]">
                    <BookOpen className="w-3 h-3" aria-hidden />
                  </span>
                  تحریریه
                </>
              )}
            </span>
            <i
              aria-hidden
              className="w-1.5 h-1.5 bg-primary rotate-45 inline-block opacity-0 group-hover:opacity-100 transition-opacity"
            />
          </div>
        </div>
      </div>
    </button>
  );
}
