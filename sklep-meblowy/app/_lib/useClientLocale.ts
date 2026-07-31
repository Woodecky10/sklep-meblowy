"use client";

import { usePathname } from "next/navigation";
import { stripLocale, DEFAULT_LOCALE, DE_ENABLED, type Locale } from "./i18n";

// Client-side odczyt locale dla komponentów "use client", które nie mogą wołać
// getLocale() (ten czyta nagłówek x-locale przez next/headers — tylko serwer).
// Pod '/de/...' middleware robi rewrite zachowując URL w przeglądarce, więc
// usePathname() niesie prefiks '/de' — stripLocale go wyłuskuje. Bezpieczne,
// bo stripLocale jest czystą funkcją (bez next/headers).
export function useClientLocale(): Locale {
  const pathname = usePathname();
  // ⏸ DE zamrożone (DE_ENABLED w i18n.ts) — parami z getLocale() po stronie
  // serwera. Bez tego bezpiecznika stara zakładka na '/de/...' (albo wpis
  // z historii) dalej wysyłałaby `locale:"de"` w body do /api/checkout.
  if (!DE_ENABLED || !pathname) return DEFAULT_LOCALE;
  return stripLocale(pathname).locale;
}
