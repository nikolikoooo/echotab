import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Server-side auth callback.
 * Exchanges the `code` in the magic-link URL for a session
 * and persists it in HTTP-only cookies so API routes can read it.
 */
export async function GET(req: NextRequest) {
  const cookieStore = cookies();

  // Build a Supabase server client that can read/write cookies
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        // next/headers cookies().set has (name, value, options?) signature
        set(name: string, value: string, options?: Parameters<typeof cookieStore.set>[2]) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options?: Parameters<typeof cookieStore.set>[2]) {
          cookieStore.set(name, "", { ...(options || {}), maxAge: 0 });
        },
      },
    }
  );

  // This sets the session cookies if the code is valid
  const { error } = await supabase.auth.exchangeCodeForSession(req.url);

  if (error) {
    // Failed — bounce to login
    return NextResponse.redirect(new URL("/login?error=auth", req.url));
  }

  // Success — cookies are set, send them to home
  return NextResponse.redirect(new URL("/", req.url));
}
