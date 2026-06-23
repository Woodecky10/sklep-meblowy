import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { linkGuestOrders } from "@/app/_lib/link-guest-orders";
import { isAdmin } from "@/app/_lib/admin";
import { safeNextPath } from "@/app/_lib/safe-redirect";
import { localizePath, stripLocale } from "@/app/_lib/i18n";

// OAuth callback (Google itp.) — wymienia `code` na sesję i linkuje zamówienia gościa.
// Admin po zalogowaniu trafia do /admin, zwykły user do /konto (chyba że
// next= explicite wskazuje gdzie indziej, np. po przekierowaniu z gated route).
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const explicitNext = url.searchParams.get("next");
  const origin = url.origin;

  // signInWithGoogle przekazuje już zlokalizowane `next` (np. /de/konto), więc
  // gdy explicite `next` jest pod /de, fallback (/konto) i error-redirecty (/logowanie)
  // też powinny zostać pod /de. Locale wyznaczamy z przychodzącego next.
  const locale = stripLocale(explicitNext ?? "/").locale;

  if (!code) {
    return NextResponse.redirect(
      `${origin}${localizePath("/logowanie", locale)}?error=missing_code`
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error("OAuth callback error:", error);
    return NextResponse.redirect(
      `${origin}${localizePath("/logowanie", locale)}?error=oauth`
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await linkGuestOrders(user.id, user.email);
  }

  // Honorujemy zlokalizowane `next` z query (np. /de/konto) bez zmian. W fallbacku
  // admin trafia do /admin (cele admina ZAWSZE PL), a zwykły user do /konto z
  // ewentualnym prefiksem /de wyznaczonym z przychodzącego next.
  const next =
    safeNextPath(explicitNext) ??
    (isAdmin(user) ? "/admin" : localizePath("/konto", locale));
  return NextResponse.redirect(`${origin}${next}`);
}
