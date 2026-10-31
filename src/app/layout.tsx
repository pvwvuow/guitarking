import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "گیتارکینگ | تشخیص هوشمند آکورد آهنگ",
  description:
    "فایل MP3 آهنگ را بده و آکورد تمام بخش‌ها را بگیر: اینترو، ورس، کورس و... به‌همراه کلید و تمپو.",
  keywords: ["گیتار", "آکورد", "chord detection", "guitar", "mp3"],
  icons: {
    icon: "/logo.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fa" dir="rtl" className="dark" suppressHydrationWarning>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css"
        />
      </head>
      <body className="antialiased bg-background text-foreground min-h-screen">
        {children}
        <Toaster />
      </body>
    </html>
  );
}
