"use client";

import { useCallback, useRef, useState } from "react";
import { CloudUpload, FileAudio, AudioLines, KeyRound, ListMusic } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

const ALLOWED_EXT = ["mp3", "wav", "m4a", "ogg", "oga", "flac", "aac", "mp4", "webm"];
const MAX_SIZE = 30 * 1024 * 1024;

interface Props {
  onFile: (file: File) => void;
  disabled?: boolean;
}

const FEATURES = [
  {
    icon: ListMusic,
    title: "آکورد هر بخش",
    desc: "آهنگ بخش‌بندی می‌شود و آکورد تک‌تک بخش‌ها با زمان دقیقشان نمایش داده می‌شود.",
  },
  {
    icon: KeyRound,
    title: "کلید و تمپو",
    desc: "گام (ماژور/مینور) و سرعت آهنگ به‌طور خودکار تشخیص داده می‌شود.",
  },
  {
    icon: AudioLines,
    title: "پخش همگام",
    desc: "همان لحظه که آهنگ پخش می‌شود، آکوردِ همین حالا هایلایت می‌شود.",
  },
];

export function UploadZone({ onFile, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const { toast } = useToast();

  const validate = useCallback(
    (f: File): boolean => {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!ALLOWED_EXT.includes(ext)) {
        toast({
          title: "فرمت پشتیبانی نمی‌شود",
          description: "فایل باید MP3، WAV، M4A، OGG یا FLAC باشد.",
          variant: "destructive",
        });
        return false;
      }
      if (f.size === 0) {
        toast({ title: "فایل خالی است", variant: "destructive" });
        return false;
      }
      if (f.size > MAX_SIZE) {
        toast({
          title: "حجم فایل زیاد است",
          description: "حداکثر حجم مجاز ۳۰ مگابایت است.",
          variant: "destructive",
        });
        return false;
      }
      return true;
    },
    [toast]
  );

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const f = e.dataTransfer.files?.[0];
    if (f && validate(f)) onFile(f);
  };

  const handlePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validate(f)) onFile(f);
    e.target.value = "";
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          if (!disabled) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          "w-full rounded-2xl border-2 border-dashed p-8 sm:p-12 text-center transition-all",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          dragOver
            ? "border-primary bg-primary/10 scale-[1.01]"
            : "border-border bg-card/60 hover:border-primary/60 hover:bg-card",
          disabled && "opacity-60 cursor-not-allowed"
        )}
        aria-label="انتخاب فایل صوتی برای تحلیل آکورد"
      >
        <div className="mx-auto w-16 h-16 rounded-full bg-primary/15 flex items-center justify-center mb-5">
          <CloudUpload className="w-8 h-8 text-primary" aria-hidden />
        </div>
        <p className="text-lg font-bold mb-2">فایل صوتی را اینجا رها کن یا کلیک کن</p>
        <p className="text-sm text-muted-foreground mb-1">
          MP3، WAV، M4A، OGG یا FLAC — حداکثر ۳۰ مگابایت
        </p>
        <p className="text-xs text-muted-foreground">
          فایل مستقیم به سرور پردازش می‌شود و هیچ‌جا ذخیره نمی‌ماند.
        </p>
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          accept=".mp3,.wav,.m4a,.ogg,.oga,.flac,.aac,audio/*"
          onChange={handlePick}
          disabled={disabled}
        />
      </button>

      <div className="grid sm:grid-cols-3 gap-3 mt-6">
        {FEATURES.map((f) => (
          <div
            key={f.title}
            className="rounded-xl border bg-card/60 p-4 text-right"
          >
            <div className="w-9 h-9 rounded-lg bg-primary/15 flex items-center justify-center mb-3">
              <f.icon className="w-5 h-5 text-primary" aria-hidden />
            </div>
            <p className="font-bold text-sm mb-1">{f.title}</p>
            <p className="text-xs text-muted-foreground leading-6">{f.desc}</p>
          </div>
        ))}
      </div>

      <p className="flex items-center justify-center gap-2 text-xs text-muted-foreground mt-6">
        <FileAudio className="w-4 h-4" aria-hidden />
        پردازش با تحلیل طیف هارمونیک صدا انجام می‌شود؛ برای نتیجه‌ی بهتر از آهنگ‌های با گیتار یا پیانوی واضح استفاده کن.
      </p>
    </div>
  );
}
