import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

function getAccessToken(req: NextRequest): string | null {
  const h1 = req.headers.get("sb-access-token");
  if (h1) return h1;
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return null;
}

function weekStartISO(today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day = d.getUTCDay();
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1);
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

type ReflectionRow = {
  id: string;
  summary: string;
  highlights: string[] | null;
  mood_rollup: number | null;
};

type OpenAIChatJSON = {
  choices?: Array<{ message?: { content?: string } }>;
};

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "config", message: "OPENAI_API_KEY missing." },
        { status: 500 }
      );
    }

    const token = getAccessToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "auth failed", message: "Missing access token." },
        { status: 401 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    );

    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json(
        { error: "auth failed", message: "Invalid access token." },
        { status: 401 }
      );
    }
    const userId = userRes.user.id;

    const weekStart = weekStartISO();
    const isDev = process.env.NODE_ENV !== "production";

    // allow forcing regeneration in dev: ?force=1 or header x-dev-force: 1
    const force =
      isDev &&
      (req.nextUrl.searchParams.get("force") === "1" ||
        req.headers.get("x-dev-force") === "1");

    if (!force) {
      const { data: existing, error: rErr } = await supabaseAdmin
        .from("reflections")
        .select("id, summary, highlights, mood_rollup")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (rErr) {
        return NextResponse.json(
          { error: "db_error", message: rErr.message },
          { status: 500 }
        );
      }
      if (existing) {
        return NextResponse.json({
          ok: true,
          cached: true,
          reflection: existing as ReflectionRow,
        });
      }
    }

    // fetch entries for week
    const weekStartDate = new Date(`${weekStart}T00:00:00.000Z`);
    const nextWeek = new Date(weekStartDate);
    nextWeek.setUTCDate(nextWeek.getUTCDate() + 7);

    const { data: entries, error: eErr } = await supabaseAdmin
      .from("entries")
      .select("content, created_at")
      .eq("user_id", userId)
      .gte("created_at", weekStartDate.toISOString())
      .lt("created_at", nextWeek.toISOString())
      .order("created_at", { ascending: true });

    if (eErr) {
      return NextResponse.json({ error: "db_error", message: eErr.message }, { status: 500 });
    }
    if (!entries || entries.length === 0) {
      return NextResponse.json(
        { error: "no_entries", message: "No entries for this week." },
        { status: 400 }
      );
    }

    const userText = entries.map((e) => `- ${e.content}`).join("\n");

    const body = {
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a concise, kind assistant. Summarize the user's week from their one-sentence daily notes. Keep it supportive and ~120–160 words. Provide 2-3 short bullet highlights. Respond in plain text JSON with keys: summary (string), highlights (string[]), avg_mood (float 0..1).",
        },
        { role: "user", content: `Entries this week:\n${userText}` },
      ],
      response_format: { type: "json_object" },
    };

    const aiRes = await fetch(OPENAI_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!aiRes.ok) {
      const txt = await aiRes.text().catch(() => "");
      return NextResponse.json(
        { error: "openai_error", message: txt || aiRes.statusText },
        { status: 500 }
      );
    }

    const aiJson = (await aiRes.json()) as OpenAIChatJSON;
    const content = aiJson.choices?.[0]?.message?.content ?? "{}";

    let parsed: { summary?: string; highlights?: unknown; avg_mood?: unknown } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      // leave parsed as empty object
    }

    const summary =
      typeof parsed.summary === "string" ? parsed.summary : "No summary.";
    const highlights =
      Array.isArray(parsed.highlights)
        ? (parsed.highlights.filter((x) => typeof x === "string") as string[]).slice(0, 5)
        : [];
    const mood =
      typeof parsed.avg_mood === "number" ? parsed.avg_mood : null;

    const payload = {
      user_id: userId,
      week_start: weekStart,
      summary,
      highlights,
      mood_rollup: mood,
    };

    const { data: saved, error: sErr } = await supabaseAdmin
      .from("reflections")
      .upsert(payload, { onConflict: "user_id,week_start" })
      .select("id, summary, highlights, mood_rollup")
      .single();

    if (sErr || !saved) {
      return NextResponse.json(
        { error: "db_error", message: sErr?.message ?? "Save failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, cached: false, reflection: saved as ReflectionRow });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected server error.";
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}
