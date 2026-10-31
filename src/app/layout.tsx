import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Guitar King | پادشاه اکوردها",
  description:
    "آرشیو اکورد آهنگ‌های تازه برای گیتاریست‌ها + ربات اکوردنویس آنلاین: آهنگت را آپلود کن، اکورد تمام بخش‌ها را با تغییر گام بگیر.",
  keywords: [
    "گیتار",
    "اکورد",
    "آکورد",
    "guitar chords",
    "chord detection",
    "guitar king",
    "گیتارکینگ",
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Gulzar&family=Cinzel+Decorative:wght@400;700;900&display=swap"
        />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
