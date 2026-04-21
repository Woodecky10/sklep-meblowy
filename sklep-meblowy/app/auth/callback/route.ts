import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { linkGuestOrders } from "@/app/_lib/link-guest-orders";

// OAuth callback (Google itp.) — wymienia `code` na sesję i linkuje zamówienia gościa.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/konto";
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

  return NextResponse.redirect(`${origin}${next}`);
}
