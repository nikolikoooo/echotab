import { createBrowserClient } from "@supabase/ssr";

export const supabaseBrowser = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // 👇 Force implicit flow so email links contain #access_token,
      // avoiding the /token?grant_type=pkce exchange entirely.
      flowType: "implicit",
    },
  }
);
