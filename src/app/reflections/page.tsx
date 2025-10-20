"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type MoodRollup = { avg_valence?: number; top_labels?: string[] } | null;

type Reflection = {
  id: string;
  week_start: string;
  summary: string;
  highlights: string[];
  mood_rollup: MoodRollup;
  created_at?: string | null; // optional if the column exists
};

export default function ReflectionsPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [reflections, setReflections] = useState<Reflection[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabaseBrowser.auth.getSession();
      if (!data.session) {
        window.location.href = "/login";
        return;
      }
      setSession(data.session);
      const { data: r } = await supabaseBrowser
        .from("reflections")
        .select("*")
        .order("week_start", { ascending: false });

      setReflections((r as Reflection[]) || []);
      setLoading(false);
    })();
  }, []);

  if (!session) return null;

  return (
    <main>
      <h2 className="text-xl font-semibold mb-4">Weekly Reflections</h2>
      {loading ? (
        <p className="text-zinc-500 text-sm">Loading…</p>
      ) : reflections.length === 0 ? (
        <p className="text-zinc-500 text-sm">No reflections yet.</p>
      ) : (
        <ul className="space-y-6">
          {reflections.map((r) => {
            const generated =
              r.created_at ? new Date(r.created_at) : new Date(r.week_start);
            return (
              <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
                <div className="flex items-center justify-between text-sm text-zinc-400 mb-2">
                  <span>Week of {new Date(r.week_start).toLocaleDateString()}</span>
                  <span className="text-xs">
                    Generated on {generated.toLocaleDateString()}
                  </span>
                </div>
                <p className="whitespace-pre-wrap leading-7">{r.summary}</p>
                {!!r.highlights?.length && (
                  <ul className="mt-3 text-sm text-zinc-300 list-disc pl-5 space-y-1">
                    {r.highlights.map((h, i) => (
                      <li key={i}>&ldquo;{h}&rdquo;</li>
                    ))}
                  </ul>
                )}
                {r.mood_rollup && (
                  <div className="mt-3 text-xs text-zinc-500">
                    avg mood: {r.mood_rollup.avg_valence?.toFixed(2) ?? "—"} •{" "}
                    {r.mood_rollup.top_labels?.join(", ") || "—"}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
