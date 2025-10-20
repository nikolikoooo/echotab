"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Who = {
  authed: boolean;
  user_id?: string;
  email?: string;
  source?: string;
  error?: string;
};

export default function AccountPage() {
  const [who, setWho] = useState<Who | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const sess = await supabaseBrowser.auth.getSession();
        const token = sess.data.session?.access_token;
        const res = await fetch("/api/whoami", {
          headers: token ? { "sb-access-token": token } : {},
          credentials: "include",
        });
        const j = (await res.json()) as Who;
        setWho(j);
      } catch {
        setWho({ authed: false, error: "request failed" });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <main className="p-6 text-sm text-zinc-400">Checking session…</main>;

  return (
    <main className="p-6 space-y-3">
      <h1 className="text-xl font-semibold">Account</h1>
      {who?.authed ? (
        <div className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
          <div className="text-sm text-zinc-300">
            <div><span className="text-zinc-400">Email:</span> {who.email}</div>
            <div><span className="text-zinc-400">User ID:</span> {who.user_id}</div>
            <div className="text-xs text-zinc-500 mt-1">via {who.source ?? "header"}</div>
          </div>
        </div>
      ) : (
        <div className="text-sm text-rose-400">Not signed in ({who?.error})</div>
      )}
    </main>
  );
}
