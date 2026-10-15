import { describe, it, expect } from "vitest";
import {
  categoryMatchFilter,
  NO_MATCH_FILTER,
  normalizeExtraCategories,
  extraCategoriesFromForm,
  EXTRA_CATEGORIES_FIELD,
  EXTRA_CATEGORIES_PRESENT_FIELD,
  productCountsByNode,
} from "@/app/_lib/extra-categories";
import type { CategoryNode } from "@/app/_lib/category-tree";

describe("categoryMatchFilter", () => {
  it("jeden slug: kategoria główna LUB dodatkowa", () => {
    expect(categoryMatchFilter(["szybka-dostawa"])).toBe(
      "category.in.(szybka-dostawa),extra_categories.ov.{szybka-dostawa}"
    );
  });

  it("poddrzewo: kolejność zachowana, duplikat raz", () => {
    expect(categoryMatchFilter(["narozniki", "naroznik-l", "narozniki"])).toBe(
      "category.in.(narozniki,naroznik-l),extra_categories.ov.{narozniki,naroznik-l}"
    );
  });

  it("odrzuca slugi, które rozbiłyby składnię PostgREST", () => {
    expect(categoryMatchFilter(["a,b", "x)", "y}", "Sofy", " sofy", "sofy"])).toBe(
      "category.in.(sofy),extra_categories.ov.{sofy}"
    );
  });

  it("pusta lista albo same złe slugi → warunek, który nic nie dopasuje", () => {
    expect(categoryMatchFilter([])).toBe(NO_MATCH_FILTER);
    expect(categoryMatchFilter(["a,b"])).toBe(NO_MATCH_FILTER);
  });
});

// Fabryka węzłów — testy podają tylko to, co dla nich istotne.
function node(partial: Partial<CategoryNode> & { id: string; slug: string }): CategoryNode {
  return {
    label: partial.slug.toUpperCase(),
    label_de: null,
    parent_id: null,
    sort_order: 0,
    active: true,
    crossSellCategories: [],
    ...partial,
  };
}

// meble (0)
//   narozniki (0)
//     naroznik-l (0)
//   fotele (1)
// szybka-dostawa (1)
const TREE: CategoryNode[] = [
  node({ id: "1", slug: "meble", sort_order: 0 }),
  node({ id: "2", slug: "narozniki", parent_id: "1", sort_order: 0 }),
  node({ id: "3", slug: "naroznik-l", parent_id: "2", sort_order: 0 }),
  node({ id: "4", slug: "fotele", parent_id: "1", sort_order: 1 }),
  node({ id: "5", slug: "szybka-dostawa", sort_order: 1 }),
];

describe("normalizeExtraCategories", () => {
  it("tylko istniejące slugi, bez duplikatów, w kolejności drzewa", () => {
    expect(
      normalizeExtraCategories(["szybka-dostawa", "nie-ma", "fotele", "fotele"], "naroznik-l", TREE)
    ).toEqual(["fotele", "szybka-dostawa"]);
  });

  it("usuwa kategorię główną — także gdy główną zmieniono na dawną dodatkową", () => {
    expect(normalizeExtraCategories(["szybka-dostawa", "fotele"], "fotele", TREE)).toEqual([
      "szybka-dostawa",
    ]);
  });

  it("ignoruje wartości niebędące tekstem i przycina spacje", () => {
    expect(normalizeExtraCategories([" szybka-dostawa ", 7, null], "fotele", TREE)).toEqual([
      "szybka-dostawa",
    ]);
  });

  it("pusta lista → pusta lista", () => {
    expect(normalizeExtraCategories([], "fotele", TREE)).toEqual([]);
  });
});

describe("extraCategoriesFromForm", () => {
  it("bez znacznika pola → undefined (kolumny nie ruszamy), nawet gdy są wartości", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_FIELD, "szybka-dostawa");
    expect(extraCategoriesFromForm(fd, "fotele", TREE)).toBeUndefined();
  });

  it("puste drzewo (odczyt kategorii padł) → undefined, nawet ze znacznikiem i wartością", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_PRESENT_FIELD, "1");
    fd.append(EXTRA_CATEGORIES_FIELD, "szybka-dostawa");
    expect(extraCategoriesFromForm(fd, "fotele", [])).toBeUndefined();
  });

  it("znacznik bez zaznaczonych → [] (admin odznaczył wszystko)", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_PRESENT_FIELD, "1");
    expect(extraCategoriesFromForm(fd, "fotele", TREE)).toEqual([]);
  });

  it("znacznik i zaznaczone → lista po normalizacji", () => {
    const fd = new FormData();
    fd.append(EXTRA_CATEGORIES_PRESENT_FIELD, "1");
    fd.append(EXTRA_CATEGORIES_FIELD, "szybka-dostawa");
    fd.append(EXTRA_CATEGORIES_FIELD, "fotele");
    expect(extraCategoriesFromForm(fd, "fotele", TREE)).toEqual(["szybka-dostawa"]);
  });
});

describe("productCountsByNode", () => {
  const PRODUCTS = [
    { category: "naroznik-l" }, // wiersz bez kolumny (sprzed migracji 84)
    { category: "naroznik-l", extra_categories: ["szybka-dostawa"] },
    { category: "fotele", extra_categories: ["szybka-dostawa", "narozniki"] },
    // główna i dodatkowa w tej samej gałęzi — w poddrzewie liczony raz
    { category: "narozniki", extra_categories: ["naroznik-l"] },
  ];
  const counts = productCountsByNode(TREE, PRODUCTS);

  it("własne = główna LUB dodatkowa; ownMain = tylko główna", () => {
    expect(counts.get("naroznik-l")).toEqual({ own: 3, subtree: 3, ownMain: 2 });
    expect(counts.get("fotele")).toEqual({ own: 1, subtree: 1, ownMain: 1 });
  });

  it("poddrzewo liczy produkt raz, nawet z dwiema kategoriami w gałęzi", () => {
    expect(counts.get("narozniki")).toEqual({ own: 2, subtree: 4, ownMain: 1 });
    expect(counts.get("meble")).toEqual({ own: 0, subtree: 4, ownMain: 0 });
  });

  it("kategoria z samymi dopiętymi produktami ma ownMain = 0 (bez alarmu Google)", () => {
    expect(counts.get("szybka-dostawa")).toEqual({ own: 2, subtree: 2, ownMain: 0 });
  });

  it("extra_categories: null to brak dodatkowych", () => {
    const c = productCountsByNode(TREE, [{ category: "fotele", extra_categories: null }]);
    expect(c.get("fotele")).toEqual({ own: 1, subtree: 1, ownMain: 1 });
    expect(c.get("szybka-dostawa")).toEqual({ own: 0, subtree: 0, ownMain: 0 });
  });
});
