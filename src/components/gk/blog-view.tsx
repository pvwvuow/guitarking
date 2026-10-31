"use client";

import { ArrowLeft, ArrowRight, Clock3 } from "lucide-react";
import { POSTS, type Post } from "@/lib/posts";
import { SONGS } from "@/lib/songs";
import { groupByArtist } from "./artists-view";
import { Ornament } from "./ornament";
import { cn } from "@/lib/utils";

/* ── blog index · modern card list + artists directory ────────────── */

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
        <div className="gk-titlebar mx-auto mt-3" aria-hidden />
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          آموزش‌های گیتار، خبرهای سایت و پشت‌صحنه‌ی ربات اکوردنویس.
        </p>
      </header>

      {/* posts — modern cards, newest first */}
      <div className="mt-8 space-y-4 rv on">
        {POSTS.map((p, i) => (
          <PostRow
            key={p.slug}
            post={p}
            index={i + 1}
            onOpen={() => onOpen(p.slug)}
          />
        ))}
      </div>

      <Ornament className="mt-10" />

      {/* artists directory — modern chips with gradient initials */}
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
            <span className="chord-latin font-bold">{groups.length}</span>{" "}
            خواننده · به ترتیب الفبا
          </p>
        </div>
        <div className="gk-rule mt-4" aria-hidden />

        <div className="grid sm:grid-cols-2 gap-3 mt-6">
          {groups.map((g) => (
            <button
              key={g.name}
              type="button"
              onClick={() =>
                (window.location.hash = `#/artist/${encodeURIComponent(g.name)}`)
              }
              aria-label={`دیدن برگه‌های ${g.name}`}
              className="group w-full flex items-center gap-3.5 text-start rounded-2xl border border-border/70 bg-card px-4 py-3.5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-lg hover:shadow-foreground/10 hover:border-primary/40"
            >
              <span className="relative w-11 h-11 shrink-0 rounded-full bg-gradient-to-br from-primary/15 via-primary/5 to-[oklch(0.617_0.093_62/0.15)] ring-1 ring-primary/20 flex items-center justify-center">
                <span className="font-fantasy text-xl text-primary leading-none pb-2">
                  {g.name.slice(0, 1)}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block font-bold text-[15px] truncate group-hover:text-primary transition-colors">
                  {g.name}
                </span>
                <span className="block text-[11px] text-muted-foreground mt-0.5">
                  {g.songs.length > 1
                    ? `${g.songs.length} برگه‌ی اکورد`
                    : "۱ برگه‌ی اکورد"}
                </span>
              </span>
              <ArrowLeft
                className="w-4 h-4 shrink-0 text-muted-foreground/50 group-hover:text-primary group-hover:-translate-x-1 transition-all"
                aria-hidden
              />
            </button>
          ))}
        </div>
      </section>
    </div>
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
