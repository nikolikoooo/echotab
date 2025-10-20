"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Reflection = {
  id: string;
  week_start: string;
  content: string;
  entries: string[];
  avg_mood: number | null;
};

export default function ReflectionsPage() {
  const [session, setSession] = useState<{ access_token: string } | null>(null);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession({ access_token: data.session.access_token });
      await loadReflections(data.session.access_token);
    })();
  }, []);

  async function loadReflections(token: string) {
    setErrorMsg(null);
    try {
      const res = await fetch("/api/reflections", {
        headers: { "sb-access-token": token },
      });
      let j: unknown = null;
      try {
        j = await res.json();
      } catch {
        // non-JSON (e.g. 404) — treat as error
      }
      if (!res.ok || !Array.isArray(j)) {
        setErrorMsg("Couldn’t load your reflections. Please try again.");
        return;
      }
      setReflections(j as Reflection[]);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  }

  if (!session) return null;

  return (
    <main className="max-w-3xl mx-auto p-4 md:p-8">
      <header className="flex items-center justify-between mb-6">
        <nav className="flex items-center gap-3 text-sm">
          <Link href="/" className="text-zinc-400 hover:text-zinc-200">
            Today
          </Link>
          <span className="text-zinc-100 font-medium">Reflections</span>
        </nav>
        <button
          onClick={async () => {
            await supabaseBrowser.auth.signOut();
            window.location.href = "/login";
          }}
          className="text-xs text-zinc-400 hover:text-zinc-200"
        >
          Sign out
        </button>
      </header>

      <h1 className="text-xl font-semibold mb-4">Weekly Reflections</h1>

      {loading ? (
        <p className="text-zinc-500">Loading...</p>
      ) : errorMsg ? (
        <p className="text-red-400 text-sm">{errorMsg}</p>
      ) : reflections.length === 0 ? (
        <p className="text-zinc-500 text-sm">No reflections yet.</p>
      ) : (
        <div className="space-y-6">
          {reflections.map((r) => (
            <div
              key={r.id}
              className="border border-zinc-800 rounded-2xl bg-zinc-900 p-5"
            >
              <div className="text-sm text-zinc-500 mb-2">
                Week of{" "}
                {new Date(r.week_start).toLocaleDateString(undefined, {
                  year: "numeric",
                  month: "2-digit",
                  day: "2-digit",
                })}
              </div>

              <p className="whitespace-pre-wrap leading-relaxed">{r.content}</p>

              {r.entries?.length > 0 && (
                <ul className="mt-3 pl-4 list-disc text-sm text-zinc-400">
                  {r.entries.map((e, i) => (
                    <li key={i}>
                      &ldquo;{e}&rdquo;
                    </li>
                  ))}
                </ul>
              )}

              {r.avg_mood !== null && (
                <p className="text-xs text-zinc-500 mt-3">
                  avg mood: {r.avg_mood.toFixed(2)}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Back button */}
      <div className="mt-8 flex justify-center">
        <Link
          href="/"
          className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-sm text-zinc-200 transition"
        >
          ← Back to Today
        </Link>
      </div>
    </main>
  );
}
