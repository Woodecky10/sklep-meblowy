import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY — ten sam wzorzec co
// search-suggest-wiring.test.ts. LOGIKA wyszukiwania po nazwie kolekcji jest
// przetestowana zachowaniem (search-collections.test.ts, applyTokenGroup
// i rankByNameMatch w search-filter.test.ts). Nie da się tak przetestować
// SZWÓW — getProducts w products.ts, route handlera rozwijki, wyszukiwarki
// panelu i słownika literówek — bo wszystkie wołają prawdziwe supabase, a repo
// świadomie nie mockuje bazy. To są dokładnie te miejsca, w których da się
// rozspawać feature bez oblania jednego testu.

const read = (...parts: string[]) =>
  readFileSync(path.join(process.cwd(), ...parts), "utf8");

const PRODUCTS = read("app", "_lib", "products.ts");
const ROUTE = read("app", "api", "search", "suggest", "route.ts");
const ADMIN = read("app", "admin", "produkty", "actions.ts");
const VOCAB = read("app", "_lib", "search-vocabulary-server.ts");

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

  it("nazwa własna kolekcji jest doklejona do nazwy produktu w kluczu rankingu", () => {
    // Produkt znaleziony TYLKO przez kolekcję (rdzeniem/synonimem, bez awansu)
    // ma być na poziomie 2 (rdzeń w nazwie), nie na 3 pod produktami z opisu.
    expect(/collectionNameOf\(\s*index,\s*\w+\.collection_id\s*\)/.test(source)).toBe(true);
  });
});

describe("rozwijka — kolumna collection_id w zapytaniu", () => {
  it("select pobiera collection_id, inaczej predykat awansu zawsze da false", () => {
    // Lista kolumn w select jest jawna, więc brak jej w liście = brak pola
    // w wierszu = cichy brak awansu bez żadnego błędu.
    expect(/\.select\("[^"]*\bcollection_id\b[^"]*"\)/.test(ROUTE)).toBe(true);
  });
});

describe("panel — wyszukiwarka produktów do grupy rozmiarów", () => {
  it("dostaje te same id kolekcji co sklep (komentarz obiecuje ten sam katalog)", () => {
    // actions.ts: „panel i klient widzą ten sam katalog" — bez tego drutu
    // admin szukający po nazwie kolekcji dostałby 0 tam, gdzie klient dostaje
    // produkty.
    expect(/collectionIdsForGroups\(/.test(ADMIN)).toBe(true);
    expect(/applyTokenGroup\(\s*q,\s*"search_key_fold",\s*group,\s*collectionIds\[i\]\s*\)/.test(ADMIN)).toBe(true);
  });
});

describe("słownik literówek — nazwy kolekcji", () => {
  it("fetchVocabularySource dokłada nazwy własne kolekcji do nazw produktów", () => {
    // Inaczej kolekcja, której nazwy nie ma w żadnej nazwie produktu, byłaby
    // znajdywalna, ale literówka w niej nie miałaby na co zostać poprawiona.
    expect(/from\("collections"\)/.test(VOCAB)).toBe(true);
    // Użycie, nie sam import: `.map(collectionOwnName)` albo wywołanie.
    expect(/\.map\(collectionOwnName\)|collectionOwnName\(/.test(VOCAB)).toBe(true);
  });
});
