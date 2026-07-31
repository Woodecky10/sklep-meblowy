export const LOCALES = ["pl", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";

// ⏸ ZAMROŻENIE WERSJI NIEMIECKIEJ — decyzja właściciela 2026-07-31.
//
// Sklep startuje ze sprzedażą TYLKO w Polsce: do wystawiania faktur i
// rozliczania VAT dla niemieckiego klienta brakuje niemieckiego numeru
// podatkowego (USt-IdNr / VAT-OSS — do potwierdzenia z księgową). Kod EUR i
// tłumaczenia DE są sprawne i mają wrócić, więc NIE są usuwane — tylko
// odcięte od świata tą jedną flagą.
//
// `false` powoduje, że:
//   - `/de/*` odpowiada redirectem 307 na odpowiednik PL (proxy.ts → updateSession),
//   - przełącznik języka PL|DE nie renderuje się wcale (LanguageSwitcher),
//   - hreflang `de` nie wychodzi z żadnej strony ani ze sitemapy (sitemap-i18n.ts),
//   - sitemapa nie zawiera URL-i `/de/...`,
//   - `getLocale()` nie zwróci "de", nawet gdyby ktoś podrobił nagłówek x-locale.
//
// ODMROŻENIE = zmiana tej wartości na `true` i nic więcej w kodzie. Poza kodem
// zostaje: ustawić realny kurs EUR w /admin/ustawienia (jest tam seed 0.23),
// zgłosić `/de` w Search Console i sprawdzić, czy PayPro rozlicza EUR.
export const DE_ENABLED = false;

export function isLocale(v: string): v is Locale {
  return (LOCALES as readonly string[]).includes(v);
}

// Rozbija ścieżkę na { locale, pathname-bez-prefiksu }. Tylko '/de' jest prefiksem
// (PL = korzeń, bez prefiksu). Dopasowuje '/de' albo '/de/...', nie '/depilacja'.
export function stripLocale(pathname: string): { locale: Locale; pathname: string } {
  if (pathname === "/de") return { locale: "de", pathname: "/" };
  if (pathname.startsWith("/de/")) return { locale: "de", pathname: pathname.slice(3) };
  return { locale: DEFAULT_LOCALE, pathname };
}

// Przy zamrożonym DE zwraca ścieżkę PL, na którą trzeba przekierować żądanie,
// albo `null` gdy żądanie nie wymaga redirectu (locale PL albo DE odmrożone).
// Wydzielone z proxy, żeby dało się przetestować bez NextRequest.
export function frozenDeRedirectPath(pathname: string): string | null {
  if (DE_ENABLED) return null;
  const { locale, pathname: stripped } = stripLocale(pathname);
  return locale === "de" ? stripped : null;
}

// Dokleja prefiks locale do ścieżki (PL bez prefiksu).
export function localizePath(pathname: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return pathname;
  return pathname === "/" ? "/de" : `/de${pathname}`;
}

// Lokalizuje href wewnętrzny (zaczynający się od '/'): wyłuskuje ewentualny
// istniejący prefiks '/de', dokleja prefiks dla `locale`, zachowując query/hash.
// External/hash/mailto/itp. (nie zaczynające się od '/') przepuszcza bez zmian.
export function localizeHref(href: string, locale: Locale): string {
  if (!href.startsWith("/")) return href;
  const sepMatch = href.search(/[?#]/);
  const path = sepMatch === -1 ? href : href.slice(0, sepMatch);
  const suffix = sepMatch === -1 ? "" : href.slice(sepMatch);
  const { pathname } = stripLocale(path);
  return localizePath(pathname, locale) + suffix;
}

// Wybiera wartość DE (z fallbackiem do PL gdy pusta) albo PL.
export function pickLocalized(
  pl: string,
  de: string | null | undefined,
  locale: Locale
): string {
  if (locale === "de" && de && de.trim().length > 0) return de;
  return pl;
}
