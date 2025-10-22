"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Entry = { id: string; content: string; created_at: string };

export default function Home() {
  const [session, setSession] = useState<unknown | null>(null);
  const [text, setText] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession(data.session);
      await loadEntries();
    })();
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

  async function send() {
    if (!text.trim()) return;
    setSending(true);
    const sess = await supabaseBrowser.auth.getSession();
    const access = sess.data.session?.access_token;

    const res = await fetch("/api/echo", {
      method: "POST",
      headers: access ? { "sb-access-token": access } : {},
      body: JSON.stringify({ text }),
    });

    setSending(false);

    if (res.ok) {
      setText("");
      await loadEntries();
    } else {
      const j = await res.json().catch(() => ({}));
      alert(j.error || "Save failed");
    }
  }

  if (!session) return null;

  return (
    <>
      <h1 className="sr-only">Today</h1>

      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="One honest sentence about today…"
          maxLength={1000}
          className="flex-1 rounded-md bg-zinc-900 border border-zinc-800 p-3"
        />
        <button
          onClick={send}
          disabled={sending}
          className="rounded-md bg-white/10 hover:bg-white/20 px-4"
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      <div className="text-[11px] text-zinc-500 mb-4 flex items-center justify-between">
        <span>Tip: one message a day is enough. I’ll remember.</span>
        <span>
          {text.length}
          /1000
        </span>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : (
        <>
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

          <div className="mt-6">
            <button
              onClick={async () => {
                const sess = await supabaseBrowser.auth.getSession();
                const access = sess.data.session?.access_token;
                const r = await fetch("/api/weekly", {
                  method: "POST",
                  headers: access ? { "sb-access-token": access } : {},
                });
                const j = await r.json().catch(() => ({}));
                if (r.ok) {
                  alert("Weekly reflection ready — check Reflections.");
                } else {
                  alert(j.error || "Error generating reflection. Please try again.");
                }
              }}
              className="rounded-md bg-white/10 hover:bg-white/20 px-4 py-2"
            >
              Generate Weekly Reflection
            </button>
          </div>
        </>
      )}
    </>
  );
}
