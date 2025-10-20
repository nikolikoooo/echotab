"use client";

import { useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Decide redirect at runtime via env; works in dev + prod
  const siteUrl = useMemo(() => {
    // Prefer env (set to http://localhost:3000 in dev, Vercel URL in prod)
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, "");
    // Fallback to current origin if env missing (still works)
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3000";
  }, []);

  const redirectTo = `${siteUrl}/auth/callback`;

  async function sendMagic() {
    if (!email) return;
    setSending(true);
    try {
      await supabaseBrowser.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: redirectTo,
        },
      });
      alert("Check your email for the magic link.");
    } catch {
      alert("Failed to send link. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="max-w-sm mx-auto pt-20">
      <h1 className="text-2xl font-semibold mb-2">EchoTab</h1>
      <p className="text-sm text-zinc-400 mb-4">Sign in with a magic link</p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-800 p-3"
          onKeyDown={(e) => e.key === "Enter" && void sendMagic()}
        />
        <button
          onClick={() => void sendMagic()}
          disabled={sending || !email}
          className={`rounded-md px-4 ${
            sending || !email ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {sending ? "Sending…" : "Send magic link"}
        </button>
      </div>

      {/* Debug hint for you (safe to keep or remove) */}
      <p className="mt-3 text-xs text-zinc-500">
        Redirect target: <span className="text-zinc-300">{redirectTo}</span>
      </p>
    </main>
  );
}
