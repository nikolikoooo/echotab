import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Row = {
  id: string;
  user_id: string;
  week_start: string;          // date
  summary: string;             // text
  highlights: string[] | null; // text[]
  mood_rollup: number | null;  // number
};

function getAccessToken(req: NextRequest): string | null {
  const h1 = req.headers.get("sb-access-token");
  if (h1) return h1;
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return null;
}

export async function GET(req: NextRequest) {
  try {
    const token = getAccessToken(req);
    if (!token) {
      return NextResponse.json({ error: "auth failed", message: "Missing access token." }, { status: 401 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL as string,
      process.env.SUPABASE_SERVICE_ROLE as string
    );

    // identify user from token
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "auth failed", message: "Invalid session." }, { status: 401 });
    }
    const userId = userRes.user.id;

    // fetch latest reflections
    const { data, error } = await supabaseAdmin
      .from("reflections")
      .select("id, user_id, week_start, summary, highlights, mood_rollup")
      .eq("user_id", userId)
      .order("week_start", { ascending: false })
      .limit(24);

    if (error) {
      return NextResponse.json({ error: "db_error", message: error.message }, { status: 500 });
    }

    // Map DB columns to the shape the UI expects
    const shaped = (data as Row[]).map((r) => ({
      id: r.id,
      week_start: r.week_start,
      content: r.summary,
      entries: r.highlights ?? [],
      avg_mood: r.mood_rollup,
    }));

    return NextResponse.json(shaped);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected server error.";
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}
