import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
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

export async function POST(req: NextRequest) {
  // Auth via cookies (works on localhost and prod)
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name) {
          return cookieStore.get(name)?.value;
        },
        set(name, value, options) {
          cookieStore.set({ name, value, ...options });
        },
        remove(name, options) {
          cookieStore.set({ name, value: "", ...options, maxAge: 0 });
        },
      },
    }
  );

  const { data: authData, error: authErr } = await supabase.auth.getUser();
  if (authErr || !authData?.user) {
    return NextResponse.json({ error: "auth failed" }, { status: 401 });
  }
  const userId = authData.user.id;

  // parse & validate
  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const text = (body.text ?? "").trim();
  if (!text) return NextResponse.json({ error: "no text" }, { status: 400 });
  if (text.length > MAX_CHARS) {
    return NextResponse.json({ error: `Entry too long (max ${MAX_CHARS})` }, { status: 413 });
  }

  // use admin client for count/insert (clear permissions)
  const sbAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  // per-day limit
  const from = startOfDayUTC().toISOString();
  const to = endOfDayUTC().toISOString();
  const { count, error: cErr } = await sbAdmin
    .from("entries")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", from)
    .lt("created_at", to);

  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });
  if ((count ?? 0) >= DAILY_LIMIT) {
    return NextResponse.json(
      { error: "daily_limit", message: "You’ve already logged today. Come back tomorrow 💛" },
      { status: 429 }
    );
  }

  // insert
  const { data: inserted, error: iErr } = await sbAdmin
    .from("entries")
    .insert({ user_id: userId, content: text })
    .select("id, content, created_at")
    .single();

  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, entry: inserted });
}
