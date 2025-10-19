"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function Header() {
  const pathname = usePathname();
  const link = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <Link
        href={href}
        className={`px-3 py-1.5 rounded-md text-sm ${
          active
            ? "bg-white/10 text-white"
            : "text-zinc-400 hover:text-zinc-200 hover:bg-white/5"
        }`}
      >
        {label}
      </Link>
    );
  };

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <header className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className="h-7 w-7 rounded-lg bg-white/10 grid place-items-center">
          <span className="text-xs">ET</span>
        </div>
        <h1 className="text-lg font-semibold tracking-tight">EchoTab</h1>
      </div>
      <nav className="flex items-center gap-2">
        {link("/", "Today")}
        {link("/reflections", "Reflections")}
        <button
          onClick={signOut}
          className="ml-2 inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm text-zinc-400 hover:text-zinc-100 hover:bg-white/5"
          title="Sign out"
        >
          <LogOut size={16} />
          <span className="hidden sm:inline">Sign out</span>
        </button>
      </nav>
    </header>
  );
}
