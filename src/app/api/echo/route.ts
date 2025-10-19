import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// We’ll use service role on the server, but still verify the user via their access token.
export async function POST(req: NextRequest) {
const { text } = await req.json().catch(() => ({}));
if (!text || typeof text !== "string") {
  return NextResponse.json({ error: "no text" }, { status: 400 });
}
if (text.length > 1000) {
  return NextResponse.json({ error: "Entry too long (max 1000 chars)" }, { status: 413 });
}


  const accessToken = req.headers.get("sb-access-token");
  if (!accessToken) return NextResponse.json({ error: "not authenticated" }, { status: 401 });

  const sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE!
  );

  // Get the user associated with this token
  const { data: userData, error: uErr } = await sb.auth.getUser(accessToken);
  if (uErr || !userData?.user) {
    return NextResponse.json({ error: "auth failed" }, { status: 401 });
  }

  // Insert the entry
  const { error } = await sb.from("entries").insert({
    user_id: userData.user.id,
    content: text,
    mood: null,
    topics: [],
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
