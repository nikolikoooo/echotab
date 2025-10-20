import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

/* ===================== helpers ===================== */

function getAccessToken(req: NextRequest): string | null {
  const h1 = req.headers.get("sb-access-token");
  if (h1) return h1;
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return null;
}

function weekStartISO(today = new Date()): string {
  const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const day = d.getUTCDay(); // 0..6 (Sun..Sat)
  const diff = d.getUTCDate() - day + (day === 0 ? -6 : 1); // ISO week starts Monday
  d.setUTCDate(diff);
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

function periodYYYYMM(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
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

/* ===================== main ===================== */

export async function POST(req: NextRequest) {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json({ error: "config", message: "Missing OpenAI key in server config." }, { status: 500 });
    }

    const token = getAccessToken(req);
    if (!token) {
      return NextResponse.json({ error: "auth failed", message: "You’re signed out. Please log in and try again." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    );

    // identify user
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "auth failed", message: "Session expired. Please sign in again." }, { status: 401 });
    }
    const userId = userRes.user.id;

    const isDev = process.env.NODE_ENV !== "production";
    const weekStart = weekStartISO();

    // Dev override to force a fresh reflection: ?force=1 or x-dev-force: 1
    const force =
      isDev &&
      (req.nextUrl.searchParams.get("force") === "1" || req.headers.get("x-dev-force") === "1");

    // 1) Try to use cached reflection first (free)
    if (!force) {
      const { data: existing, error: rErr } = await supabaseAdmin
        .from("reflections")
        .select("id, summary, highlights, mood_rollup")
        .eq("user_id", userId)
        .eq("week_start", weekStart)
        .maybeSingle();

      if (rErr) {
        return NextResponse.json({ error: "db_error", message: "Couldn’t load your reflection. Please try again." }, { status: 500 });
      }
      if (existing) {
        return NextResponse.json({
          ok: true,
          cached: true,
          reflection: existing as ReflectionRow,
          message: "You’ve already got this week’s reflection. Take a minute to read it again — growth happens in the rereads."
        });
      }
    }

    // 2) Enforce budget + cooldown (production only)
    const period = periodYYYYMM();
    const MONTHLY_LIMIT = Number(process.env.OPENAI_MONTHLY_REQUESTS ?? "30") || 30;
    const COOLDOWN_SEC = Number(process.env.WEEKLY_COOLDOWN_SECONDS ?? "30") || 30;

    if (!isDev) {
      // read current usage row
      const { data: usage } = await supabaseAdmin
        .from("usage_limits")
        .select("requests, last_weekly_call")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle();

      // cooldown gate
      if (usage?.last_weekly_call) {
        const last = new Date(usage.last_weekly_call).getTime();
        const diffSec = Math.floor((Date.now() - last) / 1000);
        if (diffSec < COOLDOWN_SEC) {
          return NextResponse.json(
            {
              error: "too_many_requests",
              message: `Please wait ${COOLDOWN_SEC - diffSec}s before trying again.`,
            },
            { status: 429 }
          );
        }
      }

      // monthly cap
      if ((usage?.requests ?? 0) >= MONTHLY_LIMIT) {
        return NextResponse.json(
          {
            error: "budget_exceeded",
            message: "You’ve reached this month’s reflection limit. New reflections unlock next month.",
          },
          { status: 429 }
        );
      }
    }

    // 3) Gather entries for the week
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

    if (eErr) return NextResponse.json({ error: "db_error", message: "Couldn’t load your entries for the week." }, { status: 500 });
    if (!entries || entries.length === 0) {
      return NextResponse.json({ error: "no_entries", message: "Add a few daily notes first, then generate your reflection." }, { status: 400 });
    }

    const userText = entries.map((e) => `- ${e.content}`).join("\n");

    // 4) OpenAI call
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
      return NextResponse.json({ error: "openai_error", message: "The reflection couldn’t be generated right now. Please try again." }, { status: 500 });
    }

    const aiJson = (await aiRes.json()) as OpenAIChatJSON;
    const content = aiJson.choices?.[0]?.message?.content ?? "{}";

    // parse model output defensively
    let parsed: { summary?: unknown; highlights?: unknown; avg_mood?: unknown } = {};
    try {
      parsed = JSON.parse(content);
    } catch {
      /* leave as empty */
    }

    const summary = typeof parsed.summary === "string" ? parsed.summary : "No summary.";
    const highlights = Array.isArray(parsed.highlights)
      ? (parsed.highlights.filter((x) => typeof x === "string") as string[]).slice(0, 5)
      : [];
    const mood = typeof parsed.avg_mood === "number" ? parsed.avg_mood : null;

    // 5) Save reflection (upsert by user + week)
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
      return NextResponse.json({ error: "db_error", message: "We couldn’t save your reflection. Please try again." }, { status: 500 });
    }

    // 6) After success, bump monthly usage + stamp cooldown (prod only)
    if (!isDev) {
      const period = periodYYYYMM();
      const { data: usage } = await supabaseAdmin
        .from("usage_limits")
        .select("requests")
        .eq("user_id", userId)
        .eq("period", period)
        .maybeSingle();

      if (usage) {
        await supabaseAdmin
          .from("usage_limits")
          .update({ requests: (usage.requests ?? 0) + 1, last_weekly_call: new Date().toISOString() })
          .eq("user_id", userId)
          .eq("period", period);
      } else {
        await supabaseAdmin
          .from("usage_limits")
          .insert({ user_id: userId, period, requests: 1, last_weekly_call: new Date().toISOString() });
      }
    }

    return NextResponse.json({
      ok: true,
      cached: false,
      reflection: saved as ReflectionRow,
      message: "Weekly reflection created. Take a breath and give it a quick read."
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected server error.";
    return NextResponse.json({ error: "server_error", message: "Something went wrong. Please try again." }, { status: 500 });
  }
}
