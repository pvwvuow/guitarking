"use client";

import { useEffect, useState } from "react";
import { LoaderCircle, X } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";

interface Props {
  fileName: string;
  uploadPct: number;
  phase: "uploading" | "analyzing";
  onCancel: () => void;
}

const STAGES = [
  "در حال جداسازی صداهای هارمونیک…",
  "استخراج کروماگرام (نقشه‌ی نت‌ها)…",
  "همگام‌سازی تحلیل با ریتم آهنگ…",
  "تطبیق الگوهای آکورد…",
  "تشخیص کلید و گام آهنگ…",
  "بخش‌بندی ساختاری آهنگ…",
  "مجموعه‌سازی برگه‌ی آکورد…",
];

export function AnalyzingView({ fileName, uploadPct, phase, onCancel }: Props) {
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (phase !== "analyzing") return;
    const iv = setInterval(() => setStage((s) => (s + 1) % STAGES.length), 2600);
    const sec = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(iv);
      clearInterval(sec);
    };
  }, [phase]);

  return (
    <div className="w-full max-w-xl mx-auto">
      <div className="rounded-2xl border bg-card p-8 text-center">
        <div className="relative mx-auto w-20 h-20 mb-6">
          <div
            className="gk-pick absolute inset-0 bg-gradient-to-br from-primary to-[oklch(0.42_0.19_26)]"
            style={{ borderRadius: "50% 50% 50% 12%" }}
            aria-hidden
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <LoaderCircle className="w-7 h-7 text-primary-foreground/90 animate-none" aria-hidden />
          </div>
        </div>

        <h2 className="text-xl font-extrabold mb-1">در حال شنیدن آهنگ…</h2>
        <p className="text-sm text-muted-foreground mb-6 chord-latin max-w-full truncate" dir="ltr">
          {fileName}
        </p>

        {phase === "uploading" ? (
          <div className="mb-4">
            <p className="text-sm mb-2">بارگذاری فایل… {Math.round(uploadPct)}٪</p>
            <Progress value={uploadPct} className="h-2" />
          </div>
        ) : (
          <div className="mb-4">
            <div className="flex items-center justify-center gap-2 mb-3 min-h-6">
              <span key={stage} className="text-sm text-foreground/90">
                {STAGES[stage]}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full w-1/3 rounded-full bg-gradient-to-l from-primary to-[oklch(0.62_0.19_30)]"
                style={{ animation: "gk-slide 2.6s ease-in-out infinite" }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-3">
              حدود {elapsed} ثانیه — بسته به طول آهنگ ممکن است تا یک دقیقه طول بکشد.
            </p>
          </div>
        )}

        <Button variant="ghost" size="sm" onClick={onCancel} className="mt-2 text-muted-foreground">
          <X className="w-4 h-4" aria-hidden />
          لغو تحلیل
        </Button>
      </div>

      <style>{`
        @keyframes gk-slide {
          0% { transform: translateX(100%); }
          50% { transform: translateX(0%); }
          100% { transform: translateX(-300%); }
        }
      `}</style>
    </div>
  );
}
