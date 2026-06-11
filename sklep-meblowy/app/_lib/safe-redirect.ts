// Ochrona przed open redirect. Parametr `next` (z query stringa, kontrolowany
// przez atakującego) trafiał wprost do NextResponse.redirect(`${origin}${next}`).
// Konkatenacja origin+next NIE chroni: `@evil.com` → host evil.com (userinfo
// trick), `.evil.com` → subdomena phishingowa, `//evil.com` i `/\evil.com` →
// URL z cudzym hostem. Akceptujemy WYŁĄCZNIE ścieżki lokalne.
//
// Zwraca bezpieczną ścieżkę albo null — caller robi `safeNextPath(x) ?? fallback`.
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  // Musi być ścieżką absolutną w obrębie naszego origin…
  if (!next.startsWith("/")) return null;
  // …ale nie protokołowo-względną (//host) ani z backslashem (/\host),
  // które przeglądarka rozwija do innego hosta.
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}
