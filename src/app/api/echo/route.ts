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
        // read-only is fine here; we only need to read the session
        get: (name: string) => cookieStore.get(name)?.value,
      },
    }
  );
}

function startOfUTCDayISO(d = new Date()): string {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

type EchoBody = { text?: string };

export async function POST(req: NextRequest) {
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

  let body: EchoBody;
  try {
    body = (await req.json()) as EchoBody;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const text = (body.text ?? "").trim();
  if (!text) {
    return NextResponse.json({ error: "missing_text" }, { status: 400 });
  }

  // Daily limit: 1 entry per UTC day
  const since = startOfUTCDayISO();
  const { data: today, error: todayErr } = await supabase
    .from("entries")
    .select("id")
    .eq("user_id", userId)
    .gt("created_at", since)
    .limit(1);

  if (!todayErr && today && today.length >= 1) {
    return NextResponse.json({ error: "daily_limit" }, { status: 429 });
  }

  const { error: insertErr } = await supabase.from("entries").insert({
    user_id: userId,
    content: text,
  });

  if (insertErr) {
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
