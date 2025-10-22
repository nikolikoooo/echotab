import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/** Build a Supabase server client that reads the session from cookies (read-only) */
async function supabaseFromCookies() {
  const cookieStore = await cookies(); // Next 15 route handlers => Promise<ReadonlyRequestCookies>
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

/**
 * GET /api/reflections
 * Returns the current user's reflections, newest first.
 */
export async function GET(_req: NextRequest) {
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

  const { data, error } = await supabase
    .from("reflections")
    .select("id, week_start, summary, highlights, mood_rollup, generated_at")
    .eq("user_id", userId)
    .order("week_start", { ascending: false });

  if (error) {
    return NextResponse.json(
      { error: "read_failed", details: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ rows: data ?? [] }, { status: 200 });
}
