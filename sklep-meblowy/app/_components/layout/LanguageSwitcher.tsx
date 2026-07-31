"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { DE_ENABLED, LOCALES, stripLocale, localizePath, type Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";

const LABELS: Record<Locale, string> = { pl: "PL", de: "DE" };

// Przełącznik języka PL | DE. Czyta ścieżkę z przeglądarki (zawiera prefiks
// '/de' dzięki rewrite w middleware), rozbija ją na locale + ścieżkę bazową
// i buduje linki do OBU wersji zachowując query string. Aktywny język jest
// wyróżniony i nieklikalny (aria-current). Client-only — stripLocale/localizePath
// nie importują next/headers, więc są bezpieczne tutaj.
export default function LanguageSwitcher({ className = "" }: { className?: string }) {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const { locale: current, pathname: base } = stripLocale(pathname);
  const t = getDictionary(current);

  const query = searchParams?.toString() ?? "";
  const suffix = query ? `?${query}` : "";

  // ⏸ DE zamrożone (DE_ENABLED w i18n.ts) → jeden język, nie ma czego
  // przełączać. Ukrywamy tutaj, a nie usuwamy użycia z TopBar/MobileMenu,
  // żeby odmrożenie było zmianą jednej wartości, a nie przywracaniem kodu.
  // Warunek PO hookach — wcześniejszy return łamałby Rules of Hooks.
  if (!DE_ENABLED) return null;

  return (
    <div className={`flex items-center gap-1 text-xs font-sans ${className}`} aria-label={t.a11y.language}>
      {LOCALES.map((loc, i) => {
        const isActive = loc === current;
        const href = `${localizePath(base, loc)}${suffix}`;
        return (
          <span key={loc} className="flex items-center gap-1">
            {i > 0 && <span className="opacity-40">|</span>}
            {isActive ? (
              <span aria-current="true" className="font-semibold text-[var(--color-gold)]">
                {LABELS[loc]}
              </span>
            ) : (
              // Natywny <a> (pełny reload), NIE next/link. Locale niesie nagłówek
              // x-locale (z proxy wg prefiksu URL), a chrome (TopBar/Navbar/Footer)
              // jest serwerowy w root layoucie — App Router NIE re-renderuje layoutu
              // przy soft-nav, więc <Link> tłumaczyłby tylko stronę, a chrome zostawał
              // w starym języku do refreshu. Pełna nawigacja re-renderuje całe drzewo
              // serwerowo z nowym locale. NIE zamieniać z powrotem na <Link>.
              <a
                href={href}
                className="opacity-70 hover:opacity-100 hover:text-[var(--color-gold)] transition-colors"
              >
                {LABELS[loc]}
              </a>
            )}
          </span>
        );
      })}
    </div>
  );
}
