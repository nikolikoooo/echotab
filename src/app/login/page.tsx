"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const EMAIL_KEY = "echotab-email";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);

  // Build redirect target for magic link
  const siteUrl = useMemo(() => {
    const envUrl = process.env.NEXT_PUBLIC_SITE_URL;
    if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, "");
    if (typeof window !== "undefined") return window.location.origin;
    return "http://localhost:3000";
  }, []);
  const redirectTo = `${siteUrl}/auth/callback`;

  // If we already have a session, go home immediately (ignore ?error=auth)
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (data.session) router.replace("/");
    })();
  }, [router]);

  // Handle tokens if Supabase sends the link back to /login
  useEffect(() => {
    (async () => {
      try {
        const url = new URL(window.location.href);

        // A) HASH TOKENS (#access_token=...&refresh_token=...)
        if (url.hash.includes("access_token")) {
          const frag = new URLSearchParams(url.hash.slice(1));
          const access_token = frag.get("access_token") || "";
          const refresh_token = frag.get("refresh_token") || "";
          if (access_token && refresh_token) {
            const { error } = await supabaseBrowser.auth.setSession({ access_token, refresh_token });
            if (!error) {
              router.replace("/");
              return;
            }
          }
        }

        // B) MAGICLINK (?token_hash=...&type=magiclink)
        const token_hash = url.searchParams.get("token_hash");
        const linkType = url.searchParams.get("type");
        if (token_hash && linkType === "magiclink") {
          let storedEmail = localStorage.getItem(EMAIL_KEY) || "";
          if (!storedEmail) {
            const urlEmail = url.searchParams.get("email") || "";
            if (urlEmail) {
              localStorage.setItem(EMAIL_KEY, urlEmail);
              storedEmail = urlEmail;
            }
          }

          const { error } = await supabaseBrowser.auth.verifyOtp({
            type: "magiclink",
            token_hash,
            email: storedEmail,
          });
          if (!error) {
            router.replace("/");
            return;
          }
        }

        // C) PKCE (?code=...) — try exchange; if it fails but a session exists, still go home
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabaseBrowser.auth.exchangeCodeForSession(url.toString());
          if (!error) {
            router.replace("/");
            return;
          }
        }

        // D) If ?error is present but we already have a session, ignore it
        if (url.searchParams.get("error")) {
          const { data } = await supabaseBrowser.auth.getSession();
          if (data.session) {
            router.replace("/");
            return;
          }
        }
      } catch {
        /* ignore — user can still request a new link */
      }
    })();
  }, [router]);

  async function sendMagic() {
    if (!email) return;
    setSending(true);
    try {
      localStorage.setItem(EMAIL_KEY, email);
      await supabaseBrowser.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo },
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

      <p className="mt-3 text-xs text-zinc-500">
        Redirect target: <span className="text-zinc-300">{redirectTo}</span>
      </p>
    </main>
  );
}
