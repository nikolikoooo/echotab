"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Entry = { id: string; content: string; created_at: string };

const MAX_CHARS = 1000;
const CLICK_LOCK_MS = 750;
const ERROR_COOLDOWN_MS = 3500;

export default function Home() {
  const [session, setSession] = useState<Session | null>(null);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [busyWeekly, setBusyWeekly] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 4000);
  }

  useEffect(() => {
    let unsub: (() => void) | undefined;

    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession(data.session);

      const sub = supabaseBrowser.auth.onAuthStateChange((_e, s) => {
        setSession(s ?? null);
      });
      unsub = () => sub.data.subscription.unsubscribe();

      await loadEntries();
    })();

    return () => {
      if (unsub) unsub();
    };
  }, []);

  async function loadEntries() {
    const { data, error } = await supabaseBrowser
      .from("entries")
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error) setEntries((data as Entry[]) || []);
    setLoading(false);
  }

  async function getAuthHeaders(): Promise<HeadersInit | null> {
    const { data } = await supabaseBrowser.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return null;
    return {
      "sb-access-token": token,
      Authorization: `Bearer ${token}`,
    };
  }

  async function send() {
    if (sending) return;

    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > MAX_CHARS) {
      showToast(`Max ${MAX_CHARS} characters. You’re at ${trimmed.length}.`);
      return;
    }

    setSending(true);
    const unlockSoon = () => setTimeout(() => setSending(false), CLICK_LOCK_MS);
    const unlockAfterError = () => setTimeout(() => setSending(false), ERROR_COOLDOWN_MS);

    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        showToast("Please sign in again.");
        unlockSoon();
        return;
      }

      const res = await fetch("/api/echo", {
        method: "POST",
        headers,
        body: JSON.stringify({ text: trimmed }),
      });

      const j = (await res.json().catch(() => ({}))) as { error?: string; message?: string };

      if (res.ok) {
        setText("");
        await loadEntries();
        showToast("Saved. See you tomorrow.");
        unlockSoon();
        return;
      }

      if (res.status === 401) {
        showToast("Please sign in again.");
        unlockSoon();
        return;
      }

      if (res.status === 429) {
        if (j.error === "daily_limit") {
          showToast(j.message || "You’ve already logged today. Come back tomorrow 💛");
        } else {
          showToast(j.message || "Too many requests. Please slow down.");
        }
        unlockAfterError();
        return;
      }

      if (res.status === 413) {
        showToast(`Your entry is too long. Max is ${MAX_CHARS} characters.`);
        unlockSoon();
        return;
      }

      showToast(j.message || "Couldn’t save right now. Please try again.");
      unlockSoon();
    } catch {
      showToast("Network error. Please try again.");
      unlockSoon();
    }
  }

  async function triggerWeekly() {
    if (busyWeekly) return;

    setBusyWeekly(true);
    const unlockSoon = () => setTimeout(() => setBusyWeekly(false), CLICK_LOCK_MS);
    const unlockAfterError = () => setTimeout(() => setBusyWeekly(false), ERROR_COOLDOWN_MS);

    try {
      const headers = await getAuthHeaders();
      if (!headers) {
        showToast("Please sign in again.");
        unlockSoon();
        return;
      }

      const res = await fetch("/api/weekly", { method: "POST", headers });
      const j = (await res.json().catch(() => ({}))) as {
        cached?: boolean;
        message?: string;
        error?: string;
      };

      if (res.ok) {
        showToast(
          j.cached
            ? "Reflection already exists — using the cached one."
            : "Weekly reflection generated. Check Reflections."
        );
        unlockSoon();
        return;
      }

      if (res.status === 401) {
        showToast("Please sign in again.");
        unlockSoon();
        return;
      }

      if (res.status === 429) {
        showToast(j.message || "Please slow down.");
        unlockAfterError();
        return;
      }

      showToast(j.message || "Error generating reflection. Please try again.");
      unlockSoon();
    } catch {
      showToast("Network error. Please try again.");
      unlockSoon();
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
          onKeyDown={(e) => e.key === "Enter" && void send()}
        />
        <button
          onClick={() => void send()}
          disabled={sending || overLimit}
          className={`rounded-md px-4 ${
            sending || overLimit ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {sending ? "Working…" : "Send"}
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
            <li key={e.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-3">
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
          onClick={() => void triggerWeekly()}
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
