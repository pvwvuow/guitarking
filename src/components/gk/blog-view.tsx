"use client";

import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { POSTS, type Post } from "@/lib/posts";
import { SONGS, type SongEntry } from "@/lib/songs";
import { groupByArtist } from "./artists-view";
import { Ornament } from "./ornament";
import { cn } from "@/lib/utils";

/* ── blog index · modern card list + artists directory ────────────── */

export function BlogView({
  onOpen,
  onOpenSong,
  onBack,
}: {
  onOpen: (slug: string) => void;
  onOpenSong?: (slug: string) => void;
  onBack: () => void;
}) {
  const groups = groupByArtist(SONGS);

  /* blog feed = chord sheets (category «اکوردها») + editorial posts,
     chords first like the newest entries */
  const items: Array<
    | { kind: "song"; song: SongEntry }
    | { kind: "post"; post: Post }
  > = [
    ...SONGS.map((song) => ({ kind: "song" as const, song })),
    ...POSTS.map((post) => ({ kind: "post" as const, post })),
  ];

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-20">
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به خانه
      </button>

      <header className="mt-8 text-center rv on">
        <p className="gk-overline text-[10px] text-[oklch(0.617_0.093_62)]">
          Guitar King Blog
        </p>
        <h1 className="font-fantasy text-4xl sm:text-5xl mt-2">وبلاگ گیتار کینگ</h1>
        <div className="gk-titlebar mx-auto mt-3" aria-hidden />
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          آموزش‌های گیتار، خبرهای سایت و پشت‌صحنه‌ی گیتارکینگ.
        </p>
      </header>

      {/* posts + singers index — the list lives on the right, sticks while scrolling */}
      <div className="mt-10 flex flex-col gap-12 lg:flex-row-reverse lg:items-start lg:gap-10">
        <div className="min-w-0 flex-1 rv on">
          {/* feed — chord sheets + posts, newest first */}
          <div className="space-y-4">
            {items.map((it, i) =>
              it.kind === "song" ? (
                <SongPostRow
                  key={it.song.slug}
                  song={it.song}
                  index={i + 1}
                  onOpen={
                    onOpenSong
                      ? () => onOpenSong(it.song.slug)
                      : () =>
                          (window.location.hash = `#/song/${it.song.slug}`)
                  }
                />
              ) : (
                <PostRow
                  key={it.post.slug}
                  post={it.post}
                  index={i + 1}
                  onOpen={() => onOpen(it.post.slug)}
                />
              )
            )}
          </div>
          <Ornament className="mt-10" />
        </div>

        <aside className="shrink-0 self-start lg:w-60 xl:w-72 lg:sticky lg:top-24 rv on">
          <ArtistsSidebar groups={groups} />
        </aside>
      </div>
    </div>
  );
}

/* ── singers index sidebar — one column of names, always in reach ───── */

