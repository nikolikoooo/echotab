"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Entry = { id: string; content: string; created_at: string };
type SessionShape = { access_token: string };

/** Type guards for safe JSON handling */
function hasMessage(o: unknown): o is { message: string } {
  return typeof o === "object" && o !== null && "message" in o && typeof (o as { message: unknown }).message === "string";
}
function hasError(o: unknown): o is { error: string } {
  return typeof o === "object" && o !== null && "error" in o && typeof (o as { error: unknown }).error === "string";
}

export default function Home() {
  const [session, setSession] = useState<SessionShape | null>(null);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  // --- bootstrap session + load entries ---
  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession({ access_token: data.session.access_token });
      await loadEntries();
    })();
  }, []);

  async function loadEntries() {
    setLoading(true);
    const { data, error } = await supabaseBrowser
      .from("entries")
      .select("id, content, created_at")
      .order("created_at", { ascending: false })
      .limit(50);

    if (!error) setEntries((data as Entry[]) || []);
    setLoading(false);
  }

  // --- add a daily entry ---
  async function send() {
    if (!text.trim() || !session) return;
    setBusy(true);
    try {
      const res = await fetch("/api/echo", {
        method: "POST",
        headers: { "sb-access-token": session.access_token },
        body: JSON.stringify({ text }),
      });

      let j: unknown = {};
      try {
        j = await res.json();
      } catch {
        /* ignore */
      }

      if (hasMessage(j)) {
        alert(j.message);
      } else if (res.ok) {
        alert("Saved.");
      } else {
        alert("Save failed: " + (hasError(j) ? j.error : res.statusText));
      }

      if (res.ok) {
        setText("");
        await loadEntries();
      }
    } catch (e) {
      alert("Save failed: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setBusy(false);
    }
  }

  // --- generate weekly reflection (POST /api/weekly) ---
  async function generateWeekly() {
    if (!session) return;
    setBusy(true);
    try {
      const res = await fetch("/api/weekly", {
        method: "POST",
        headers: { "sb-access-token": session.access_token },
      });

      let j: unknown = {};
      try {
        j = await res.json();
      } catch {
        /* ignore */
      }

      if (hasMessage(j)) {
        alert(j.message);
      } else if (res.ok) {
        alert("Weekly reflection generated. Check Reflections.");
      } else {
        alert("Error generating reflection: " + (hasError(j) ? j.error : res.statusText));
      }
    } catch (e) {
      alert("Error generating reflection: " + (e instanceof Error ? e.message : "Unknown error"));
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await supabaseBrowser.auth.signOut();
    window.location.href = "/login";
  }

  if (!session) return null;

  const remaining = 1000 - text.length;
  const over = remaining < 0;

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8">
      <header className="flex items-center justify-between mb-4">
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-zinc-100 font-medium">EchoTab</Link>
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">Today</Link>
          <Link href="/reflections" className="text-zinc-400 hover:text-zinc-200">Reflections</Link>
        </nav>
        <button onClick={signOut} className="text-xs text-zinc-400 hover:text-zinc-200">
          Sign out
        </button>
      </header>

      {/* input row */}
      <div className="flex gap-2 mb-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="One honest sentence about today…"
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-800 p-3"
          maxLength={1000}
          onKeyDown={(e) => e.key === "Enter" && !busy && !over && send()}
        />
        <button
          onClick={send}
          disabled={busy || !text.trim() || over}
          className={`rounded-md px-4 ${
            busy || !text.trim() || over ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {busy ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="flex items-center justify-between mb-4">
        <p className="text-xs text-zinc-500">Tip: one message a day is enough. I’ll remember.</p>
        <span className={`text-xs ${over ? "text-red-400" : "text-zinc-500"}`}>
          {Math.max(0, remaining)}/1000
        </span>
      </div>

      {/* entries list */}
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

      <div className="mt-6">
        <button
          onClick={generateWeekly}
          disabled={busy}
          className={`rounded-md px-4 py-2 ${
            busy ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"
          }`}
        >
          {busy ? "Working…" : "Generate Weekly Reflection"}
        </button>
      </div>
    </main>
  );
}
