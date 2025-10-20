"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Entry = { id: string; content: string; created_at: string };

const MAX_CHARS = 1000;
const CLICK_LOCK_MS = 750; // small anti-spam delay

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState<string>("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [sending, setSending] = useState<boolean>(false);
  const [busyWeekly, setBusyWeekly] = useState<boolean>(false);
  const [toast, setToast] = useState<string>("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession(data.session);
      await loadEntries();

      // Background: try creating weekly reflection if missing (server has guards)
      try {
        const sess = await supabaseBrowser.auth.getSession();
        const access = sess.data.session?.access_token;

        function getMondayOfThisWeek(): string {
          const now = new Date();
          const day = now.getDay();
          const diff = now.getDate() - day + (day === 0 ? -6 : 1);
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
        /* ignore */
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
    if (sending) return;
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_CHARS) {
      showToast(`Max ${MAX_CHARS} characters. You’re at ${trimmed.length}.`);
      return;
    }

    setSending(true);
    const release = () => setTimeout(() => setSending(false), CLICK_LOCK_MS);

    try {
      const sess = await supabaseBrowser.auth.getSession();
      const access = sess.data.session?.access_token;

      const res = await fetch("/api/echo", {
        method: "POST",
        headers: access ? { "sb-access-token": access } : {},
        body: JSON.stringify({ text: trimmed }),
      });

      // Prefer message from server if present
      const j = (await res.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };

      if (res.ok) {
        setText("");
        await loadEntries();
        showToast("Saved. See you tomorrow.");
        return;
      }

      if (res.status === 429) {
        // Middleware might send { error: "rate_limited" } or { error: "rate_limit" }
        const msg =
          j.message ||
          (j.error && /rate_limit/.test(j.error) ? "Too many requests. Please slow down." : "") ||
          "Please slow down.";
        showToast(msg);
        return;
      }

      if (res.status === 413) {
        showToast(`Your entry is too long. Max is ${MAX_CHARS} characters.`);
        return;
      }

      if (j.error === "daily_limit") {
        showToast("You’ve already logged today. Come back tomorrow 💛");
        return;
      }

      showToast("Save failed. Please try again.");
    } catch {
      showToast("Network error. Please try again.");
    } finally {
      release(); // small unlock delay prevents double-click bursts
    }
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }

  if (!session) return null;

  const overLimit = text.length > MAX_CHARS;

  return (
    <main>
      {/* toast */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 rounded-lg bg-white/10 border border-white/10 px-4 py-2 text-sm text-zinc-100 shadow-lg backdrop-blur">
          {toast}
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">EchoTab</h1>
        <button onClick={signOut} className="text-xs text-zinc-400 hover:text-zinc-200">
          Sign out
        </button>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="One honest sentence about today…"
          className={`flex-1 rounded-md bg-zinc-900 border p-3 ${
            overLimit ? "border-rose-500" : "border-zinc-800"
          }`}
          maxLength={MAX_CHARS}
          onKeyDown={(e) => {
            if (e.key === "Enter") void send();
          }}
        />
        <button
          onClick={() => void send()}
          disabled={sending || overLimit}
          className={`rounded-md px-4 ${
            sending || overLimit ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">Tip: one message a day is enough. I’ll remember.</p>
        <span
          className={`text-xs tabular-nums ${overLimit ? "text-rose-400" : "text-zinc-500"}`}
          title={`Max ${MAX_CHARS} characters`}
        >
          {text.length}/{MAX_CHARS}
        </span>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : (
        <ul className="space-y-3">
          {entries.map((e) => (
            <li
              key={e.id}
              className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
            >
              <p className="whitespace-pre-wrap">{e.content}</p>
              <div className="mt-2 text-xs text-zinc-500">
                {new Date(e.created_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-8">
        <button
          onClick={async () => {
            if (busyWeekly) return;
            setBusyWeekly(true);
            const release = () => setTimeout(() => setBusyWeekly(false), CLICK_LOCK_MS);

            try {
              const sess = await supabaseBrowser.auth.getSession();
              const access = sess.data.session?.access_token;
              const res = await fetch("/api/weekly", {
                method: "POST",
                headers: access ? { "sb-access-token": access } : {},
              });

              const j = (await res.json().catch(() => ({}))) as {
                cached?: boolean;
                message?: string;
                error?: string;
              };

              if (res.ok) {
                if (j.cached) {
                  showToast("Reflection already exists — using the cached one.");
                } else {
                  showToast("Weekly reflection generated. Check Reflections.");
                }
              } else if (res.status === 429) {
                const msg =
                  j.message ||
                  (j.error && /rate_limit/.test(j.error) ? "Too many requests. Please slow down." : "") ||
                  "Please wait before trying again.";
                showToast(msg);
              } else {
                showToast("Error generating reflection. Please try again.");
              }
            } catch {
              showToast("Network error. Please try again.");
            } finally {
              release();
            }
          }}
          disabled={busyWeekly}
          className={`rounded-md px-4 py-2 text-sm ${
            busyWeekly ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {busyWeekly ? "Working…" : "Generate Weekly Reflection"}
        </button>
      </div>
    </main>
  );
}
