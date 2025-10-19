"use client";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { useEffect, useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);

  useEffect(() => {
    // if already signed in, bounce to home
    supabaseBrowser.auth.getSession().then(({ data }) => {
      if (data.session) window.location.href = "/";
    });
  }, []);

  async function sendMagic() {
    if (!email) return;
    await supabaseBrowser.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: window.location.origin },
    });
    setSent(true);
  }

  return (
    <main className="max-w-sm mx-auto">
      <h1 className="text-2xl font-semibold mb-4">EchoTab</h1>
      <p className="text-sm text-zinc-400 mb-6">Sign in with a magic link</p>
      <input
        type="email"
        placeholder="you@email.com"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="w-full rounded-md bg-zinc-900 border border-zinc-800 p-3 mb-3"
      />
      <button
        onClick={sendMagic}
        className="w-full rounded-md bg-white/10 hover:bg-white/20 px-4 py-2"
      >
        Send magic link
      </button>
      {sent && (
        <p className="text-green-400 text-sm mt-3">
          Link sent — check your email.
        </p>
      )}
    </main>
  );
}
