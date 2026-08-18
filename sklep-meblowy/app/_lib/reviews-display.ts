// Czysta logika PREZENTACJI opinii — bez Supabase i bez next/headers, żeby
// dało się to zaimportować w vitest (environment: "node"). Odczyty z bazy
// siedzą w reviews.ts, komponenty w _components/ui.

import type { Locale } from "./i18n";
import type { ProductReview } from "./types";

// Próg oceny na stronie głównej. Filtr obowiązuje WYŁĄCZNIE tam: /opinie
// i karta produktu pokazują wszystkie zatwierdzone oceny, bo dyrektywa
// Omnibus zabrania publikowania samych opinii pozytywnych. Na home to wybór
// redakcyjny z ograniczonego miejsca (12 slotów), nie ukrywanie krytyki.
export const HOMEPAGE_REVIEW_MIN_RATING = 4;

// Krótsza treść nie przekonuje, a zajmuje slot opinii, która przekonuje.
// Próg jest OSTRY (> 30, nie >= 30) — patrz test na dokładnie 30 znaków.
export const HOMEPAGE_REVIEW_MIN_COMMENT_LENGTH = 30;

export const HOMEPAGE_REVIEWS_LIMIT = 12;

export type HomepageSelectable = Pick<
  ProductReview,
  "rating" | "comment" | "status" | "homepage_excluded" | "created_at"
>;

// Wybór opinii na stronę główną. Ostateczna bramka jest TUTAJ, nie w SQL:
// warunek długości treści nie da się wyrazić filtrem PostgREST, a rozbicie
// reguły na dwa miejsca kończy się rozjazdem. Zapytanie odsiewa zgrubnie,
// ten moduł rozstrzyga.
export function selectHomepageReviews<T extends HomepageSelectable>(
  rows: T[],
  limit = HOMEPAGE_REVIEWS_LIMIT
): T[] {
  return rows
    .filter(
      (r) =>
        r.status === "approved" &&
        r.homepage_excluded === false &&
        r.rating >= HOMEPAGE_REVIEW_MIN_RATING &&
        (r.comment ?? "").trim().length > HOMEPAGE_REVIEW_MIN_COMMENT_LENGTH
    )
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, Math.max(0, limit));
}

// Podpis pod opinią w formie „Anna K." — RODO, minimalizacja danych.
// Przeniesione z ReviewList.tsx (zachowanie 1:1), bo karta opinii na home
// i strona /opinie potrzebują tego samego.
export function anonymizeAuthor(
  name: string | null | undefined,
  locale: Locale
): string {
  const fallback = locale === "de" ? "Kunde" : "Klient";
  if (!name || name.trim() === "") return fallback;
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] ?? "";
  return `${first} ${lastInitial}.`;
}

// Data wystawienia opinii. Śmieć na wejściu zwracamy bez zmian — data pod
// opinią nie jest warta wywalenia strony głównej.
export function formatReviewDate(iso: string, locale: Locale): string {
  // `toLocaleDateString` na Invalid Date NIE rzuca — zwraca napis
  // "Invalid Date", więc samo `try/catch` by tego nie wyłapało i klient
  // zobaczyłby angielski komunikat pod polską opinią. Stąd jawny warunek.
  if (Number.isNaN(new Date(iso).getTime())) return iso;
  try {
    return new Date(iso).toLocaleDateString(locale === "de" ? "de-DE" : "pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
