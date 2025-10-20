import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const MAX_CHARS = 1000;
const DAILY_LIMIT = 1;

function startOfDayUTC(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}
function endOfDayUTC(d = new Date()): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 1);
  x.setUTCHours(0, 0, 0, 0);
  return x.toISOString();
}

function getAccessToken(req: NextRequest): string | null {
  const h1 = req.headers.get("sb-access-token");
  if (h1) return h1;
  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  return null;
}

type InsertedEntry = { id: string; content: string; created_at: string };

export async function POST(req: NextRequest) {
  try {
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

    // parse body safely
    let text = "";
    try {
      const body = (await req.json()) as unknown;
      if (
        body &&
        typeof body === "object" &&
        "text" in body &&
        typeof (body as { text?: unknown }).text === "string"
      ) {
        text = ((body as { text?: string }).text ?? "").trim();
      }
    } catch {
      /* ignore */
    }

    if (!text) {
      return NextResponse.json(
        { error: "bad_request", message: "Text is required." },
        { status: 400 }
      );
    }
    if (text.length > MAX_CHARS) {
      return NextResponse.json(
        { error: "too_long", message: `Entry too long (max ${MAX_CHARS}).` },
        { status: 413 }
      );
    }

    // enforce per-day limit (in production only, dev can be noisy)
    const isDev = process.env.NODE_ENV !== "production";
    if (!isDev) {
      const from = startOfDayUTC();
      const to = endOfDayUTC();
      const { count, error: cntErr } = await supabaseAdmin
        .from("entries")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", from)
        .lt("created_at", to);

      if (cntErr) {
        return NextResponse.json(
          { error: "db_error", message: cntErr.message },
          { status: 500 }
        );
      }
      if ((count ?? 0) >= DAILY_LIMIT) {
        return NextResponse.json(
          {
            error: "daily_limit",
            message: "You’ve already logged today. Come back tomorrow 💛",
          },
          { status: 429 }
        );
      }
    }

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("entries")
      .insert({ user_id: userId, content: text })
      .select("id, content, created_at")
      .single();

    if (insErr || !inserted) {
      return NextResponse.json(
        { error: "db_error", message: insErr?.message ?? "Insert failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, entry: inserted as InsertedEntry });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unexpected server error.";
    return NextResponse.json({ error: "server_error", message }, { status: 500 });
  }
}
