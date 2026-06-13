"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { LOCALES, stripLocale, localizePath, type Locale } from "@/app/_lib/i18n";

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

  const query = searchParams?.toString() ?? "";
  const suffix = query ? `?${query}` : "";

  return (
    <div className={`flex items-center gap-1 text-xs font-sans ${className}`} aria-label="Język">
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
              <Link
                href={href}
                className="opacity-70 hover:opacity-100 hover:text-[var(--color-gold)] transition-colors"
              >
                {LABELS[loc]}
              </Link>
            )}
          </span>
        );
      })}
    </div>
  );
}
