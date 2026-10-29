import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY — ten sam wzorzec co
// search-suggest-wiring.test.ts. LOGIKA wyszukiwania po nazwie kolekcji jest
// przetestowana zachowaniem (search-collections.test.ts, applyTokenGroup
// i rankByNameMatch w search-filter.test.ts). Nie da się tak przetestować
// dwóch SZWÓW — getProducts w products.ts i route handlera rozwijki — bo oba
// wołają prawdziwe supabase, a repo świadomie nie mockuje bazy. To są dokładnie
// te miejsca, w których da się rozspawać feature bez oblania jednego testu.

const PRODUCTS = readFileSync(
  path.join(process.cwd(), "app", "_lib", "products.ts"),
  "utf8"
);
const ROUTE = readFileSync(
  path.join(process.cwd(), "app", "api", "search", "suggest", "route.ts"),
  "utf8"
);

describe.each([
  ["/sklep (products.ts)", PRODUCTS],
  ["rozwijka (/api/search/suggest)", ROUTE],
])("%s — podpięcie nazwy kolekcji", (_label, source) => {
  it("filtr do bazy dostaje id kolekcji per grupa (czwarty argument applyTokenGroup)", () => {
    // Bez tego produkt mający słowo frazy TYLKO w nazwie kolekcji się nie
    // znajdzie — a to jest cały sens feature'u.
    expect(/collectionIdsForGroups\(/.test(source)).toBe(true);
    expect(/applyTokenGroup\(\s*query,\s*keyCol,\s*group,\s*collectionIds\[i\]\s*\)/.test(source)).toBe(true);
  });

  it("ranking dostaje predykat awansu po collection_id (czwarty argument rankByNameMatch)", () => {
    // Decyzja właściciela 2026-10-29: kolekcja trafiona nazwą — priorytetowo.
    expect(/priorityCollectionIds\(/.test(source)).toBe(true);
    expect(/collection_id !== null && priority\.has\(\w+\.collection_id\)/.test(source)).toBe(true);
  });
});

describe("rozwijka — kolumna collection_id w zapytaniu", () => {
  it("select pobiera collection_id, inaczej predykat awansu zawsze da false", () => {
    // `select("*")` na tabeli BEZ kolumny daje undefined, a tu kolumna JEST —
    // ale lista kolumn w select jest jawna, więc brak jej w liście = brak pola
    // w wierszu = cichy brak awansu bez żadnego błędu.
    expect(/\.select\("[^"]*\bcollection_id\b[^"]*"\)/.test(ROUTE)).toBe(true);
  });
});
