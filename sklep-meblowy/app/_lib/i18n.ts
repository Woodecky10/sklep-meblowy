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

// Wybiera wartość DE (z fallbackiem do PL gdy pusta) albo PL.
export function pickLocalized(
  pl: string,
  de: string | null | undefined,
  locale: Locale
): string {
  if (locale === "de" && de && de.trim().length > 0) return de;
  return pl;
}
