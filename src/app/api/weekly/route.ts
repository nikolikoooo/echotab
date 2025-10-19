import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENAI_ENDPOINT = "https://api.openai.com/v1/chat/completions";

function startOfWeekUTC(d = new Date()) {
  // Monday start
  const day = d.getUTCDay(); // 0 Sun..6 Sat
  const diff = (day + 6) % 7;
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  start.setUTCDate(start.getUTCDate() - diff);
  start.setUTCHours(0, 0, 0, 0);
  return start;
}

export async function POST(req: NextRequest) {
  const accessToken = req.headers.get("sb-access-token");
  if (!accessToken) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  const { data: userData, error: uErr } = await sb.auth.getUser(accessToken);
  if (uErr || !userData?.user) return NextResponse.json({ error: "auth failed" }, { status: 401 });

  const weekStart = startOfWeekUTC();
  const fromISO = weekStart.toISOString();
  const to = new Date(weekStart); to.setUTCDate(to.getUTCDate() + 7);
  const toISO = to.toISOString();

  const { data: entries, error: eErr } = await sb
    .from("entries")
    .select("content, created_at")
    .eq("user_id", userData.user.id)
    .gte("created_at", fromISO)
    .lt("created_at", toISO)
    .order("created_at", { ascending: true });

  if (eErr) return NextResponse.json({ error: eErr.message }, { status: 500 });
  if (!entries?.length) return NextResponse.json({ ok: true, note: "no entries this week" });

  const textBlock = entries.map(e => `- (${e.created_at}) ${e.content}`).join("\n");

  // Call OpenAI to summarize
  const body = {
    model: "gpt-4o-mini",
    temperature: 0.2,
    messages: [
      { role: "system", content: "You summarize the user's week empathetically. Output JSON with keys: summary (120-200 words), highlights (array of 3 short quotes), mood_rollup (object with avg_valence -1..1 and top_labels array of 3)." },
      { role: "user", content: `Entries this week:\n${textBlock}` }
    ],
    response_format: { type: "json_object" }
  };

  const r = await fetch(OPENAI_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });
  const j = await r.json();
  let parsed: any = {};
  try { parsed = JSON.parse(j.choices?.[0]?.message?.content || "{}"); } catch {}

  const payload = {
    user_id: userData.user.id,
    week_start: weekStart.toISOString().slice(0,10),
    summary: parsed.summary || "No summary.",
    highlights: parsed.highlights || [],
    mood_rollup: parsed.mood_rollup || null
  };

  const { error: upErr } = await sb.from("reflections").upsert(payload, { onConflict: "user_id,week_start" });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, reflection: payload });
}
