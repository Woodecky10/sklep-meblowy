import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/app/_lib/supabase/server";
import { linkGuestOrders } from "@/app/_lib/link-guest-orders";

// Weryfikacja linku z emaila (signup, magic link, recovery).
// Po sukcesie: sesja utworzona + linkujemy zamówienia gościa.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const token_hash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const next = url.searchParams.get("next") ?? "/konto";
  const origin = url.origin;

  if (!token_hash || !type) {
    return NextResponse.redirect(`${origin}/logowanie?error=invalid_link`);
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    console.error("Email confirm error:", error);
    return NextResponse.redirect(
      `${origin}/logowanie?error=${encodeURIComponent(error.message)}`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await linkGuestOrders(user.id, user.email);
  }

  return NextResponse.redirect(`${origin}${next}`);
}
