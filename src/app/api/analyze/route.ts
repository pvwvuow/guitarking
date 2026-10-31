import { NextRequest, NextResponse } from "next/server";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import path from "path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ALLOWED_EXT = new Set([
  ".mp3", ".wav", ".m4a", ".ogg", ".oga", ".flac", ".aac", ".mp4", ".webm",
]);
const MAX_SIZE = 30 * 1024 * 1024; // 30 MB
const PY_TIMEOUT_MS = 280_000;

function runPythonEngine(audioPath: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const script = path.join(process.cwd(), "python", "chord_detect.py");
    const pythonBin = process.env.GK_PYTHON || "python3";
    const proc = spawn(pythonBin, [script, audioPath], {
      env: { ...process.env, PYTHONIOENCODING: "utf-8" },
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error("پردازش بیش از حد طول کشید. فایل کوتاه‌تری امتحان کن."));
    }, PY_TIMEOUT_MS);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });
    proc.on("error", (e) => {
      clearTimeout(timer);
      reject(new Error(`اجر موتور پردازش ممکن نشد: ${e.message}`));
    });
    proc.on("close", (code) => {
      clearTimeout(timer);
      if (stdout.trim()) {
        resolve(stdout);
      } else if (code === 127) {
        reject(new Error("پایتون روی سرور یافت نشد. راهنمای نصب را در README ببین."));
      } else {
        reject(new Error(stderr.trim().slice(-300) || `پردازش شکست خورد (کد ${code}).`));
      }
    });
  });
}

export async function POST(req: NextRequest) {
  let dir: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(
        { ok: false, error: "فایلی ارسال نشده است." },
        { status: 400 }
      );
    }
    if (file.size === 0) {
      return NextResponse.json(
        { ok: false, error: "فایل خالی است." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { ok: false, error: "حجم فایل بیش از ۳۰ مگابایت است." },
        { status: 413 }
      );
    }
    const ext = path.extname(file.name || "").toLowerCase();
    if (!ALLOWED_EXT.has(ext)) {
      return NextResponse.json(
        { ok: false, error: "فرمت پشتیبانی نمی‌شود. از MP3، WAV، M4A، OGG یا FLAC استفاده کن." },
        { status: 415 }
      );
    }

    dir = await mkdtemp(path.join(tmpdir(), "guitarking-"));
    const audioPath = path.join(dir, `input${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(audioPath, buffer);

    const stdout = await runPythonEngine(audioPath);

    let parsed: unknown;
    try {
      parsed = JSON.parse(stdout);
    } catch {
      throw new Error("خروجی نامعتبر از موتور پردازش.");
    }
    const result = parsed as { ok?: boolean; error?: string };
    if (!result.ok) {
      return NextResponse.json(result, { status: 422 });
    }
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "خطای ناشناخته در پردازش.";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  } finally {
    if (dir) {
      await rm(dir, { recursive: true, force: true }).catch(() => {});
    }
  }
}
