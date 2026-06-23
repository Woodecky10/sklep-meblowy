import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { localizePath, stripLocale } from "../i18n";

export async function updateSession(request: NextRequest) {
  // Rozbij ścieżkę na locale + ścieżkę bez prefiksu '/de'.
  // localePath = realna trasa appki (np. '/de/konto' → '/konto').
  const { locale, pathname: localePath } = stripLocale(request.nextUrl.pathname);

  // Nagłówek x-locale ląduje na requeście do server components (getLocale() go czyta).
  // Musi być w KAŻDYM NextResponse.next, który niesie request — i w initial, i w rebuildzie z setAll.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-locale", locale);

  let supabaseResponse = NextResponse.next({
    request: { headers: requestHeaders },
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request: { headers: requestHeaders },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Auth checks lecą na ścieżce BEZ prefiksu locale, żeby ochrona działała też pod '/de'.
  // Cele redirectów zostają PL (strony auth/admin są PL-only na tym etapie).
  const path = localePath;

  // Niezalogowany → /konto/* przekieruj na logowanie
  if (!user && path.startsWith("/konto")) {
    const url = request.nextUrl.clone();
    url.pathname = localizePath("/logowanie", locale);
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Niezalogowany → /admin/* przekieruj na logowanie z next=/admin
  if (!user && path.startsWith("/admin")) {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
    url.search = "?next=/admin";
    return NextResponse.redirect(url);
  }

  // Zalogowany ale nie admin → /admin/* przekieruj na home (defense in depth;
  // layout admina i tak sprawdza rolę server-side w requireAdmin())
  if (user && path.startsWith("/admin")) {
    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    if (role !== "admin") {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // Zalogowany → /logowanie i /rejestracja przekieruj
  // Admin → /admin, zwykły user → /konto
  if (user && (path === "/logowanie" || path === "/rejestracja")) {
    const role = (user.app_metadata as { role?: string } | undefined)?.role;
    const url = request.nextUrl.clone();
    url.pathname = role === "admin" ? "/admin" : localizePath("/konto", locale);
    url.search = "";
    return NextResponse.redirect(url);
  }

  // DE: rewrite na ścieżkę bez prefiksu, żeby renderowały istniejące trasy appki,
  // a URL w przeglądarce zostawał '/de/...'. PL: zwracamy zwykłą next-response.
  if (locale === "de") {
    const url = request.nextUrl.clone();
    url.pathname = localePath;
    const rewriteResponse = NextResponse.rewrite(url, {
      request: { headers: requestHeaders },
    });
    // Przenieś ciasteczka odświeżonej sesji Supabase na rewrite-response,
    // inaczej sesja po cichu przestaje się odświeżać pod '/de'.
    supabaseResponse.cookies.getAll().forEach((cookie) => {
      rewriteResponse.cookies.set(cookie);
    });
    return rewriteResponse;
  }

  return supabaseResponse;
}
