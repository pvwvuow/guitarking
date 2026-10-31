"use client";

import { ArrowRight } from "lucide-react";
import type { SongEntry } from "@/lib/songs";
import { SongCard } from "./song-card";
import { Ornament } from "./ornament";

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

/* ── single artist page (opened from the blog's artists index) ──────── */

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
