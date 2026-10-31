"use client";

import { ArrowRight, ListMusic } from "lucide-react";
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

/* ── artists index ──────────────────────────────────────────────────── */

export function ArtistsView({
  songs,
  onOpenArtist,
  onOpenSong,
  onBack,
}: {
  songs: SongEntry[];
  onOpenArtist: (name: string) => void;
  onOpenSong: (slug: string) => void;
  onBack: () => void;
}) {
  const groups = groupByArtist(songs);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-16">
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
        <h1 className="font-fantasy text-4xl sm:text-5xl font-bold mt-2">
          فهرست خواننده‌ها
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          همه‌ی خواننده‌هایی که برگه‌ی اکوردشان در گیتارکینگ هست؛ به ترتیب حروف الفبا.
        </p>
      </header>

      <div className="mt-10 space-y-9">
        {groups.map((g) => (
          <section key={g.name} className="rv on">
            <button
              type="button"
              onClick={() => onOpenArtist(g.name)}
              className="group w-full text-start rounded-xl border bg-card p-4 sm:p-5 gk-lift flex items-center gap-4"
              aria-label={`دیدن برگه‌های ${g.name}`}
            >
              <span className="relative w-14 h-14 sm:w-16 sm:h-16 shrink-0 rounded-full border-2 border-primary/60 bg-primary/5 flex items-center justify-center">
                <span className="font-fantasy text-2xl sm:text-3xl font-bold text-primary">
                  {g.name.slice(0, 1)}
                </span>
                <i
                  aria-hidden
                  className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-primary rotate-45 border-2 border-card"
                />
              </span>
              <span className="flex-1 min-w-0">
                <span className="font-extrabold text-lg group-hover:text-primary transition-colors flex items-center gap-2.5 flex-wrap">
                  {g.name}
                  <span className="chord-latin text-[11px] font-bold text-muted-foreground rounded-full border px-2.5 py-0.5">
                    {g.songs.length} برگه
                  </span>
                </span>
                <span className="flex flex-wrap gap-1.5 mt-2">
                  {g.keys.map((k) => (
                    <span
                      key={k}
                      className="chord-latin text-[11px] font-bold text-primary bg-primary/10 rounded px-2 py-0.5"
                    >
                      {k}
                    </span>
                  ))}
                </span>
              </span>
              {/* stacked posters */}
              <span className="hidden sm:flex items-center gap-0 -space-x-5 -space-s-5 shrink-0">
                {g.songs.slice(0, 3).map((s, i) => (
                  <img
                    key={s.slug}
                    src={s.poster}
                    alt=""
                    loading="lazy"
                    className={cnPoster(i)}
                  />
                ))}
              </span>
              <ListMusic className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" aria-hidden />
            </button>
          </section>
        ))}
      </div>
    </div>
  );
}

function cnPoster(i: number) {
  return [
    "w-12 h-12 rounded-lg object-cover border-2 border-card shadow-md",
    "w-12 h-12 rounded-lg object-cover border-2 border-card shadow-md",
    "w-12 h-12 rounded-lg object-cover border-2 border-card shadow-md",
  ][i];
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
          <span className="font-fantasy text-3xl sm:text-4xl font-bold text-primary">
            {group.name.slice(0, 1)}
          </span>
          <i
            aria-hidden
            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-2.5 h-2.5 bg-primary rotate-45 border-2 border-background"
          />
        </span>
        <div>
          <h1 className="font-fantasy text-3xl sm:text-4xl font-bold leading-snug">
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
