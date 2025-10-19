import "./globals.css";

export const metadata = {
  title: "EchoTab",
  description: "One message a day. A lifetime remembered.",
};

import Header from "@/components/Header";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-gradient-to-b from-zinc-950 via-zinc-950 to-black text-zinc-100 antialiased">
        <div className="max-w-xl mx-auto px-4 py-6">
          <Header />
          <div className="mt-6">{children}</div>
          <footer className="pt-10 text-xs text-zinc-600">© EchoTab</footer>
        </div>
      </body>
    </html>
  );
}
