"use client";

import { ArrowRight, BookOpen, Clock3, Newspaper } from "lucide-react";
import { POSTS, type Post } from "@/lib/posts";
import { Ornament } from "./ornament";

/* ── blog index ─────────────────────────────────────────────────────── */

export function BlogView({
  onOpen,
  onBack,
}: {
  onOpen: (slug: string) => void;
  onBack: () => void;
}) {
  const [first, ...rest] = POSTS;

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
          GUITAR KING BLOG
        </p>
        <h1 className="font-fantasy text-4xl sm:text-5xl font-bold mt-2">
          تازه‌های گیتار کینگ
        </h1>
        <p className="text-muted-foreground mt-3 max-w-xl mx-auto leading-8">
          خبرهای سایت، آموزش‌های گیتار و پشت‌صحنه‌ی ربات اکوردنویس — همه‌جا یکجا.
        </p>
      </header>

      {/* featured post */}
      <button
        type="button"
        onClick={() => onOpen(first.slug)}
        className="group mt-10 w-full text-start rv on"
      >
        <article className="gk-frame rounded-2xl overflow-hidden grid md:grid-cols-[300px_1fr] items-stretch">
          <div className="relative aspect-[16/10] md:aspect-auto md:min-h-[240px] overflow-hidden">
            {first.cover ? (
              <img
                src={first.cover}
                alt=""
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-primary to-[oklch(0.32_0.13_25)] flex items-center justify-center">
                <span className="font-fantasy text-7xl text-white/95">
                  {first.title.slice(0, 1)}
                </span>
              </div>
            )}
            <span className="absolute top-3 start-3 rounded-full bg-black/55 backdrop-blur text-white text-[10px] font-bold px-3 py-1 inline-flex items-center gap-1.5">
              <Newspaper className="w-3 h-3" aria-hidden />
              {first.kind}
            </span>
          </div>
          <div className="p-6 sm:p-8">
            <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {first.dateFa}
              <i className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
              <span className="inline-flex items-center gap-1">
                <Clock3 className="w-3.5 h-3.5" aria-hidden />
                <span className="chord-latin">{first.minutes}</span> دقیقه خواندن
              </span>
            </p>
            <h2 className="font-fantasy text-2xl sm:text-3xl font-bold mt-2 group-hover:text-primary transition-colors leading-relaxed">
              {first.title}
            </h2>
            <p className="text-sm text-muted-foreground leading-7 mt-3 line-clamp-3">
              {first.excerpt}
            </p>
            <span className="inline-flex items-center gap-1.5 text-sm font-bold text-primary mt-4">
              خواندن مطلب
              <i className="w-1.5 h-1.5 bg-primary rotate-45 inline-block transition-transform group-hover:translate-x-1" aria-hidden />
            </span>
          </div>
        </article>
      </button>

      <Ornament className="mt-10" />

      {/* rest of the posts */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-8 mt-10">
        {rest.map((p) => (
          <PostCard key={p.slug} post={p} onOpen={() => onOpen(p.slug)} />
        ))}
      </div>
    </div>
  );
}

export function PostCard({ post, onOpen }: { post: Post; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="group text-start rv on">
      <article className="rounded-xl border bg-card overflow-hidden gk-lift h-full flex flex-col">
        <div className="relative aspect-[16/9] overflow-hidden">
          {post.cover ? (
            <img
              src={post.cover}
              alt=""
              loading="lazy"
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[oklch(0.968_0.009_75)] to-[oklch(0.955_0.014_75)] flex items-center justify-center border-b">
              <span className="font-fantasy text-5xl text-primary/85">
                {post.title.slice(0, 1)}
              </span>
            </div>
          )}
          <span
            className={cnKind(post.kind) +
              " absolute top-2.5 start-2.5 rounded-full text-[10px] font-bold px-2.5 py-1"}
          >
            {post.kind}
          </span>
        </div>
        <div className="p-4 flex flex-col flex-1">
          <p className="flex items-center gap-2 text-[11px] text-muted-foreground">
            {post.dateFa}
            <i className="w-1 h-1 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
            <span className="inline-flex items-center gap-1">
              <Clock3 className="w-3 h-3" aria-hidden />
              <span className="chord-latin">{post.minutes}</span> دقیقه
            </span>
          </p>
          <h3 className="font-extrabold leading-7 mt-1.5 line-clamp-2 group-hover:text-primary transition-colors">
            {post.title}
          </h3>
          <p className="text-xs text-muted-foreground leading-6 mt-2 line-clamp-3 flex-1">
            {post.excerpt}
          </p>
          <span className="inline-flex items-center gap-1.5 text-xs font-bold text-primary mt-3">
            <BookOpen className="w-3.5 h-3.5" aria-hidden />
            ادامه‌ی مطلب
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
        <h1 className="font-fantasy text-3xl sm:text-4xl font-bold leading-snug mt-3">
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
        <p className="font-fantasy text-xl font-bold">آماده‌ای آهنگ بعدی را بزنی؟</p>
        <p className="text-sm text-muted-foreground mt-2 leading-7">
          از آرشیو اکوردها یک آهنگ بردار، یا آهنگ خودت را به ربات بده تا برگه‌اش را بنویسد.
        </p>
        <div className="flex flex-wrap gap-2 justify-center mt-4">
          <a href="#archive" className="rounded-full bg-primary text-primary-foreground text-sm font-bold px-5 py-2 hover:opacity-90 transition-opacity">
            آرشیو اکوردها
          </a>
          <a href="#bot" className="rounded-full border border-foreground/25 text-sm font-bold px-5 py-2 hover:border-primary hover:text-primary transition-colors">
            ربات اکوردنویس
          </a>
        </div>
      </footer>
    </article>
  );
}
