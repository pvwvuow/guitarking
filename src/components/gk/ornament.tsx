"use client";

export function Ornament({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`flex items-center justify-center gap-4 pt-2 ${className}`}
    >
      <span className="h-px w-28 bg-gradient-to-l from-[oklch(0.617_0.093_62/0.6)] to-transparent" />
      <span className="w-2 h-2 bg-primary rotate-45" />
      <span className="h-px w-28 bg-gradient-to-r from-[oklch(0.617_0.093_62/0.6)] to-transparent" />
    </div>
  );
}
