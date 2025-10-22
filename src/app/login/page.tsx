"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function sendMagic() {
    if (!email) return;
    setLoading(true);
    const url = window.location.origin + "/auth/callback";

    const { error } = await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: url },
    });

    setLoading(false);
    if (!error) setSent(true);
    else alert(error.message || "Could not send magic link");
  }

  return (
    <main className="max-w-md mx-auto px-4 pt-16">
      <h1 className="text-3xl font-semibold mb-6">EchoTab</h1>
      <p className="text-zinc-400 mb-4">Sign in with a magic link</p>

      <div className="flex gap-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-800 p-3"
        />
        <button
          onClick={sendMagic}
          disabled={loading}
          className="rounded-md bg-white/10 hover:bg-white/20 px-4"
        >
          {loading ? "Sending…" : "Send magic link"}
        </button>
      </div>

      {sent && (
        <p className="mt-3 text-sm text-emerald-400">
          Link sent — check your email.
        </p>
      )}
    </main>
  );
}
