"use client";

import { usePathname } from "next/navigation";
import { stripLocale, DEFAULT_LOCALE, type Locale } from "./i18n";

// Client-side odczyt locale dla komponentów "use client", które nie mogą wołać
// getLocale() (ten czyta nagłówek x-locale przez next/headers — tylko serwer).
// Pod '/de/...' middleware robi rewrite zachowując URL w przeglądarce, więc
// usePathname() niesie prefiks '/de' — stripLocale go wyłuskuje. Bezpieczne,
// bo stripLocale jest czystą funkcją (bez next/headers).
export function useClientLocale(): Locale {
  const pathname = usePathname();
  if (!pathname) return DEFAULT_LOCALE;
  return stripLocale(pathname).locale;
}
