import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

function getAccessTokenFromHeadersOrCookie(req: NextRequest): string | null {
  const h1 = req.headers.get("sb-access-token");
  if (h1) return h1;

  const auth = req.headers.get("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();

  const cookieToken = req.cookies.get("sb-access-token")?.value || null;
  return cookieToken;
}

export async function GET(req: NextRequest) {
  // First try SSR cookies (the preferred path)
  const cookieStore = cookies();
  const supabaseSSR = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name) => cookieStore.get(name)?.value,
        set: (name, value, options) => cookieStore.set(name, value, options),
        remove: (name, options) => cookieStore.set(name, "", { ...(options || {}), maxAge: 0 }),
      },
    }
  );

  const ssr = await supabaseSSR.auth.getUser();
  if (ssr.data?.user) {
    return NextResponse.json({
      authed: true,
      source: "ssr-cookies",
      user_id: ssr.data.user.id,
      email: ssr.data.user.email,
    });
  }

  // Fallback: try explicit access token (header or cookie) with admin client
  const token = getAccessTokenFromHeadersOrCookie(req);
  if (token) {
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE!
    );
    const byToken = await admin.auth.getUser(token);
    if (byToken.data?.user) {
      return NextResponse.json({
        authed: true,
        source: "access-token",
        user_id: byToken.data.user.id,
        email: byToken.data.user.email,
      });
    }
  }

  return NextResponse.json({ authed: false, error: "Auth session missing!" }, { status: 401 });
}
