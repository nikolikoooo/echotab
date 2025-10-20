"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  async function sendMagic() {
    if (!email) return;
    setSending(true);
    try {
      await supabaseBrowser.auth.signInWithOtp({
        email,
        options: {
          // Always point magic link to our server callback (works in dev + prod)
          emailRedirectTo: `${window.location.origin}/auth/callback`,
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
    </main>
  );
}
