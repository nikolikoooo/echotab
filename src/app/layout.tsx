import type { Metadata, Viewport } from "next";
import "./globals.css";
import Header from "./components/Header";

export const metadata: Metadata = {
  title: "EchoTab",
  description: "Say one honest sentence a day. I’ll remember.",
};

export const viewport: Viewport = {
  themeColor: "#0a0a0a",
  colorScheme: "dark",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-black text-zinc-200 antialiased">
        <Header />
        <main className="max-w-3xl mx-auto px-4 pt-6 pb-16">{children}</main>
      </body>
    </html>
  );
}
