import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Build a Supabase server client that reads the session from cookies (read-only) */
async function supabaseFromCookies() {
  const cookieStore = await cookies(); // Next 15 route handlers -> Promise<ReadonlyRequestCookies>
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
      },
    }
  );
}

function startOfWeekUTCString(d = new Date()): string {
  const x = new Date(d);
  const day = x.getUTCDay(); // 0=Sun
  x.setUTCDate(x.getUTCDate() - day);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString().slice(0, 10); // YYYY-MM-DD
}

function sevenDaysAgoUTCISO(): string {
  const x = new Date();
  x.setUTCDate(x.getUTCDate() - 7);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

type ReflectionRow = {
  id: string;
  user_id: string;
  week_start: string;
  summary: string | null;
  highlights: string[] | null;
  mood_rollup: Record<string, unknown> | null;
  generated_at: string | null;
};

export async function POST(_req: NextRequest) {
  const supabase = await supabaseFromCookies();

  const {
    data: { session },
    error: sessErr,
  } = await supabase.auth.getSession();

  if (sessErr || !session) {
    return NextResponse.json(
      { error: "auth_failed", message: "Missing session" },
      { status: 401 }
    );
  }

  const userId = session.user.id;
  const week = startOfWeekUTCString();

  // A) If this week's reflection already exists, return it (idempotent)
  {
    const { data: existing } = await supabase
      .from("reflections")
      .select("*")
      .eq("user_id", userId)
      .eq("week_start", week)
      .maybeSingle<ReflectionRow>();

    if (existing) {
      return NextResponse.json(
        {
          ok: true,
          cached: true,
          message:
            "You already have this week’s reflection — showing the saved one.",
          reflection: existing,
        },
        { status: 200 }
      );
    }
  }

  // B) 24h cooldown since latest reflection
  {
    const { data: last } = await supabase
      .from("reflections")
      .select("generated_at")
      .eq("user_id", userId)
      .order("generated_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ generated_at: string }>();

    if (last?.generated_at) {
      const hours = (Date.now() - new Date(last.generated_at).getTime()) / 36e5;
      if (hours < 24) {
        const remaining = Math.ceil(24 - hours);
        return NextResponse.json(
          {
            error: "cooldown",
            message: `Reflection recently created — try again in ~${remaining}h.`,
          },
          { status: 429 }
        );
      }
    }
  }

  // C) Collect last 7 days of entries
  const { data: entries, error: entriesErr } = await supabase
    .from("entries")
    .select("content, created_at")
    .eq("user_id", userId)
    .gt("created_at", sevenDaysAgoUTCISO())
    .order("created_at", { ascending: true });

  if (entriesErr) {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }
  if (!entries || entries.length === 0) {
    return NextResponse.json({ error: "no_entries" }, { status: 400 });
  }

  const userText = entries
    .map(
      (e: { content: string; created_at: string }) =>
        `- (${new Date(e.created_at).toLocaleDateString()}): ${e.content}`
    )
    .join("\n");

  // D) Call OpenAI (use cost-effective default)
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
  const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "You are a calm, encouraging weekly reflection coach. Summarize the week in a short, kind paragraph; then list 2–4 specific bullet ‘highlights’; end with an overall mood label like ‘steady’, ‘upbeat’, or ‘tired’.",
        },
        { role: "user", content: `Entries this week:\n${userText}` },
      ],
    }),
  });

  if (!aiRes.ok) {
    const t = await aiRes.text().catch(() => "");
    return NextResponse.json(
      { error: "ai_failed", details: t.slice(0, 300) },
      { status: 502 }
    );
  }

  const aiJson = (await aiRes.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const summary =
    aiJson?.choices?.[0]?.message?.content?.trim() ?? "No summary.";

  const moodLabel = summary.toLowerCase().includes("tired")
    ? "tired"
    : summary.toLowerCase().includes("joy") ||
      summary.toLowerCase().includes("playful")
    ? "upbeat"
    : "steady";

  // E) Insert (DB must have UNIQUE (user_id, week_start))
  const insert = await supabase
    .from("reflections")
    .insert({
      user_id: userId,
      week_start: week,
      summary,
      highlights: [],
      mood_rollup: { label: moodLabel },
      generated_at: new Date().toISOString(),
    })
    .select()
    .maybeSingle<ReflectionRow>();

  if (insert.error) {
    // If duplicate (race), fetch and return cached
    const duplicate =
      /duplicate key/i.test(insert.error.message) ||
      (insert.error as unknown as { code?: string }).code === "23505";

    if (duplicate) {
      const { data: existing } = await supabase
        .from("reflections")
        .select("*")
        .eq("user_id", userId)
        .eq("week_start", week)
        .maybeSingle<ReflectionRow>();

      if (existing) {
        return NextResponse.json(
          {
            ok: true,
            cached: true,
            message:
              "This week’s reflection already exists — showing the saved one.",
            reflection: existing,
          },
          { status: 200 }
        );
      }
    }
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, cached: false, reflection: insert.data },
    { status: 200 }
  );
}
