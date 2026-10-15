// Kategorie dodatkowe produktu (spec 2026-10-15, migracja 84). Kategoria
// główna zostaje w `products.category` i zasila wszystko, co potrzebuje
// jednej kategorii (okruszki, feed, podobne, cross-sell, koszyk);
// `products.extra_categories` decyduje tylko o tym, na których listach
// produkt się pojawia.
//
// Czysty moduł — bez importów serwerowych, bezpieczny także dla komponentów
// klienckich (stałe nazw pól formularza).

import { flattenForSelect, type CategoryNode } from "./category-tree";

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

// Nazwy pól formularza „Podstawowe dane" (ExtraCategoriesField ↔
// updateProductBasics).
export const EXTRA_CATEGORIES_FIELD = "extra_categories";
// Odznaczone checkboxy nie trafiają do FormData, więc „wszystko odznaczone"
// i „pola nie było w formularzu" wyglądają tak samo — rozróżnia je ten
// ukryty znacznik.
export const EXTRA_CATEGORIES_PRESENT_FIELD = "extra_categories_present";

// Kolejność węzłów jak w selekcie kategorii — zapis nie zależy od kolejności
// zaznaczania checkboxów.
function treeOrder(nodes: CategoryNode[]): string[] {
  return flattenForSelect(nodes).flatMap((g) => g.options.map((o) => o.slug));
}

// Wartości z formularza → to, co zapisujemy: tylko istniejące slugi, bez
// duplikatów, bez kategorii głównej (gdy admin zmienił główną na dawną
// dodatkową, dodatkowa znika), w kolejności drzewa.
export function normalizeExtraCategories(
  raw: readonly unknown[],
  mainCategory: string,
  nodes: CategoryNode[]
): string[] {
  const wanted = new Set(
    raw.filter((v): v is string => typeof v === "string").map((v) => v.trim())
  );
  return treeOrder(nodes).filter((slug) => wanted.has(slug) && slug !== mainCategory);
}

// undefined = formularz bez tego pola → kolumny nie ruszamy.
export function extraCategoriesFromForm(
  formData: FormData,
  mainCategory: string,
  nodes: CategoryNode[]
): string[] | undefined {
  if (formData.get(EXTRA_CATEGORIES_PRESENT_FIELD) !== "1") return undefined;
  // Pusty zbiór kategorii = odczyt kategorii padł (withFallback dał []), nie
  // „sklep bez kategorii" — z pustego drzewa nigdy nie czyścimy kolumny.
  if (nodes.length === 0) return undefined;
  return normalizeExtraCategories(formData.getAll(EXTRA_CATEGORIES_FIELD), mainCategory, nodes);
}
