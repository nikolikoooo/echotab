"use client";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { motion, AnimatePresence } from "framer-motion";

type Entry = { id: string; content: string; created_at: string };

export default function Home() {
  const [session, setSession] = useState<any>(null);
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

      // --- Auto-generate weekly reflection if needed ---
      try {
        const sess = await supabaseBrowser.auth.getSession();
        const access = sess.data.session?.access_token;

        function getMondayOfThisWeek() {
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
          const res = await fetch("/api/weekly", {
            method: "POST",
            headers: access ? { "sb-access-token": access } : {},
          });
          if (res.ok) console.log("✅ Auto-generated reflection for week", weekStart);
        }
      } catch (err) {
        console.warn("auto reflection error", err);
      }
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
      const j = await res.json().catch(() => ({}));
      alert("Save failed: " + (j.error || res.statusText));
    }
    setSending(false);
  }

  if (!session) return null;

  return (
    <main>
      <div className="mb-4">
        <p className="text-sm text-zinc-400">Say one honest sentence about today. I’ll remember.</p>
      </div>

      <div className="flex gap-2 mb-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="e.g. Felt anxious but proud I went to the gym."
          className="flex-1 rounded-lg bg-zinc-900 border border-zinc-800 p-3"
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
        />
        <button
          onClick={send}
          disabled={sending}
          className={`rounded-lg px-4 ${sending ? "bg-white/5 text-zinc-500" : "bg-white/10 hover:bg-white/20"}`}
        >
          {sending ? "Sending…" : "Send"}
        </button>
      </div>

      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : entries.length === 0 ? (
        <div className="text-sm text-zinc-500 border border-dashed border-zinc-800 rounded-lg p-6">
          No entries yet. Write your first thought above.
        </div>
      ) : (
        <ul className="space-y-3">
          <AnimatePresence>
            {entries.map((e) => (
              <motion.li
                key={e.id}
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -8, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="rounded-lg border border-zinc-800 bg-zinc-900 p-3"
              >
                <p className="whitespace-pre-wrap leading-6">{e.content}</p>
                <div className="mt-2 text-xs text-zinc-500">
                  {new Date(e.created_at).toLocaleString()}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
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
            const j = await res.json().catch(() => ({}));
            if (res.ok) alert("Weekly reflection generated. Check Reflections.");
            else alert("Error: " + (j.error || res.statusText));
          }}
          className="rounded-lg bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
        >
          Generate Weekly Reflection
        </button>
      </div>
    </main>
  );
}
