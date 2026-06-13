export const LOCALES = ["pl", "de"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "pl";

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
