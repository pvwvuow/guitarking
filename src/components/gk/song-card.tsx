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

/* Archive card: the square cover stays uncropped on top and a deep ink
   band with title / artist / key composes it into a portrait poster. */
export function SongCard({
  song,
  onOpen,
  delay,
}: {
  song: SongEntry;
  onOpen: () => void;
  delay: number;
}) {
  const preview = song.sections
    .flatMap((s) => s.lines)
    .flat()
    .map((l) => l.chord)
    .filter((c, i, a) => a.indexOf(c) === i)
    .slice(0, 3);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={{ transitionDelay: `${delay}s` }}
      className="group text-start rv"
      aria-label={`دیدن اکورد ${song.title} از ${song.artist}`}
    >
      <div className="rounded-xl overflow-hidden border bg-card gk-lift flex flex-col h-full shadow-[0_14px_30px_-22px_oklch(0.235_0.012_60/0.5)]">
        {/* cover — keeps the square art intact */}
        <div className="relative aspect-square overflow-hidden">
          <Poster
            song={song}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-[1.06]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

          {song.isNew && (
            <span className="absolute top-2.5 start-2.5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1 shadow-sm">
              جدید
            </span>
          )}
          {song.source === "bot" ? (
            <span className="absolute top-2.5 end-2.5 rounded-full bg-black/60 backdrop-blur text-white text-[10px] font-bold px-2.5 py-1 inline-flex items-center gap-1">
              <Bot className="w-3 h-3" aria-hidden />
              ربات
            </span>
          ) : (
            <span className="absolute top-2.5 end-2.5 rounded-full bg-white/85 backdrop-blur text-foreground/80 text-[10px] font-bold px-2.5 py-1 inline-flex items-center gap-1">
              <BookOpen className="w-3 h-3" aria-hidden />
              تحریریه
            </span>
          )}

          {/* hover CTA */}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
            <span className="rounded-full bg-white/95 text-foreground text-xs font-bold px-4 py-2 shadow-lg inline-flex items-center gap-1.5 translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <BookOpen className="w-3.5 h-3.5 text-primary" aria-hidden />
              دیدن برگه‌ی اکورد
            </span>
          </span>

          {/* hover chord chips */}
          <div className="absolute inset-x-0 bottom-0 p-2.5 flex gap-1.5 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 transition-all duration-300">
            {preview.map((c) => (
              <span
                key={c}
                className="chord-latin text-[11px] font-bold text-white border border-white/50 rounded bg-black/35 backdrop-blur px-2 py-0.5"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        {/* ink band */}
        <div className="relative bg-[oklch(0.235_0.012_60)] text-white p-3.5 flex-1 flex flex-col justify-center gap-1.5">
          <i
            aria-hidden
            className="absolute inset-x-0 top-0 h-[2.5px] bg-primary origin-right scale-x-0 group-hover:scale-x-100 transition-transform duration-500"
          />
          <h3 className="font-extrabold leading-6 line-clamp-1 group-hover:text-white">
            <i
              aria-hidden
              className="w-1.5 h-1.5 bg-primary rotate-45 inline-block me-2 mb-0.5"
            />
            {song.title}
          </h3>
          <p className="text-[11px] text-white/65 line-clamp-1">{song.artist}</p>
          <div className="flex items-center justify-between gap-2 mt-1">
            <span className="chord-latin rounded-full bg-primary text-primary-foreground text-[10px] font-black px-2.5 py-0.5 leading-5">
              {song.key}
            </span>
            <span className="text-[10px] text-white/50">
              {song.genre}
              <i
                aria-hidden
                className="w-1 h-1 bg-white/40 rotate-45 inline-block mx-1.5 mb-px"
              />
              {song.dateFa}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
