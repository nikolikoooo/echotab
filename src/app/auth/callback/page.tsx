"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

const EMAIL_KEY = "echotab-email";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        // If a session already exists, go home
        const s0 = await supabaseBrowser.auth.getSession();
        if (s0.data.session) {
          router.replace("/");
          return;
        }

        const url = new URL(window.location.href);

        // 1) HASH TOKENS (#access_token & #refresh_token)
        if (url.hash.includes("access_token")) {
          const frag = new URLSearchParams(url.hash.slice(1));
          const access_token = frag.get("access_token") || "";
          const refresh_token = frag.get("refresh_token") || "";
          if (access_token && refresh_token) {
            const { error } = await supabaseBrowser.auth.setSession({
              access_token,
              refresh_token,
            });
            if (!error) {
              router.replace("/");
              return;
            }
          }
        }

        // 2) MAGICLINK (?token_hash=...&type=magiclink)
        const token_hash = url.searchParams.get("token_hash");
        const linkType = url.searchParams.get("type");
        if (token_hash && linkType === "magiclink") {
          let email = localStorage.getItem(EMAIL_KEY) || "";
          if (!email) {
            const urlEmail = url.searchParams.get("email") || "";
            if (urlEmail) {
              localStorage.setItem(EMAIL_KEY, urlEmail);
              email = urlEmail;
            }
          }

          const { error } = await supabaseBrowser.auth.verifyOtp({
            type: "magiclink",
            token_hash,
            email,
          });
          if (!error) {
            router.replace("/");
            return;
          }
        }

        // 3) PKCE (?code=...)
        const code = url.searchParams.get("code");
        if (code) {
          const { error } = await supabaseBrowser.auth.exchangeCodeForSession(
            url.toString()
          );
          if (!error) {
            router.replace("/");
            return;
          }
        }

        // If session appeared during the above steps, go home
        const s1 = await supabaseBrowser.auth.getSession();
        if (s1.data.session) {
          router.replace("/");
          return;
        }

        router.replace("/login?error=auth");
      } catch {
        router.replace("/login?error=auth");
      }
    })();
  }, [router]);

  return (
    <main className="grid place-items-center min-h-[60vh]">
      <div className="text-sm text-zinc-400">Signing you in…</div>
    </main>
  );
}
