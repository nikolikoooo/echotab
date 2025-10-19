import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_CHARS = 1000;
const DAILY_LIMIT = 1;

function startOfDayUTC(d = new Date()): Date {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCHours(0, 0, 0, 0);
  return x;
}
function endOfDayUTC(d = new Date()): Date {
  const x = startOfDayUTC(d);
  x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

function getAccessToken(req: NextRequest): string | null {
  // 1) custom header we send from the client
  const h1 = req.headers.get("sb-access-token");
  if (h1) return h1;

  // 2) Authorization: Bearer <token>
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) {
    return auth.replace(/^Bearer\s+/i, "").trim();
  }

  // 3) Supabase cookie (set by GoTrue)
  const cookieToken = req.cookies.get("sb-access-token")?.value;
  if (cookieToken) return cookieToken;

  return null;
}

export async function POST(req: NextRequest) {
  const accessToken = getAccessToken(req);
  if (!accessToken) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE! // admin key, required to verify token server-side
  );

  const { data: u, error: uErr } = await sb.auth.getUser(accessToken);
  if (uErr || !u?.user) return NextResponse.json({ error: "auth failed" }, { status: 401 });
  const user = u.user;

  // parse and validate
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `Entry too long (max ${MAX_CHARS})` }, { status: 413 });
  }

  // enforce per-day limit (UTC) with a simple count query
  const from = startOfDayUTC().toISOString();
  const to = endOfDayUTC().toISOString();
  const { count, error: cErr } = await sb
    .from("entries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .gte("created_at", from)
    .lt("created_at", to);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "daily_limit", message: "You’ve already logged today. Come back tomorrow 💛" },
      { status: 429 }
    );
  }

  // insert entry
  const { data: inserted, error: iErr } = await sb
    .from("entries")
    .insert({ user_id: user.id, content: text })
    .select("id, content, created_at")
    .single();

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, entry: inserted });
}
