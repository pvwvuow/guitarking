"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bot,
  CircleCheck,
  Clock3,
  Loader2,
  Music2,
  Sparkles,
  TriangleAlert,
} from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { UploadZone } from "@/components/gk/upload-zone";
import { AnalyzingView } from "@/components/gk/analyzing-view";
import { ResultsView } from "@/components/gk/results-view";
import { SongSheet } from "@/components/gk/song-sheet";
import { SongCard } from "@/components/gk/song-card";
import { Ornament } from "@/components/gk/ornament";
import { BlogView, PostView, PostCard } from "@/components/gk/blog-view";
import {
  ArtistsView,
  ArtistView,
  groupByArtist,
} from "@/components/gk/artists-view";
import { POSTS, getPost } from "@/lib/posts";
import { Button } from "@/components/ui/button";
import { SONGS, FEATURED_SLUG, getSong, type SongEntry } from "@/lib/songs";
import { transposeChord } from "@/lib/transpose";
import demoAnalysis from "@/data/demo-song.json";
import { cn } from "@/lib/utils";

const DEMO_SONG = demoAnalysis as unknown as AnalysisResult;
const DEMO_NAME = "Amin Ghobad - Koo Beheshtemoon.mp3";
const DEMO_URL = "/demo/koo-beheshtemoon.mp3";

