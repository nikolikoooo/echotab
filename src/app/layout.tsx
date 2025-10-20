import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Analytics } from "@vercel/analytics/react";

export const metadata: Metadata = {
  title: "EchoTab",
  description: "One honest sentence a day. I’ll remember.",
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "dark",
  themeColor: "#000000",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-screen bg-black text-zinc-100 antialiased">
        <div className="max-w-3xl mx-auto px-4 py-6">{children}</div>
        <Analytics />
      </body>
    </html>
  );
}
