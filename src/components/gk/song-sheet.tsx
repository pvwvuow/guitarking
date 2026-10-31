"use client";

import { useMemo, useState } from "react";
import {
  ArrowRight,
  Bot,
  BookOpen,
  ImageDown,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import type { SongEntry } from "@/lib/songs";
import { songChords } from "@/lib/songs";
import { transposeChord } from "@/lib/transpose";
import { downloadSongSheetImage } from "@/lib/sheet-image";
import { ChordDiagram } from "./chord-diagram";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  song: SongEntry;
  onBack: () => void;
  onPlayDemo?: () => void;
}

const SEG_NOTE =
  "متن‌های داخل برگه برای نمایش چیدمان اکورد نمونه‌سازی شده‌اند و به‌زودی با متن رسمی ترانه جایگزین می‌شوند.";

export function SongSheet({ song, onBack, onPlayDemo }: Props) {
  const [semi, setSemi] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportErr, setExportErr] = useState(false);
  const t = useMemo(() => (c: string) => transposeChord(c, semi), [semi]);
  const currentKey = t(song.key);
  const diagrams = useMemo(() => songChords(song).map(t), [song, t]);

  const handleExport = async () => {
    setExporting(true);
    setExportErr(false);
    try {
      await downloadSongSheetImage(song, semi);
    } catch {
      setExportErr(true);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto px-4 pb-16">
      {/* back */}
      <button
        type="button"
        onClick={onBack}
        className="mt-6 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <ArrowRight className="w-4 h-4" aria-hidden />
        بازگشت به آرشیو اکوردها
      </button>

      {/* header */}
      <div className="mt-5 grid sm:grid-cols-[220px_1fr] gap-6 sm:gap-8 items-start">
        <div className="gk-frame rounded-xl overflow-hidden mx-auto w-52 sm:w-full">
          { }
          <img
            src={song.poster}
            alt={`پوستر ${song.title}`}
            className="w-full aspect-square object-cover"
          />
        </div>
        <div>
          <p className="font-display text-[11px] tracking-[0.35em] text-[oklch(0.617_0.093_62)] mb-1">
            {song.genre.toUpperCase()}
          </p>
          <h1 className="font-fantasy text-4xl sm:text-5xl font-bold leading-snug">
            {song.title}
          </h1>
          <p className="text-lg text-muted-foreground mt-1">{song.artist}</p>

          <div className="flex flex-wrap gap-2 mt-4">
            <Chip>کلید اصلی: <b className="chord-latin">{song.key}</b></Chip>
            {song.tempo && <Chip>تمپو: <b>{song.tempo}</b></Chip>}
            <Chip>سطح: <b>{song.difficulty}</b></Chip>
            {song.source === "bot" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1 text-xs">
                <Bot className="w-3.5 h-3.5" aria-hidden />
                شنیده‌شده توسط ربات
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs text-muted-foreground">
                <BookOpen className="w-3.5 h-3.5" aria-hidden />
                برگه‌ی تحریریه
              </span>
            )}
          </div>

          <p className="text-sm leading-7 text-muted-foreground mt-4">
            {song.description}
          </p>
        </div>
      </div>

      {/* transpose toolbar */}
      <div className="gk-frame rounded-xl mt-8 p-4 sm:px-6 flex flex-wrap items-center gap-3">
        <p className="font-bold text-sm">تغییر گام:</p>
        <div className="flex items-center gap-2" dir="ltr">
          <Button
            size="icon"
            variant="outline"
            aria-label="نیم‌پرده پایین"
            onClick={() => setSemi((s) => Math.max(s - 1, -6))}
          >
            <Minus className="w-4 h-4" aria-hidden />
          </Button>
          <span className="chord-latin text-2xl font-black text-primary w-20 text-center">
            {currentKey}
          </span>
          <Button
            size="icon"
            variant="outline"
            aria-label="نیم‌پرده بالا"
            onClick={() => setSemi((s) => Math.min(s + 1, 6))}
          >
            <Plus className="w-4 h-4" aria-hidden />
          </Button>
        </div>
        {semi !== 0 && (
          <>
            <span className="text-xs bg-secondary rounded-full px-3 py-1 chord-latin">
              {semi > 0 ? `+${semi}` : semi} نیم‌پرده
            </span>
            <button
              type="button"
              onClick={() => setSemi(0)}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden />
              گام اصلی
            </button>
          </>
        )}
        <Button
          size="sm"
          variant="outline"
          onClick={handleExport}
          disabled={exporting}
          className="gap-1.5 sm:ms-auto"
        >
          {exporting ? (
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
          ) : (
            <ImageDown className="w-4 h-4" aria-hidden />
          )}
          {exporting ? "در حال ساخت عکس…" : "خروجی عکس برگه"}
        </Button>
        {exportErr && (
          <p className="text-xs text-destructive w-full">ساخت عکس ناموفق بود؛ دوباره تلاش کنید.</p>
        )}
        <p className="text-[11px] text-muted-foreground w-full sm:w-auto">
          عکس با اکوردهای همین گام ساخته می‌شود — اول گام را عوض کن، بعد خروجی بگیر.
        </p>
      </div>

      {/* chord diagrams */}
      <section className="mt-8">
        <SectionTitle>دیاگرام اکوردهای این برگه</SectionTitle>
        <div className="flex flex-wrap gap-2.5" dir="ltr">
          {diagrams.map((c, i) => (
            <ChordDiagram key={`${c}-${i}`} chord={c} />
          ))}
        </div>
      </section>

      {/* sheet */}
      <section className="mt-10">
        <SectionTitle>برگه‌ی اکورد</SectionTitle>
        <div className="space-y-4">
          {song.sections.map((sec) => (
            <div key={sec.label} className="rounded-xl border bg-card p-5">
              <p className="flex items-center gap-2.5 font-bold mb-3">
                <i className="w-2 h-2 bg-primary rotate-45 inline-block" aria-hidden />
                {sec.label}
              </p>
              <div className="space-y-3">
                {sec.lines.map((line, li) => (
                  <div key={li} className="flex flex-wrap gap-x-8 gap-y-3">
                    {line.map((seg, si) => (
                      <span key={si} className="inline-flex flex-col min-w-14">
                        <b className="chord-latin text-lg font-black text-primary leading-6">
                          {t(seg.chord)}
                        </b>
                        <span className="text-sm leading-6 text-foreground/90">
                          {seg.text}
                        </span>
                      </span>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground mt-3 leading-6">
          {song.source === "bot"
            ? "اکوردها بر پایه‌ی شنیده‌ی ربات گیتارکینگ است. " + SEG_NOTE
            : "اکوردها توسط تحریریه‌ی گیتارکینگ نوشته شده. " + SEG_NOTE}
        </p>
      </section>

      {/* bot analysis card */}
      {song.bot && (
        <section className="mt-10 rounded-xl border border-primary/30 bg-primary/5 p-5 sm:p-6">
          <p className="flex items-center gap-2 font-extrabold">
            <Sparkles className="w-4.5 h-4.5 text-primary" aria-hidden />
            تحلیل خودکار ربات گیتارکینگ
          </p>
          <div className="flex flex-wrap gap-2 mt-3">
            <Chip>مدت: <b className="chord-latin">{song.bot.duration}</b></Chip>
            <Chip>تمپو: <b>{song.bot.tempo}</b></Chip>
            <Chip>کلید: <b className="chord-latin">{song.bot.key}</b></Chip>
            <Chip>اطمینان: <b>{song.bot.confidence}٪</b></Chip>
          </div>
          <div className="mt-4 space-y-2">
            {song.bot.sections.map((bs, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-2.5 rounded-lg border bg-card px-3 py-2"
              >
                <span className="chord-latin w-6 h-6 rounded-md bg-primary text-primary-foreground text-[11px] font-black flex items-center justify-center">
                  {bs.label}
                </span>
                <span className="chord-latin text-xs text-muted-foreground" dir="ltr">
                  {bs.time}
                </span>
                <span className="flex flex-wrap gap-1.5" dir="ltr">
                  {bs.chords.map((c) => (
                    <span
                      key={c}
                      className="chord-latin text-xs font-bold rounded-md bg-secondary px-2 py-0.5 border"
                    >
                      {t(c)}
                    </span>
                  ))}
                </span>
              </div>
            ))}
          </div>
          {onPlayDemo && (
            <Button className="mt-5" onClick={onPlayDemo}>
              پخش و تحلیل کامل این آهنگ
            </Button>
          )}
        </section>
      )}
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground [&_b]:text-foreground">
      {children}
    </span>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-fantasy text-2xl font-bold mb-4">
      <i className="w-2.5 h-2.5 border-2 border-primary rotate-45 inline-block" aria-hidden />
      {children}
    </h2>
  );
}