type Phase = "idle" | "uploading" | "analyzing" | "done" | "error";
const GENRES = ["همه", "پاپ", "فولک", "راک"] as const;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [view, setView] = useState<string | null>(null);
  const [genre, setGenre] = useState<(typeof GENRES)[number]>("همه");
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  /* ── hash-based view switching (single-route sandbox) ── */
  useEffect(() => {
    const apply = () => {
      const h = window.location.hash;
      let v: string | null = null;
      let m: RegExpMatchArray | null;
      if ((m = h.match(/^#\/song\/([\w-]+)$/))) {
        v = getSong(m[1]) ? `song:${m[1]}` : null;
      } else if ((m = h.match(/^#\/post\/([\w-]+)$/))) {
        v = getPost(m[1]) ? `post:${m[1]}` : null;
      } else if ((m = h.match(/^#\/artist\/(.+)$/))) {
        const name = decodeURIComponent(m[1]);
        v = groupByArtist(SONGS).some((g) => g.name === name)
          ? `artist:${name}`
          : null;
      } else if (h === "#/blog") {
        v = "/blog";
      } else if (h === "#/artists") {
        v = "/artists";
      }
      setView(v);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, []);

  useEffect(() => {
    if (view) window.scrollTo({ top: 0 });
  }, [view]);

  /* ── scroll reveal ── */
  useEffect(() => {
    if (phase !== "idle") return;
    const els = document.querySelectorAll(".rv");
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("on"));
      return;
    }
    const io = new IntersectionObserver(
      (es) =>
        es.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("on");
            io.unobserve(e.target);
          }
        }),
      { threshold: 0.08 }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [phase, view, genre]);

  /* ── analyzer flow (unchanged engine) ── */
  const startUpload = useCallback((file: File) => {
    setError("");
    setResult(null);
    setUploadPct(0);
    setPhase("uploading");

    const form = new FormData();
    form.append("file", file);
    const xhr = new XMLHttpRequest();
    xhrRef.current = xhr;
    xhr.timeout = 300_000;

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        const pct = (e.loaded / e.total) * 100;
        setUploadPct(pct);
        if (pct >= 100) setPhase("analyzing");
      }
    });
    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300 && data.ok) {
          setResult(data as AnalysisResult);
          setPhase("done");
        } else {
          setError(data.error || "پردازش ناموفق بود.");
          setPhase("error");
        }
      } catch {
        setError("پاسخ نامعتبر از سرور.");
        setPhase("error");
      }
    });
    xhr.addEventListener("error", () => {
      setError("ارتباط با سرور برقرار نشد.");
      setPhase("error");
    });
    xhr.addEventListener("timeout", () => {
      setError("پردازش بیش از حد طول کشید.");
      setPhase("error");
    });
    xhr.open("POST", "/api/analyze");
    xhr.send(form);
  }, []);

  const handleFile = useCallback(
    (file: File) => {
      setFile(file);
      setFileName(file.name);
      const url = URL.createObjectURL(file);
      setAudioUrl((old) => {
        if (old) URL.revokeObjectURL(old);
        return url;
      });
      startUpload(file);
    },
    [startUpload]
  );

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    setPhase("idle");
  }, []);

  const loadDemo = useCallback(() => {
    setError("");
    setResult(null);
    setUploadPct(0);
    setFile(null);
    setFileName(DEMO_NAME);
    setAudioUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return DEMO_URL;
    });
    setResult(DEMO_SONG);
    setPhase("done");
  }, []);

  const reset = useCallback(() => {
    xhrRef.current?.abort();
    setAudioUrl((old) => {
      if (old) URL.revokeObjectURL(old);
      return "";
    });
    setResult(null);
    setError("");
    setFileName("");
    setFile(null);
    setUploadPct(0);
    setPhase("idle");
  }, []);

  const openSong = useCallback((slug: string) => {
    window.location.hash = `#/song/${slug}`;
  }, []);

  const openPost = useCallback((slug: string) => {
    window.location.hash = `#/post/${slug}`;
  }, []);

  const openArtist = useCallback((name: string) => {
    window.location.hash = `#/artist/${encodeURIComponent(name)}`;
  }, []);

  const goHome = useCallback(() => {
    window.location.hash = "#top";
  }, []);

  const goBlog = useCallback(() => {
    window.location.hash = "#/blog";
  }, []);

  const goArtists = useCallback(() => {
    window.location.hash = "#/artists";
  }, []);

  const featured = getSong(FEATURED_SLUG);
  const filtered = genre === "همه" ? SONGS : SONGS.filter((s) => s.genre === genre);

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── header ── */}
      <header className="sticky top-0 z-40 bg-background/85 backdrop-blur-md border-b">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-4">
          <a href="#top" className="flex items-center gap-2.5 shrink-0">
            { }
            <img src="/emblem.png" alt="لوگوی گیتار کینگ" className="w-8 h-auto" />
            <span className="font-display font-bold text-lg tracking-wide">
              Guitar King
            </span>
          </a>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
            <NavLink href="#archive">اکوردها</NavLink>
            <NavLink href="#featured">اکورد ویژه</NavLink>
            <NavLink href="#/artists">خواننده‌ها</NavLink>
            <NavLink href="#/blog">وبلاگ</NavLink>
            <NavLink href="#bot">ربات</NavLink>
          </nav>
          <a href="#bot" className="shrink-0">
            <Button size="sm" className="rounded-full gap-1.5">
              <Music2 className="w-4 h-4" aria-hidden />
              آپلود آهنگ
            </Button>
          </a>
        </div>
      </header>

      <main className="flex-1">
        {/* ── analyzer states (replace page content) ── */}
        {(phase === "uploading" || phase === "analyzing") && (
          <div className="py-14">
            <AnalyzingView
              fileName={fileName}
              uploadPct={uploadPct}
              phase={phase}
              onCancel={cancel}
            />
          </div>
        )}

        {phase === "done" && result && (
          <div className="py-10">
            <ResultsView
              result={result}
              audioUrl={audioUrl}
              fileName={fileName}
              onReset={reset}
            />
          </div>
        )}

        {phase === "error" && (
          <div className="w-full max-w-xl mx-auto py-14 px-4">
            <div className="rounded-2xl border border-destructive/40 bg-card p-8 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center mb-4">
                <TriangleAlert className="w-7 h-7 text-destructive" aria-hidden />
              </div>
              <h2 className="text-lg font-extrabold mb-2">تحلیل ناموفق بود</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-7">{error}</p>
              <div className="flex justify-center gap-2">
                {file && (
                  <Button onClick={() => startUpload(file)}>تلاش دوباره</Button>
                )}
                <Button variant="outline" onClick={reset}>
                  انتخاب فایل دیگر
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* ── song article view ── */}
        {phase === "idle" && view?.startsWith("song:") && (() => {
          const song = getSong(view.slice(5));
          return song ? (
            <SongSheet
              song={song}
              onBack={() => {
                window.location.hash = "#archive";
              }}
              onPlayDemo={loadDemo}
            />
          ) : null;
        })()}

        {/* ── blog views ── */}
        {phase === "idle" && view === "/blog" && (
          <BlogView onOpen={openPost} onBack={goHome} />
        )}
        {phase === "idle" && view?.startsWith("post:") && (() => {
          const post = getPost(view.slice(5));
          return post ? <PostView post={post} onBack={goBlog} /> : null;
        })()}

        {/* ── artist views ── */}
        {phase === "idle" && view === "/artists" && (
          <ArtistsView
            songs={SONGS}
            onOpenArtist={openArtist}
            onOpenSong={openSong}
            onBack={goHome}
          />
        )}
        {phase === "idle" && view?.startsWith("artist:") && (() => {
          const name = decodeURIComponent(view.slice(7));
          const group = groupByArtist(SONGS).find((g) => g.name === name);
          return group ? (
            <ArtistView group={group} onOpenSong={openSong} onBack={goArtists} />
          ) : null;
        })()}

        {/* ── home ── */}
        {phase === "idle" && !view && (
          <>
            {/* hero */}
            <section id="top" className="relative overflow-hidden">
              <div
                aria-hidden
                className="absolute inset-x-0 top-0 h-80 pointer-events-none"
                style={{
                  background:
                    "radial-gradient(ellipse at 50% 0%, oklch(0.545 0.212 26 / 0.09), transparent 65%)",
                }}
              />
              <div className="max-w-4xl mx-auto px-4 pt-14 pb-16 text-center relative">
                <p className="inline-flex items-center gap-3 text-xs font-medium text-[oklch(0.617_0.093_62)]">
                  <i className="w-1.5 h-1.5 bg-primary rotate-45 inline-block" aria-hidden />
                  آرشیو اکورد گیتار · ربات اکوردنویس آنلاین
                  <i className="w-1.5 h-1.5 bg-primary rotate-45 inline-block" aria-hidden />
                </p>
                { }
                <div className="relative mx-auto mt-8 flex h-56 w-full items-center justify-center sm:h-64">
                  {/* rotating light rays */}
                  <div
                    aria-hidden
                    className="absolute left-1/2 top-1/2 h-[440px] w-[440px] -translate-x-1/2 -translate-y-1/2 sm:h-[500px] sm:w-[500px]"
                  >
                    <div className="gk-rays absolute inset-0 rounded-full" />
                  </div>
                  {/* guitar strings behind the emblem */}
                  <div
                    aria-hidden
                    className="absolute left-1/2 top-1/2 w-[min(640px,88vw)] -translate-x-1/2 -translate-y-1/2"
                  >
                    <div className="flex h-14 flex-col justify-between">
                      <i className="gk-string h-px opacity-45" />
                      <i className="gk-string h-px opacity-55" />
                      <i className="gk-string h-[1.5px] opacity-65" />
                      <i className="gk-string h-[1.5px] opacity-75" />
                      <i className="gk-string h-0.5 opacity-85" />
                      <i className="gk-string h-0.5" />
                    </div>
                  </div>
                  {/* emblem inside its seal rings */}
                  <div className="gk-float relative z-10">
                    <div
                      aria-hidden
                      className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full sm:h-56 sm:w-56"
                      style={{
                        background:
                          "radial-gradient(circle, oklch(0.995 0.002 85 / 0.9) 52%, transparent 74%)",
                      }}
                    />
                    <div
                      aria-hidden
                      className="absolute left-1/2 top-1/2 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full border border-foreground/20 sm:h-56 sm:w-56"
                    />
                    <div
                      aria-hidden
                      className="gk-spin-slow absolute left-1/2 top-1/2 h-[172px] w-[172px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-[oklch(0.617_0.093_62/0.55)] sm:h-[204px] sm:w-[204px]"
                    />
                    <img
                      src="/emblem.png"
                      alt="نشان گیتار کینگ: تاج و گیتار"
                      className="relative h-auto w-36 drop-shadow-[0_18px_28px_oklch(0.235_0.012_60/0.25)] sm:w-44"
                    />
                  </div>
                </div>
                <h1 className="font-display font-black text-[clamp(44px,9vw,84px)] leading-[1.15] mt-4">
                  Guitar King
                </h1>
                <p className="font-fantasy text-2xl sm:text-3xl text-primary mt-2">
                  پادشاهِ اکوردها در دستان تو
                </p>
                <p className="text-muted-foreground max-w-xl mx-auto mt-4 leading-8">
                  اکورد آهنگ‌های تازه را با پوستر و برگه‌ی کامل بخوان، گام را همان‌جا
                  عوض کن، یا آهنگ خودت را برای ربات بفرست تا اکورد تک‌تک بخش‌هایش را
                  بنویسد.
                </p>
                <div className="flex flex-wrap gap-3 justify-center mt-8">
                  <a href="#archive">
                    <Button size="lg" className="rounded-full px-8">
                      دیدن اکوردها
                    </Button>
                  </a>
                  <a href="#bot">
                    <Button
                      size="lg"
                      variant="outline"
                      className="rounded-full px-8 border-foreground/30"
                    >
                      آپلود آهنگ برای ربات
                    </Button>
                  </a>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 mt-10 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2">
                    <i className="w-1.5 h-1.5 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
                    {SONGS.length} اکورد در آرشیو
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <i className="w-1.5 h-1.5 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
                    تغییر گام با یک کلیک
                  </span>
                  <span className="inline-flex items-center gap-2">
                    <i className="w-1.5 h-1.5 bg-[oklch(0.617_0.093_62)] rotate-45 inline-block" aria-hidden />
                    رایگان برای گیتاریست‌ها
                  </span>
                </div>
              </div>
            </section>

            <Ornament />

            {/* archive */}
            <section id="archive" className="max-w-6xl mx-auto px-4 pt-14">
              <div className="text-center rv">
                <h2 className="font-fantasy text-3xl sm:text-4xl font-bold">
                  تازه‌ترین اکوردها
                </h2>
                <p className="text-muted-foreground mt-2 max-w-xl mx-auto leading-7">
                  پوستر آهنگ‌هایی که تازه منتشر شده‌اند؛ روی هر کدام بزن تا برگه‌ی
                  کامل اکورد، دیاگرام‌ها و تغییر گام را ببینی.
                </p>
              </div>
              <div className="flex flex-wrap gap-2 justify-center mt-6 rv">
                {GENRES.map((g) => (
                  <button
                    key={g}
                    type="button"
                    onClick={() => setGenre(g)}
                    aria-pressed={genre === g}
                    className={cn(
                      "rounded-full px-5 py-1.5 text-sm border transition-colors",
                      genre === g
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-border bg-card hover:border-primary/50 hover:text-primary"
                    )}
                  >
                    {g}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-8 mt-9">
                {filtered.map((song, i) => (
                  <SongCard
                    key={song.slug}
                    song={song}
                    delay={i * 0.05}
                    onOpen={() => openSong(song.slug)}
                  />
                ))}
              </div>
            </section>

            {/* featured */}
            {featured && (
              <section id="featured" className="max-w-6xl mx-auto px-4 pt-20">
                <div className="text-center rv">
                  <h2 className="font-fantasy text-3xl sm:text-4xl font-bold">
                    اکورد ویژه‌ی این هفته
                  </h2>
                  <p className="text-muted-foreground mt-2 leading-7">
                    برگه‌ای که ربات شنیده و تحریریه چک کرده؛ پیش‌نمایش با تغییر گام زنده.
                  </p>
                </div>
                <FeaturedCard song={featured} onOpen={() => openSong(featured.slug)} />
              </section>
            )}

            {/* blog teaser */}
            <section id="blog" className="max-w-6xl mx-auto px-4 pt-20">
              <div className="text-center rv">
                <h2 className="font-fantasy text-3xl sm:text-4xl font-bold">
                  تازه‌های وبلاگ
                </h2>
                <p className="text-muted-foreground mt-2 max-w-xl mx-auto leading-7">
                  آموزش‌های گیتار، خبرهای سایت و پشت‌صحنه‌ی ربات اکوردنویس.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-x-5 gap-y-8 mt-9">
                {POSTS.slice(0, 3).map((p) => (
                  <PostCard key={p.slug} post={p} onOpen={() => openPost(p.slug)} />
                ))}
              </div>
              <div className="text-center mt-9 rv">
                <a href="#/blog">
                  <Button
                    variant="outline"
                    className="rounded-full px-8 border-foreground/30"
                  >
                    همه‌ی مطالب وبلاگ
                  </Button>
                </a>
              </div>
            </section>

            {/* bot */}
            <section id="bot" className="max-w-6xl mx-auto px-4 pt-20">
              <div className="relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-7 sm:p-12 rv">
                <i aria-hidden className="absolute -right-24 -top-28 w-80 h-80 rounded-full border border-white/20 pointer-events-none" />
                <i aria-hidden className="absolute -left-16 -bottom-20 w-56 h-56 rounded-full border border-dashed border-white/25 pointer-events-none" />
                <div className="grid lg:grid-cols-2 gap-10 items-center relative">
                  <div>
                    <h2 className="font-fantasy text-3xl sm:text-4xl font-bold flex items-center gap-3">
                      <Bot className="w-8 h-8" aria-hidden />
                      آهنگ خودت را بفرست
                    </h2>
                    <p className="mt-3 leading-8 text-primary-foreground/90">
                      ربات اکوردنویس آهنگ تو را می‌شنود، بخش‌بندی می‌کند و برگه‌ی اکورد
                      کامل با کلید و تمپو تحویل می‌دهد — همه‌چیز آنلاین و در چند دقیقه.
                    </p>
                    <div className="flex flex-wrap gap-x-7 gap-y-3 mt-6 text-sm">
                      {["فایل را آپلود کن", "ربات گوش می‌دهد", "برگه‌ی اکورد آماده"].map(
                        (s, i) => (
                          <span key={s} className="inline-flex items-center gap-2">
                            <i className="chord-latin w-6 h-6 rounded-full border border-white/70 flex items-center justify-center text-[11px] font-black">
                              {i + 1}
                            </i>
                            {s}
                          </span>
                        )
                      )}
                    </div>
                    <div className="mt-7 rounded-xl bg-white/10 border border-white/20 p-4 flex items-center gap-3 flex-wrap">
                      <span className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
                        <Music2 className="w-5 h-5" aria-hidden />
                      </span>
                      <span className="text-sm leading-6 flex-1 min-w-40">
                        نمونه‌ی آماده: امین قباد — «کو بهشتمون»
                        <span className="block text-xs text-primary-foreground/70">
                          تحلیل کامل شده توسط ربات؛ بدون آپلود ببین و پخش کن
                        </span>
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={loadDemo}
                        className="bg-transparent text-primary-foreground border-white/60 hover:bg-white hover:text-primary rounded-full"
                      >
                        نمایش آکوردها
                      </Button>
                    </div>
                  </div>
                  <div className="bg-card text-card-foreground rounded-2xl p-4 sm:p-5 shadow-2xl shadow-black/25">
                    <UploadZone onFile={handleFile} />
                  </div>
                </div>
              </div>
            </section>

            {/* roadmap */}
            <section id="roadmap" className="max-w-6xl mx-auto px-4 pt-20">
              <div className="text-center rv">
                <h2 className="font-fantasy text-3xl sm:text-4xl font-bold">نقشه‌ی راه</h2>
                <p className="text-muted-foreground mt-2 leading-7">
                  چه چیزهایی آماده است و چه چیزهایی در راه است.
                </p>
              </div>
              <div className="grid sm:grid-cols-3 gap-5 mt-8">
                {[
                  {
                    icon: CircleCheck,
                    status: "انجام شد",
                    title: "آرشیو اکورد و تغییر گام",
                    desc: "پوستر هر آهنگ، برگه‌ی اکورد کامل، دیاگرام و تغییر گام آنی.",
                    done: true,
                  },
                  {
                    icon: Bot,
                    status: "در جریان",
                    title: "ربات اکوردنویس آنلاین",
                    desc: "آپلود آهنگ و دریافت اکورد تمام بخش‌ها با پخش همگام.",
                    done: false,
                  },
                  {
                    icon: Clock3,
                    status: "به‌زودی",
                    title: "حالت تمرین و اپ موبایل",
                    desc: "اسکرول خودکار، مترونوم و نسخه‌ی موبایل برای روی صحنه.",
                    done: false,
                  },
                ].map((r) => (
                  <div key={r.title} className="rounded-xl border bg-card p-5 rv">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold",
                        r.done
                          ? "bg-primary text-primary-foreground"
                          : "border border-dashed text-muted-foreground"
                      )}
                    >
                      <r.icon className="w-3.5 h-3.5" aria-hidden />
                      {r.status}
                    </span>
                    <h3 className="font-extrabold mt-3">{r.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-7">
                      {r.desc}
                    </p>
                  </div>
                ))}
              </div>
            </section>

            {/* about */}
            <section id="about" className="max-w-3xl mx-auto px-4 pt-20 text-center rv">
              <h2 className="font-fantasy text-3xl sm:text-4xl font-bold">درباره‌ی گیتار کینگ</h2>
              <p className="text-muted-foreground mt-4 leading-8">
                ما برای گیتاریست‌ها اکورد می‌نویسیم. هر آهنگی که منتشر شود، اکوردش را
                با گوشِ ربات و چشمِ تحریریه اینجا پیدا می‌کنی؛ و اگر آهنگ خودت را داری،
                ربات اکوردنویس برایت می‌نویسد. ساده، سریع و همیشه رایگان.
              </p>
            </section>

            {/* footer */}
            <footer className="mt-20 border-t bg-secondary/50">
              <div className="max-w-6xl mx-auto px-4 py-10 grid sm:grid-cols-3 gap-8 text-sm">
                <div>
                  <span className="flex items-center gap-2.5">
                    { }
                    <img src="/emblem.png" alt="" className="w-7 h-auto" aria-hidden />
                    <b className="font-display text-base tracking-wide">Guitar King</b>
                  </span>
                  <p className="text-muted-foreground mt-3 leading-7">
                    مرجع اکورد آهنگ‌ها و ربات اکوردنویس برای جامعه‌ی گیتاریست‌های ایرانی.
                  </p>
                </div>
                <div>
                  <p className="font-bold mb-2.5">بخش‌ها</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    <li><a href="#archive" className="hover:text-primary transition-colors">آرشیو اکوردها</a></li>
                    <li><a href="#featured" className="hover:text-primary transition-colors">اکورد ویژه</a></li>
                    <li><a href="#/artists" className="hover:text-primary transition-colors">فهرست خواننده‌ها</a></li>
                    <li><a href="#/blog" className="hover:text-primary transition-colors">وبلاگ</a></li>
                    <li><a href="#bot" className="hover:text-primary transition-colors">ربات اکوردنویس</a></li>
                    <li><a href="#about" className="hover:text-primary transition-colors">درباره‌ی ما</a></li>
                  </ul>
                </div>
                <div>
                  <p className="font-bold mb-2.5">سبک‌ها</p>
                  <ul className="space-y-1.5 text-muted-foreground">
                    {["پاپ", "فولک", "راک"].map((g) => (
                      <li key={g}>
                        <a
                          href="#archive"
                          onClick={() => setGenre(g as (typeof GENRES)[number])}
                          className="hover:text-primary transition-colors"
                        >
                          اکوردهای {g}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              <div
                aria-hidden
                className="font-display font-black text-center text-[15vw] leading-[0.9] select-none text-transparent overflow-hidden [-webkit-text-stroke:1.2px_oklch(0.617_0.093_62/0.38)]"
              >
                Guitar King
              </div>
              <div className="border-t">
                <div className="max-w-6xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
                  <p className="flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden />
                    حقوق آهنگ‌ها و پوسترها متعلق به صاحبان آن‌هاست.
                  </p>
                  <a
                    href="https://github.com/pvwvuow/guitarking"
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-foreground transition-colors chord-latin"
                  >
                    github.com/pvwvuow/guitarking
                  </a>
                </div>
              </div>
            </footer>
          </>
        )}
      </main>
    </div>
  );
}

/* ── small components ─────────────────────────────────────────────────── */

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      className="relative hover:text-primary transition-colors after:absolute after:-bottom-2 after:right-1/2 after:translate-x-1/2 after:w-1.5 after:h-1.5 after:bg-primary after:rotate-45 after:scale-0 hover:after:scale-100 after:transition-transform"
    >
      {children}
    </a>
  );
}

function Poster({ song, className }: { song: SongEntry; className?: string }) {
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
        <span className="font-fantasy text-5xl text-white/95">{song.title.slice(0, 1)}</span>
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

function FeaturedCard({ song, onOpen }: { song: SongEntry; onOpen: () => void }) {
  const [semi, setSemi] = useState(0);
  const t = (c: string) => transposeChord(c, semi);
  const key = t(song.key);
  const previewLines = song.sections[1]?.lines ?? song.sections[0].lines;

  return (
    <div className="gk-frame rounded-2xl mt-8 p-6 sm:p-9 grid md:grid-cols-[260px_1fr] gap-8 items-center rv">
      <div className="relative mx-auto w-56 md:w-full">
        <div className="gk-frame rounded-xl overflow-hidden">
          <Poster song={song} className="w-full aspect-square object-cover" />
        </div>
      </div>
      <div>
        <p className="inline-flex items-center gap-2 font-display text-[11px] tracking-[0.35em] text-[oklch(0.617_0.093_62)]">
          <Sparkles className="w-3.5 h-3.5" aria-hidden />
          CHORD OF THE WEEK
        </p>
        <h3 className="font-fantasy text-3xl font-bold mt-1.5">{song.title}</h3>
        <div className="flex flex-wrap gap-2 mt-3 text-xs">
          {[song.artist, `کلید ${key}`, song.tempo ? `تمپو ${song.tempo}` : null, song.source === "bot" ? "تحلیل ربات" : "برگه‌ی تحریریه"]
            .filter(Boolean)
            .map((c) => (
              <span key={c as string} className="rounded-full border border-border bg-card px-3 py-1 text-muted-foreground">
                {c}
              </span>
            ))}
        </div>
        <div className="mt-4 space-y-2.5" dir="rtl">
          {previewLines.map((line, li) => (
            <div key={li} className="flex flex-wrap gap-x-7 gap-y-2">
              {line.map((seg, si) => (
                <span key={si} className="inline-flex flex-col">
                  <b className="chord-latin text-base font-black text-primary leading-5">
                    {t(seg.chord)}
                  </b>
                  <span className="text-sm text-foreground/85 leading-6">{seg.text}</span>
                </span>
              ))}
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3 mt-5">
          <div className="flex items-center gap-1.5" dir="ltr">
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8"
              aria-label="گام پایین"
              onClick={() => setSemi((s) => Math.max(s - 1, -6))}
            >
              −
            </Button>
            <span className="chord-latin font-black text-primary w-14 text-center">{key}</span>
            <Button
              size="icon"
              variant="outline"
              className="w-8 h-8"
              aria-label="گام بالا"
              onClick={() => setSemi((s) => Math.min(s + 1, 6))}
            >
              +
            </Button>
          </div>
          {semi !== 0 && (
            <button
              type="button"
              onClick={() => setSemi(0)}
              className="text-xs text-muted-foreground hover:text-primary"
            >
              بازگشت به گام اصلی
            </button>
          )}
          <Button size="sm" className="rounded-full ms-auto" onClick={onOpen}>
            دیدن برگه‌ی کامل
          </Button>
        </div>
      </div>
    </div>
  );
}
