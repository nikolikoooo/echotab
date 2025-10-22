"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useCallback } from "react";

function TabLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const active =
    href === "/"
      ? pathname === "/" || pathname === "/today"
      : pathname.startsWith(href);

  return (
    <Link
      href={href}
      className={`rounded-md px-3 py-1.5 text-sm transition
        ${active ? "bg-white/10 text-white" : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"}`}
    >
      {children}
    </Link>
  );
}

export default function Header() {
  const onSignOut = useCallback(async () => {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }, []);

  return (
    <header className="sticky top-0 z-40 border-b border-zinc-800/70 bg-black/70 backdrop-blur supports-[backdrop-filter]:bg-black/40">
      <div className="max-w-3xl mx-auto flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <Link
            href="/"
            className="font-semibold tracking-tight text-white/90 hover:text-white"
            aria-label="EchoTab Home"
          >
            EchoTab
          </Link>

          <nav className="ml-3 flex items-center gap-2">
            <TabLink href="/">Today</TabLink>
            <TabLink href="/reflections">Reflections</TabLink>
          </nav>
        </div>

        <button
          onClick={onSignOut}
          className="text-xs text-zinc-400 hover:text-zinc-200 rounded-md px-2 py-1 border border-transparent hover:border-zinc-700"
        >
          Sign out
        </button>
      </div>
    </header>
  );
}