export function ArtistsSidebar({
  groups,
}: {
  groups: ReturnType<typeof groupByArtist>;
}) {
  return (
    <nav
      aria-label="فهرست خواننده‌ها"
      className="rounded-2xl border border-border/70 bg-card p-5 shadow-sm"
    >
      <p className="gk-overline text-[10px] text-[oklch(0.617_0.093_62)]">
        Artists Index
      </p>
      <h2 className="font-fantasy text-2xl leading-relaxed mt-1.5">
        فهرست خواننده‌ها
      </h2>
      <p className="text-[11px] text-muted-foreground mt-1">
        <span className="chord-latin font-bold">{groups.length}</span> خواننده ·
        به ترتیب الفبا
      </p>

      {/* one simple column · names only */}
      <ul className="mt-4 divide-y divide-border/60 border-t border-border/60">
        {groups.map((g) => (
          <li key={g.name}>
            <a
              href={`#/artist/${encodeURIComponent(g.name)}`}
              aria-label={`دیدن برگه‌های ${g.name}`}
              className="group flex items-center gap-2.5 py-2.5"
            >
              <span className="flex-1 truncate text-sm font-bold leading-6 group-hover:text-primary transition-colors">
                {g.name}
              </span>
              <span
                className="shrink-0 chord-latin text-[10px] font-bold text-muted-foreground/50 group-hover:text-primary transition-colors"
                aria-hidden
              >
                {g.songs.length}
              </span>
              <ArrowLeft
                className="w-3.5 h-3.5 shrink-0 text-muted-foreground/30 group-hover:text-primary group-hover:-translate-x-0.5 transition-all"
                aria-hidden
              />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/* one chord-sheet card in the blog feed — category «اکوردها» */
export function SongPostRow({
  song,
  onOpen,
  index,
}: {
  song: SongEntry;
  onOpen: () => void;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-start rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/10 hover:border-primary/40"
    >
      <article className="flex gap-4 sm:gap-5">
        {typeof index === "number" && (
          <span
            className="chord-latin shrink-0 w-10 h-10 rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground font-black text-sm flex items-center justify-center transition-colors duration-300"
            aria-hidden
          >
            {String(index).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            <span className="bg-primary text-primary-foreground rounded-full text-[10px] font-bold px-2.5 py-0.5">
              اکوردها
            </span>
            {song.dateFa}
            <i className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
            <span className="inline-flex items-center gap-1">
              {song.artist}
            </span>
            <i className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
            <span className="inline-flex items-center gap-1">
              گام <b className="chord-latin">{song.key}</b>
            </span>
          </p>
          <h2 className="font-extrabold text-xl sm:text-[22px] leading-8 mt-2 group-hover:text-primary transition-colors">
            اکورد «{song.title}»
          </h2>
          <p className="text-sm text-muted-foreground leading-7 mt-1 line-clamp-2">
            {song.description}
          </p>
          <span className="inline-flex items-center gap-2 text-[13px] font-bold text-primary mt-3">
            دیدن برگه‌ی اکورد
            <ArrowLeft
              className="w-4 h-4 transition-transform group-hover:-translate-x-1"
              aria-hidden
            />
          </span>
        </div>
      </article>
    </button>
  );
}

/* one post card — index number, kind chip, title, excerpt, arrow */
export function PostRow({
  post,
  onOpen,
  index,
}: {
  post: Post;
  onOpen: () => void;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full text-start rounded-2xl border border-border/70 bg-card p-5 sm:p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/10 hover:border-primary/40"
    >
      <article className="flex gap-4 sm:gap-5">
        {typeof index === "number" && (
          <span
            className="chord-latin shrink-0 w-10 h-10 rounded-xl bg-secondary text-foreground/40 group-hover:bg-primary group-hover:text-primary-foreground font-black text-sm flex items-center justify-center transition-colors duration-300"
            aria-hidden
          >
            {String(index).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            <span
              className={cnKind(post.kind) + " rounded-full text-[10px] font-bold px-2.5 py-0.5"}
            >
              {post.kind}
            </span>
            {post.dateFa}
            <i className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3.5 h-3.5" aria-hidden />
              <span className="chord-latin">{post.minutes}</span> دقیقه خواندن
            </span>
          </p>
          <h2 className="font-extrabold text-xl sm:text-[22px] leading-8 mt-2 group-hover:text-primary transition-colors">
            {post.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-7 mt-1 line-clamp-2">
            {post.excerpt}
          </p>
          <span className="inline-flex items-center gap-2 text-[13px] font-bold text-primary mt-3">
            ادامه‌ی مطلب
            <ArrowLeft
              className="w-4 h-4 transition-transform group-hover:-translate-x-1"
              aria-hidden
            />
          </span>
        </div>
      </article>
    </button>
  );
}

function cnKind(kind: Post["kind"]) {
  return kind === "خبر"
    ? "bg-primary text-primary-foreground"
    : "bg-[oklch(0.617_0.093_62/0.14)] text-[oklch(0.45_0.07_62)]";
}

/* ── single post ────────────────────────────────────────────────────── */

export function PostView({
  post,
  onBack,
}: {
  post: Post;
  onBack: () => void;
}) {
  const groups = groupByArtist(SONGS);

  return (
    <div className="w-full max-w-5xl mx-auto px-4 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به وبلاگ
      </button>

      {/* article + singers index on the right, in reach while reading */}
      <div className="flex flex-col gap-10 lg:flex-row-reverse lg:items-start lg:gap-10">
        <article className="min-w-0 flex-1">

      <header className="mt-8 rv on">
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={cnKind(post.kind) + " rounded-full text-[10px] font-bold px-2.5 py-1"}
          >
            {post.kind}
          </span>
          {post.dateFa}
          <i className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
          <span className="inline-flex items-center gap-1">
            <Clock3 className="w-3.5 h-3.5" aria-hidden />
            <span className="chord-latin">{post.minutes}</span> دقیقه خواندن
          </span>
        </p>
        <h1 className="font-fantasy text-3xl sm:text-4xl leading-[1.9] mt-3">
          {post.title}
        </h1>
        <div className="gk-titlebar mt-2" aria-hidden />
      </header>

      {post.cover && (
        <div className="mt-8 rounded-2xl overflow-hidden ring-1 ring-foreground/10 shadow-xl shadow-foreground/15">
          <img src={post.cover} alt="" className="w-full aspect-[16/9] object-cover" />
        </div>
      )}

      <div className="mt-8 space-y-5">
        {post.body.map((para, i) => (
          <p key={i} className="leading-9 text-[15px] text-foreground/90">
            {para}
          </p>
        ))}
      </div>

      {/* CTA card */}
      <footer className="mt-12 rounded-3xl bg-secondary/60 border border-border/60 p-7 text-center">
        <p className="font-fantasy text-2xl">آماده‌ای آهنگ بعدی را بزنی؟</p>
        <p className="text-sm text-muted-foreground mt-2 leading-7">
          از آرشیو اکوردها یک آهنگ بردار، یا آهنگ خودت را به گیتارکینگ بده تا برگه‌اش را بنویسد.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-5">
          <a
            href="#archive"
            className="gk-btn gk-btn-red text-sm px-6 py-2.5"
          >
            آرشیو اکوردها
          </a>
          <a
            href="#bot"
            className="gk-btn gk-btn-royal text-sm px-6 py-2.5"
          >
            گیتارکینگ
          </a>
        </div>
      </footer>
        </article>

        <aside className="shrink-0 self-start lg:w-60 xl:w-72 lg:sticky lg:top-24">
          <ArtistsSidebar groups={groups} />
        </aside>
      </div>
    </div>
  );
}
