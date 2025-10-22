"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Reflection = {
  id: string;
  week_start: string;
  summary: string;
  entries: string[];
  avg_mood?: number;
  mood_label?: string;
};

export default function ReflectionsPage() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Reflection[]>([]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const res = await fetch("/api/reflections", { cache: "no-store" });
        if (res.ok) {
          const data: Reflection[] = await res.json();
          if (mounted) setRows(data || []);
        } else {
          console.error("Failed reflections:", await res.text());
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return <p className="text-zinc-500 text-sm">Loading…</p>;
  }

  return (
    <>
      <h1 className="text-2xl font-semibold mb-4">Weekly Reflections</h1>

      {rows.length === 0 ? (
        <div className="text-zinc-400 text-sm">
          No reflections yet. Write a sentence or two on the Today tab, then
          come back after you generate a weekly reflection.
        </div>
      ) : (
        <div className="space-y-4">
          {rows.map((reflection) => (
            <div
              key={reflection.id}
              className="p-6 bg-zinc-900/80 rounded-lg shadow-md border border-zinc-800 transition-opacity duration-500 opacity-0 animate-[fadeIn_0.6s_forwards]"
            >
              <h2 className="text-lg font-semibold mb-2 text-zinc-200">
                Week of{" "}
                {new Date(reflection.week_start).toLocaleDateString()}
              </h2>

              <p className="text-zinc-300 leading-relaxed mb-3">
                {reflection.summary}
              </p>

              {Array.isArray(reflection.entries) && reflection.entries.length > 0 && (
                <ul className="list-disc list-inside text-zinc-400 mb-2">
                  {reflection.entries.map((entry, i) => (
                    <li key={i}>{entry}</li>
                  ))}
                </ul>
              )}

              <p className="text-sm text-zinc-500">
                {typeof reflection.avg_mood === "number" && (
                  <>avg mood: {reflection.avg_mood.toFixed(2)} • </>
                )}
                {reflection.mood_label ?? ""}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="mt-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md bg-white/10 hover:bg-white/20 px-4 py-2 text-sm"
        >
          ← Back to Today
        </Link>
      </div>

      {/* Page-local animation */}
      <style jsx global>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(5px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
