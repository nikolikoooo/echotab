"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Entry = { id: string; content: string; created_at: string };

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession(data.session);
      await loadEntries();

      // --- Auto-generate weekly reflection if needed ---
      try {
        const sess = await supabaseBrowser.auth.getSession();
        const access = sess.data.session?.access_token;

        function getMondayOfThisWeek(): string {
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1); // Monday
          const monday = new Date(now.setDate(diff));
          monday.setHours(0, 0, 0, 0);
          return monday.toISOString().slice(0, 10);
        }

        const weekStart = getMondayOfThisWeek();
        const { data: existing } = await supabaseBrowser
          .from("reflections")
          .select("week_start")
          .eq("week_start", weekStart)
          .limit(1);

        if (!existing || existing.length === 0) {
          await fetch("/api/weekly", {
            method: "POST",
            headers: access ? { "sb-access-token": access } : {},
          });
        }
      } catch {
        // ignore background errors for MVP
      }
    })();
  }, []);

  async function loadEntries(): Promise<void> {
    const { data, error } = await supabaseBrowser
      .from("entries")
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (!error) setEntries((data as Entry[]) || []);
    setLoading(false);
  }

  async function send(): Promise<void> {
    if (!text.trim() || sending) return;
    setSending(true);
    const sess = await supabaseBrowser.auth.getSession();
    const access = sess.data.session?.access_token;

    const res = await fetch("/api/echo", {
      method: "POST",
      headers: access ? { "sb-access-token": access } : {},
      body: JSON.stringify({ text }),
    });

    if (res.ok) {
      setText("");
      await loadEntries();
    } else {
      const j = await res.json().catch(() => ({} as Record<string, unknown>));
      alert("Save failed: " + (String((j as { error?: string }).error) || res.statusText));
    }
    setSending(false);
  }

  if (!session) return null;

  return (
    <main>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">EchoTab</h1>
        <button
          onClick={async () => {
            await supabaseBrowser.auth.signOut();
            window.location.href = "/login";
          }}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          Sign out
        </button>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Say one honest sentence about today…"
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-800 p-3"
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button
          onClick={() => void send()}
          disabled={sending}
          className="rounded-md bg-white/10 hover:bg-white/20 px-4"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
      <p className="text-xs text-zinc-500 mb-4">Tip: one message a day is enough. I’ll remember.</p>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li key={e.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
              <p className="whitespace-pre-wrap">{e.content}</p>
              <div className="mt-2 text-xs text-zinc-500">{new Date(e.created_at).toLocaleString()}</div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <button
          onClick={async () => {
            const sess = await supabaseBrowser.auth.getSession();
            const access = sess.data.session?.access_token;
            const res = await fetch("/api/weekly", {
              method: "POST",
              headers: access ? { "sb-access-token": access } : {},
            });
            const j = await res.json().catch(() => ({} as Record<string, unknown>));
            if (res.ok) alert("Weekly reflection generated. Check Reflections.");
            else alert("Error: " + (String((j as { error?: string }).error) || res.statusText));
          }}
          className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
        >
          Generate Weekly Reflection
        </button>
      </div>
    </main>
  );
}
