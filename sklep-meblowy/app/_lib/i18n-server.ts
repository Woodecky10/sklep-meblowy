import { headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, type Locale } from "./i18n";

// Server-only: czyta locale z nagłówka `x-locale` ustawionego przez proxy.
// Fallback do DEFAULT_LOCALE gdy brak/niepoprawny.
//
// WYDZIELONE z i18n.ts: i18n.ts trzyma TYLKO czyste helpery (bez `next/headers`),
// bo importują je też komponenty klienckie (LocalizedLink, LanguageSwitcher,
// useClientLocale, FilterBar). Import `next/headers` w module wciąganym do bundla
// klienta wysypuje build ("only available in Server Components").
export async function getLocale(): Promise<Locale> {
  const h = await headers();
  const v = h.get("x-locale");
  return v && isLocale(v) ? v : DEFAULT_LOCALE;
}
