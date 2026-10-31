"use client";

import { ArrowRight, Clock3 } from "lucide-react";
import { POSTS, type Post } from "@/lib/posts";
import { Ornament } from "./ornament";
import { cn } from "@/lib/utils";

/* ── blog index · classic one-column list ───────────────────────────── */

export function BlogView({
  onOpen,
  onBack,
}: {
  onOpen: (slug: string) => void;
  onBack: () => void;
}) {
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
          GUITAR KING BLOG
        </p>
        <h1 className="font-fantasy text-4xl sm:text-5xl mt-2">وبلاگ گیتار کینگ</h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          آموزش‌های گیتار، خبرهای سایت و پشت‌صحنه‌ی ربات اکوردنویس — مرتب، مثل
          فهرست یک وبلاگ.
        </p>
      </header>

      <Ornament className="mt-8" />

      {/* one-column list, newest first */}
      <div className="mt-2 rv on">
        {POSTS.map((p, i) => (
          <PostRow
            key={p.slug}
            post={p}
            onOpen={() => onOpen(p.slug)}
            last={i === POSTS.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

/* one row of the blog index — title, meta, excerpt, hairline divider */
export function PostRow({
  post,
  onOpen,
  last,
}: {
  post: Post;
  onOpen: () => void;
  last?: boolean;
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
      <article>
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
        <h2 className="font-fantasy text-2xl sm:text-[28px] mt-2.5 group-hover:text-primary transition-colors">
          {post.title}
        </h2>
        <p className="text-sm text-muted-foreground leading-7 mt-1 line-clamp-2">
          {post.excerpt}
        </p>
        <span className="inline-flex items-center gap-2 text-[13px] font-bold text-primary mt-3">
          ادامه‌ی مطلب
          <i
            aria-hidden
            className="w-1.5 h-1.5 bg-primary rotate-45 inline-block transition-transform group-hover:-translate-x-1"
          />
        </span>
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
        <h1 className="font-fantasy text-3xl sm:text-4xl leading-snug mt-3">
          {post.title}
        </h1>
      </header>

      <Ornament className="mt-6" />

      {post.cover && (
        <div className="gk-frame rounded-2xl overflow-hidden mt-8">
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

      <footer className="mt-10 rounded-2xl border border-primary/25 bg-primary/5 p-6 text-center">
        <p className="font-fantasy text-xl">آماده‌ای آهنگ بعدی را بزنی؟</p>
        <p className="text-sm text-muted-foreground mt-2 leading-7">
          از آرشیو اکوردها یک آهنگ بردار، یا آهنگ خودت را به ربات بده تا برگه‌اش را بنویسد.
        </p>
        <div className="flex flex-wrap gap-3 justify-center mt-5">
          <a
            href="#archive"
            className="gk-btn gk-btn-red rounded-full text-sm font-bold px-6 py-2.5"
          >
            آرشیو اکوردها
          </a>
          <a
            href="#bot"
            className="gk-btn gk-btn-royal rounded-full text-sm font-bold px-6 py-2.5"
          >
            ربات اکوردنویس
          </a>
        </div>
      </footer>
    </article>
  );
}
