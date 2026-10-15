// Kategorie dodatkowe produktu (spec 2026-10-15, migracja 84). Kategoria
// główna zostaje w `products.category` i zasila wszystko, co potrzebuje
// jednej kategorii (okruszki, feed, podobne, cross-sell, koszyk);
// `products.extra_categories` decyduje tylko o tym, na których listach
// produkt się pojawia.
//
// Czysty moduł — bez importów serwerowych, bezpieczny także dla komponentów
// klienckich (stałe nazw pól formularza).

// Slugi kategorii: małe litery ASCII, cyfry, pojedyncze myślniki (wszystkie
// na produkcji 2026-10-15 tak wyglądają). Tylko takie wolno wkleić do składni
// filtra PostgREST — przecinek, nawias albo klamra rozbiłyby warunek.
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Warunek, który niczego nie dopasuje — ten sam wzorzec co „nieznany slug →
// pusty listing" w getProducts.
export const NO_MATCH_FILTER = "id.eq.00000000-0000-0000-0000-000000000000";

// Warunek do `.or()`: kategoria główna z listy LUB któraś z dodatkowych
// z listy. Kilka `.or()` w jednym zapytaniu (kategoria + grupy synonimów
// wyszukiwania) PostgREST łączy przez AND — sprawdzone na produkcji
// (plan, Task 1 krok 6).
export function categoryMatchFilter(slugs: readonly string[]): string {
  const safe = [...new Set(slugs.filter((s) => SLUG_RE.test(s)))];
  if (safe.length === 0) return NO_MATCH_FILTER;
  const list = safe.join(",");
  return `category.in.(${list}),extra_categories.ov.{${list}}`;
}
