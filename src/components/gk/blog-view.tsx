"use client";

import { ArrowRight, Clock3 } from "lucide-react";
import { POSTS, type Post } from "@/lib/posts";
import { SONGS } from "@/lib/songs";
import { groupByArtist } from "./artists-view";
import { Ornament } from "./ornament";
import { cn } from "@/lib/utils";

/* ── blog index · classic one-column directory + artists index ─────── */

export function BlogView({
  onOpen,
  onBack,
}: {
  onOpen: (slug: string) => void;
  onBack: () => void;
}) {
  const groups = groupByArtist(SONGS);

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
        <p className="gk-overline text-[10px] text-[oklch(0.617_0.093_62)]">
          Guitar King Blog
        </p>
        <h1 className="font-fantasy text-4xl sm:text-5xl mt-2">وبلاگ گیتار کینگ</h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          آموزش‌های گیتار، خبرهای سایت و پشت‌صحنه‌ی ربات اکوردنویس — مرتب، مثل
          فهرست یک مجله.
        </p>
        <div className="gk-double-rule mt-7" aria-hidden />
      </header>

      {/* one-column list, newest first */}
      <div className="mt-1 rv on">
        {POSTS.map((p, i) => (
          <PostRow
            key={p.slug}
            post={p}
            index={i + 1}
            onOpen={() => onOpen(p.slug)}
            last={i === POSTS.length - 1}
          />
        ))}
      </div>

      <Ornament className="mt-10" />

      {/* artists index — magazine TOC style with dotted leaders */}
      <section className="mt-8 rv on" aria-label="فهرست خواننده‌ها">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <p className="gk-overline text-[10px] text-[oklch(0.617_0.093_62)]">
              Artists Index
            </p>
            <h2 className="font-fantasy text-3xl sm:text-4xl mt-1.5">
              فهرست خواننده‌ها
            </h2>
          </div>
          <p className="text-xs text-muted-foreground pb-1.5">
            <span className="chord-latin gk-figure">{groups.length}</span>{" "}
            خواننده · به ترتیب الفبا
          </p>
        </div>
        <div className="gk-double-rule mt-4" aria-hidden />

        <div className="grid sm:grid-cols-2 gap-x-10 mt-1">
          {groups.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() =>
                (window.location.hash = `#/artist/${encodeURIComponent(g.name)}`)
              }
              aria-label={`دیدن برگه‌های ${g.name}`}
              className="group w-full flex items-baseline text-start py-3.5 border-b border-border/60"
            >
              <span className="font-bold text-[15px] group-hover:text-primary transition-colors">
                {g.name}
              </span>
              <span className="gk-leader" aria-hidden />
              <span className="shrink-0 text-[11px] text-muted-foreground group-hover:text-primary transition-colors">
                <span className="chord-latin font-bold">{g.songs.length}</span> برگه
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

/* one row of the blog index — figure number, meta, title, excerpt */
export function PostRow({
  post,
  onOpen,
  last,
  index,
}: {
  post: Post;
  onOpen: () => void;
  last?: boolean;
  index?: number;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "group w-full text-start py-6 sm:py-7 border-b border-border/80 transition-colors",
        last && "border-b-0"
      )}
    >
      <article className="flex gap-5">
        {typeof index === "number" && (
          <span
            className="gk-figure shrink-0 w-9 text-center text-[26px] leading-[1.3] text-foreground/25 group-hover:text-primary/60 transition-colors"
            aria-hidden
          >
            {String(index).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
            <span
              className={cnKind(post.kind) + " rounded-[3px] text-[10px] font-bold px-2 py-0.5"}
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
          <h2 className="font-fantasy text-2xl sm:text-[28px] mt-2 group-hover:text-primary transition-colors">
            {post.title}
          </h2>
          <p className="text-sm text-muted-foreground leading-7 mt-1 line-clamp-2">
            {post.excerpt}
          </p>
          <span className="inline-flex items-center gap-2 text-[13px] font-bold text-primary mt-2.5">
            ادامه‌ی مطلب
            <i
              aria-hidden
              className="w-1.5 h-1.5 bg-primary rotate-45 inline-block transition-transform group-hover:-translate-x-1"
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
  return (
    <article className="w-full max-w-2xl mx-auto px-4 pb-16">
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به وبلاگ
      </button>

      <header className="mt-8 rv on">
        <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <span
            className={cnKind(post.kind) + " rounded-[3px] text-[10px] font-bold px-2 py-1"}
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
        <h1 className="font-fantasy text-3xl sm:text-4xl leading-snug mt-3">
          {post.title}
        </h1>
      </header>

      <Ornament className="mt-6" />

      {post.cover && (
        <div className="gk-photo mt-8">
          <img src={post.cover} alt="" className="w-full aspect-[16/9] object-cover gk-photo-fill" />
        </div>
      )}

      <div className="mt-8 space-y-5">
        {post.body.map((para, i) => (
          <p key={i} className="leading-9 text-[15px] text-foreground/90">
            {para}
          </p>
        ))}
      </div>

      <footer className="mt-10 border-y border-foreground/25 py-7 text-center">
        <p className="font-fantasy text-2xl">آماده‌ای آهنگ بعدی را بزنی؟</p>
        <p className="text-sm text-muted-foreground mt-2 leading-7">
          از آرشیو اکوردها یک آهنگ بردار، یا آهنگ خودت را به ربات بده تا برگه‌اش را بنویسد.
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
            ربات اکوردنویس
          </a>
        </div>
      </footer>
    </article>
  );
}
