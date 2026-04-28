import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

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
          supabaseResponse = NextResponse.next({ request });
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

  const path = request.nextUrl.pathname;

  // Niezalogowany → /konto/* przekieruj na logowanie
  if (!user && path.startsWith("/konto")) {
    const url = request.nextUrl.clone();
    url.pathname = "/logowanie";
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
    url.pathname = role === "admin" ? "/admin" : "/konto";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
