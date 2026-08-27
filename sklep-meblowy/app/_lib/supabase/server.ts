import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { fetchZLimitem } from "./fetch-timeout";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Bez limitu czasu zawieszone zapytanie wisi do limitu platformy i zabiera
      // ze sobą cały render strony — patrz fetch-timeout.ts.
      global: { fetch: fetchZLimitem },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — reads are fine, writes are ignored
          }
        },
      },
    }
  );
}

// Service role — bez cookies/sesji użytkownika. Omija RLS.
// Używać tylko z poziomu zaufanego serwera, po walidacji.
export async function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      global: { fetch: fetchZLimitem },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}
