import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY — wzorzec jak search-collections-wiring.
// LOGIKA pola „Kolekcja” (odczyt z formularza, decyzja assign/unassign, pozycja
// na końcu) jest przetestowana zachowaniem w product-collection.test.ts.
// SZWY — akcje panelu i oba formularze — wołają prawdziwe supabase i render
// kliencki, których repo nie mockuje; bez tego guardu dało się usunąć pole
// z jednego formularza bez oblania testu.

const read = (...parts: string[]) =>
  readFileSync(path.join(process.cwd(), ...parts), "utf8");

const ACTIONS = read("app", "admin", "produkty", "actions.ts");
const EDITOR = read("app", "admin", "produkty", "[id]", "ProductEditor.tsx");
const EDITOR_PAGE = read("app", "admin", "produkty", "[id]", "page.tsx");
const NEW_FORM = read("app", "admin", "produkty", "nowy", "NewProductForm.tsx");
const NEW_PAGE = read("app", "admin", "produkty", "nowy", "page.tsx");

function between(source: string, start: string, end: string): string {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i + 1);
  expect(i).toBeGreaterThan(-1);
  return source.slice(i, j === -1 ? undefined : j);
}

describe("akcje panelu — przypisanie do kolekcji z karty produktu", () => {
  it("updateProductBasics czyta pole przez collectionIdFromForm i listę z getAllCollections", () => {
    const fn = between(ACTIONS, "export async function updateProductBasics", "export async function updateProductImages");
    expect(/collectionIdFromForm\(/.test(fn)).toBe(true);
    expect(/getAllCollections\(\)/.test(fn)).toBe(true);
    expect(/collectionUpdatesFor\(/.test(fn)).toBe(true);
  });

  it("decyzja assign/unassign idzie przez collectionChange, nie przez własny warunek", () => {
    expect(/collectionChange\(/.test(ACTIONS)).toBe(true);
  });

  it("createProduct przekazuje collectionId do buildNewProductPayload", () => {
    const fn = between(ACTIONS, "export async function createProduct", "export async function duplicateProduct");
    expect(/collectionIdFromForm\(/.test(fn)).toBe(true);
    expect(/collectionId/.test(fn)).toBe(true);
  });

  it("po zmianie przypisania unieważnia cache kolekcji i stronę główną (mozaika kafelka)", () => {
    expect(/invalidateCollectionsCache\(\)/.test(ACTIONS)).toBe(true);
    expect(/revalidatePath\("\/admin\/kolekcje"\)/.test(ACTIONS)).toBe(true);
  });
});

describe.each([
  ["edytor produktu", EDITOR, EDITOR_PAGE],
  ["formularz nowego produktu", NEW_FORM, NEW_PAGE],
])("%s — pole „Kolekcja”", (_label, form, page) => {
  it("renderuje select z nazwą pola i znacznikiem obecności", () => {
    expect(/COLLECTION_FIELD/.test(form)).toBe(true);
    expect(/COLLECTION_PRESENT_FIELD/.test(form)).toBe(true);
    expect(/label="Kolekcja/.test(form)).toBe(true);
  });

  it("strona ładuje listę kolekcji i podaje ją formularzowi", () => {
    expect(/getAllCollections\(\)/.test(page)).toBe(true);
    expect(/collections=\{/.test(page)).toBe(true);
  });
});
