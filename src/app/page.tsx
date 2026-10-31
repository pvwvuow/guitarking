"use client";

import { useCallback, useRef, useState } from "react";
import { Guitar, Music2, TriangleAlert } from "lucide-react";
import type { AnalysisResult } from "@/lib/types";
import { UploadZone } from "@/components/gk/upload-zone";
import { AnalyzingView } from "@/components/gk/analyzing-view";
import { ResultsView } from "@/components/gk/results-view";
import { Button } from "@/components/ui/button";
import demoAnalysis from "@/data/demo-song.json";

const DEMO_SONG = demoAnalysis as unknown as AnalysisResult;
const DEMO_NAME = "Amin Ghobad - Koo Beheshtemoon.mp3";
const DEMO_URL = "/demo/koo-beheshtemoon.mp3";

type Phase = "idle" | "uploading" | "analyzing" | "done" | "error";

export default function Home() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [uploadPct, setUploadPct] = useState(0);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState("");
  const [fileName, setFileName] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

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

  return (
    <div className="min-h-screen flex flex-col">
      {/* header */}
      <header className="border-b bg-card/50">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Guitar className="w-6 h-6 text-amber-950" aria-hidden />
          </div>
          <div>
            <h1 className="text-xl font-black leading-tight">گیتارکینگ</h1>
            <p className="text-xs text-muted-foreground">
              آهنگ بده، آکوردِ تک‌تک بخش‌هاش رو بگیر
            </p>
          </div>
        </div>
      </header>

      {/* main */}
      <main className="flex-1 w-full max-w-5xl mx-auto px-4 py-8 sm:py-12">
        {phase === "idle" && (
          <div className="space-y-8">
            <div className="text-center space-y-2">
              <h2 className="text-2xl sm:text-3xl font-black">
                آکوردهای آهنگت رو خودکار پیدا کن
              </h2>
              <p className="text-muted-foreground text-sm sm:text-base">
                فایل MP3 را بده؛ گیتارکینگ آهنگ را بخش‌بندی می‌کند و آکورد
                هر بخش را با زمان دقیق نشان می‌دهد.
              </p>
            </div>
            <UploadZone onFile={handleFile} />

            {/* featured demo song */}
            <div className="rounded-2xl border bg-card/70 p-4 sm:p-5 flex items-center gap-4">
              <div className="w-12 h-12 shrink-0 rounded-xl bg-gradient-to-br from-rose-400 to-pink-600 flex items-center justify-center shadow-lg shadow-pink-500/20">
                <Music2 className="w-6 h-6 text-white" aria-hidden />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold">
                  نمونه‌ی آماده: امین قباد — «کو بهشتمون»
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  آکوردهای این آهنگ از قبل تحلیل شده؛ بدون آپلود همین‌جا ببین و پخش کن
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={loadDemo}>
                نمایش آکوردها
              </Button>
            </div>
          </div>
        )}

        {(phase === "uploading" || phase === "analyzing") && (
          <AnalyzingView
            fileName={fileName}
            uploadPct={uploadPct}
            phase={phase}
            onCancel={cancel}
          />
        )}

        {phase === "done" && result && (
          <ResultsView
            result={result}
            audioUrl={audioUrl}
            fileName={fileName}
            onReset={reset}
          />
        )}

        {phase === "error" && (
          <div className="w-full max-w-xl mx-auto">
            <div className="rounded-2xl border border-destructive/40 bg-card p-8 text-center">
              <div className="mx-auto w-14 h-14 rounded-full bg-destructive/15 flex items-center justify-center mb-4">
                <TriangleAlert className="w-7 h-7 text-destructive" aria-hidden />
              </div>
              <h2 className="text-lg font-extrabold mb-2">تحلیل ناموفق بود</h2>
              <p className="text-sm text-muted-foreground mb-6 leading-7">{error}</p>
              <div className="flex justify-center gap-2">
                {file && (
                  <Button onClick={() => startUpload(file)}>
                    تلاش دوباره
                  </Button>
                )}
                <Button variant="outline" onClick={reset}>
                  انتخاب فایل دیگر
                </Button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* footer (sticks to bottom, pushed down naturally on overflow) */}
      <footer className="mt-auto border-t bg-card/50 pb-[env(safe-area-inset-bottom)]">
        <div className="max-w-5xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-muted-foreground">
          <p>
            گیتارکینگ — تشخیص آکورد با پردازش سیگنال صدا (librosa + Viterbi)
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
      </footer>
    </div>
  );
}
