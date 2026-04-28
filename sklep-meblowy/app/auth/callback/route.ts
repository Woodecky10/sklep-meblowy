import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { linkGuestOrders } from "@/app/_lib/link-guest-orders";
import { isAdmin } from "@/app/_lib/admin";

// OAuth callback (Google itp.) — wymienia `code` na sesję i linkuje zamówienia gościa.
// Admin po zalogowaniu trafia do /admin, zwykły user do /konto (chyba że
// next= explicite wskazuje gdzie indziej, np. po przekierowaniu z gated route).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const explicitNext = url.searchParams.get("next");
  const origin = url.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}/logowanie?error=missing_code`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(`${origin}/logowanie?error=oauth`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await linkGuestOrders(user.id, user.email);
  }

  const next = explicitNext ?? (isAdmin(user) ? "/admin" : "/konto");
  return NextResponse.redirect(`${origin}${next}`);
}
