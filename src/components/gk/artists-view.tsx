"use client";

import { ArrowLeft, ArrowRight } from "lucide-react";
import type { SongEntry } from "@/lib/songs";
import { SongCard } from "./song-card";
import { Ornament } from "./ornament";
import { cn } from "@/lib/utils";

export interface ArtistGroup {
  name: string;
  songs: SongEntry[];
  keys: string[];
}

/** group archive songs by artist (stable, sorted by Persian name) */
export function groupByArtist(songs: SongEntry[]): ArtistGroup[] {
  const map = new Map<string, SongEntry[]>();
  for (const s of songs) {
    const arr = map.get(s.artist);
    if (arr) arr.push(s);
    else map.set(s.artist, [s]);
  }
  return [...map.entries()]
    .map(([name, songs]) => ({
      name,
      songs,
      keys: [...new Set(songs.map((s) => s.key))].slice(0, 4),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fa"));
}

/* ── artists index · classic one-column list ────────────────────────── */

export function ArtistsView({
  songs,
  onOpenArtist,
  onBack,
}: {
  songs: SongEntry[];
  onOpenArtist: (name: string) => void;
  onBack: () => void;
}) {
  const groups = groupByArtist(songs);

  return (
    <div className="w-full max-w-3xl mx-auto px-4 pb-20">
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به خانه
      </button>

      <header className="mt-8 text-center rv on">
        <p className="font-display text-[11px] tracking-[0.35em] text-[oklch(0.617_0.093_62)]">
          ARTISTS INDEX
        </p>
        <h1 className="font-fantasy text-4xl sm:text-5xl mt-2">فهرست خواننده‌ها</h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          همه‌ی خواننده‌هایی که برگه‌ی اکوردشان در گیتارکینگ هست؛ مرتب، به ترتیب
          حروف الفبا.
        </p>
      </header>

      <Ornament className="mt-8" />

      <div className="mt-2 rv on">
        {groups.map((g, i) => (
          <button
            key={g.name}
            type="button"
            onClick={() => onOpenArtist(g.name)}
            aria-label={`دیدن برگه‌های ${g.name}`}
            className={cn(
              "group w-full flex items-center gap-4 text-start py-5 border-b border-border/80 transition-colors",
              i === groups.length - 1 && "border-b-0"
            )}
          >
            {/* initial seal */}
            <span className="relative shrink-0 w-11 h-11 rounded-full border border-primary/50 bg-primary/5 flex items-center justify-center">
              <span className="font-fantasy text-xl text-primary">
                {g.name.slice(0, 1)}
              </span>
            </span>

            <span className="flex-1 min-w-0">
              <span className="font-extrabold text-lg group-hover:text-primary transition-colors">
                {g.name}
              </span>
              <span className="block text-xs text-muted-foreground mt-0.5 line-clamp-1">
                {g.songs
                  .slice(0, 2)
                  .map((s) => s.title)
                  .join("، ")}
                {g.songs.length > 2 ? " و …" : ""}
              </span>
            </span>

            <span className="chord-latin shrink-0 text-[11px] font-bold text-muted-foreground rounded-full border px-3 py-1 group-hover:border-primary/50 group-hover:text-primary transition-colors">
              {g.songs.length} برگه
            </span>
            <ArrowLeft
              className="w-4 h-4 shrink-0 text-primary opacity-0 -translate-x-1.5 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
              aria-hidden
            />
          </button>
        ))}
      </div>
    </div>
  );
}

/* ── single artist ──────────────────────────────────────────────────── */

export function ArtistView({
  group,
  onOpenSong,
  onBack,
}: {
  group: ArtistGroup;
  onOpenSong: (slug: string) => void;
  onBack: () => void;
}) {
  return (
    <div className="w-full max-w-6xl mx-auto px-4 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به فهرست خواننده‌ها
      </button>

      <header className="mt-8 flex items-center gap-5 rv on">
        <span className="relative w-20 h-20 sm:w-24 sm:h-24 shrink-0 rounded-full border-2 border-primary/60 bg-primary/5 flex items-center justify-center">
          <span className="font-fantasy text-3xl sm:text-4xl text-primary">
            {group.name.slice(0, 1)}
          </span>
          <i
            aria-hidden
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rotate-45 border-2 border-background"
          />
        </span>
        <div>
          <h1 className="font-fantasy text-3xl sm:text-4xl leading-snug">
            {group.name}
          </h1>
          <div className="flex flex-wrap gap-2 mt-2 text-xs">
            <span className="chord-latin rounded-full border px-3 py-1 text-muted-foreground">
              {group.songs.length} برگه‌ی اکورد
            </span>
            {group.keys.map((k) => (
              <span
                key={k}
                className="chord-latin rounded-full bg-primary/10 text-primary font-bold px-3 py-1"
              >
                {k}
              </span>
            ))}
          </div>
        </div>
      </header>

      <Ornament className="mt-8" />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-8 mt-10">
        {group.songs.map((song, i) => (
          <SongCard
            key={song.slug}
            song={song}
            delay={i * 0.05}
            onOpen={() => onOpenSong(song.slug)}
          />
        ))}
      </div>
    </div>
  );
}
