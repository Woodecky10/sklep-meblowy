import { describe, it, expect } from "vitest";
import {
  buildTree,
  descendantSlugs,
  pathTo,
  effectiveActive,
  menuProjection,
  flattenForSelect,
  allowedParents,
  resolveCategoryFilter,
  subtreeProductCounts,
  type CategoryNode,
} from "@/app/_lib/category-tree";

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

// Drzewo używane przez większość testów:
// meble (0)
//   narozniki (0)
//     naroznik-modulowy (0)
//     naroznik-l (1)
//   sofy (1)
//     sofa-2 (0)
// inspiracje (1)
const TREE: CategoryNode[] = [
  node({ id: "1", slug: "meble", sort_order: 0 }),
  node({ id: "2", slug: "narozniki", parent_id: "1", sort_order: 0 }),
  node({ id: "3", slug: "naroznik-modulowy", parent_id: "2", sort_order: 0 }),
  node({ id: "4", slug: "naroznik-l", parent_id: "2", sort_order: 1 }),
  node({ id: "5", slug: "sofy", parent_id: "1", sort_order: 1 }),
  node({ id: "6", slug: "sofa-2", parent_id: "5", sort_order: 0 }),
  node({ id: "7", slug: "inspiracje", sort_order: 1 }),
];

describe("buildTree", () => {
  it("składa las z płaskiej listy i liczy głębokość od zera", () => {
    const tree = buildTree(TREE);
    expect(tree.map((n) => n.slug)).toEqual(["meble", "inspiracje"]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children.map((n) => n.slug)).toEqual(["narozniki", "sofy"]);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children.map((n) => n.slug)).toEqual([
      "naroznik-modulowy",
      "naroznik-l",
    ]);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("sortuje rodzeństwo po sort_order, a przy remisie po etykiecie", () => {
    const nodes = [
      node({ id: "a", slug: "zeta", label: "Zeta", sort_order: 0 }),
      node({ id: "b", slug: "alfa", label: "Alfa", sort_order: 0 }),
      node({ id: "c", slug: "pierwszy", label: "Pierwszy", sort_order: -1 }),
    ];
    expect(buildTree(nodes).map((n) => n.slug)).toEqual(["pierwszy", "alfa", "zeta"]);
  });

  it("traktuje sierotę (rodzic nie istnieje) jako korzeń", () => {
    const nodes = [node({ id: "1", slug: "sierota", parent_id: "nie-ma-mnie" })];
    const tree = buildTree(nodes);
    expect(tree.map((n) => n.slug)).toEqual(["sierota"]);
    expect(tree[0].depth).toBe(0);
  });

  it("nie gubi węzłów w cyklu (i nie wisi)", () => {
    const nodes = [
      node({ id: "a", slug: "a", parent_id: "b" }),
      node({ id: "b", slug: "b", parent_id: "a" }),
    ];
    const tree = buildTree(nodes);
    const slugs: string[] = [];
    const walk = (list: typeof tree) => {
      for (const n of list) {
        slugs.push(n.slug);
        walk(n.children);
      }
    };
    walk(tree);
    expect(slugs.sort()).toEqual(["a", "b"]);
  });

  it("nie mutuje wejścia", () => {
    const nodes = [node({ id: "1", slug: "x" })];
    buildTree(nodes);
    expect(nodes[0]).not.toHaveProperty("children");
  });
});

describe("descendantSlugs", () => {
  it("zwraca własny slug plus całe poddrzewo", () => {
    expect(descendantSlugs(TREE, "narozniki")).toEqual([
      "narozniki",
      "naroznik-modulowy",
      "naroznik-l",
    ]);
  });

  it("dla liścia zwraca tylko jego slug", () => {
    expect(descendantSlugs(TREE, "sofa-2")).toEqual(["sofa-2"]);
  });

  it("dla korzenia zbiera wszystko pod nim", () => {
    expect(descendantSlugs(TREE, "meble").sort()).toEqual(
      ["meble", "narozniki", "naroznik-modulowy", "naroznik-l", "sofy", "sofa-2"].sort()
    );
  });

  it("dla nieznanego sluga zwraca pustą listę", () => {
    expect(descendantSlugs(TREE, "nie-ma-takiej")).toEqual([]);
  });

  it("nie wisi na cyklu", () => {
    const nodes = [
      node({ id: "a", slug: "a", parent_id: "b" }),
      node({ id: "b", slug: "b", parent_id: "a" }),
    ];
    expect(descendantSlugs(nodes, "a").sort()).toEqual(["a", "b"]);
  });

  it("zbiera też poddrzewo węzłów nieaktywnych", () => {
    const nodes = [
      node({ id: "1", slug: "rodzic" }),
      node({ id: "2", slug: "ukryte-dziecko", parent_id: "1", active: false }),
    ];
    expect(descendantSlugs(nodes, "rodzic")).toEqual(["rodzic", "ukryte-dziecko"]);
  });
});

describe("pathTo", () => {
  it("zwraca ścieżkę od korzenia do węzła", () => {
    expect(pathTo(TREE, "naroznik-l").map((n) => n.slug)).toEqual([
      "meble",
      "narozniki",
      "naroznik-l",
    ]);
  });

  it("dla korzenia zwraca jednoelementową ścieżkę", () => {
    expect(pathTo(TREE, "meble").map((n) => n.slug)).toEqual(["meble"]);
  });

  it("dla nieznanego sluga zwraca pustą ścieżkę", () => {
    expect(pathTo(TREE, "nie-ma-takiej")).toEqual([]);
  });

  it("nie wisi na cyklu", () => {
    const nodes = [
      node({ id: "a", slug: "a", parent_id: "b" }),
      node({ id: "b", slug: "b", parent_id: "a" }),
    ];
    expect(pathTo(nodes, "a").length).toBeLessThanOrEqual(2);
  });
});

describe("effectiveActive", () => {
  it("ukryty przodek chowa całe poddrzewo", () => {
    const nodes = [
      node({ id: "1", slug: "meble", active: false }),
      node({ id: "2", slug: "narozniki", parent_id: "1", active: true }),
      node({ id: "3", slug: "naroznik-l", parent_id: "2", active: true }),
      node({ id: "4", slug: "inne", active: true }),
    ];
    const visible = effectiveActive(nodes);
    expect(visible.has("inne")).toBe(true);
    expect(visible.has("meble")).toBe(false);
    expect(visible.has("narozniki")).toBe(false);
    expect(visible.has("naroznik-l")).toBe(false);
  });

  it("aktywny węzeł pod aktywnym rodzicem jest widoczny", () => {
    expect(effectiveActive(TREE).size).toBe(TREE.length);
  });

  it("sierota jest widoczna (rodzica nie ma, więc nie ma kto jej ukryć)", () => {
    const nodes = [node({ id: "1", slug: "sierota", parent_id: "nie-ma-mnie" })];
    expect(effectiveActive(nodes).has("sierota")).toBe(true);
  });
});

describe("menuProjection", () => {
  it("pokazuje trzy poziomy i odcina czwarty", () => {
    const nodes = [
      ...TREE,
      node({ id: "8", slug: "modulowy-2os", parent_id: "3", sort_order: 0 }),
    ];
    const menu = menuProjection(nodes);
    const meble = menu.find((n) => n.slug === "meble")!;
    const narozniki = meble.children.find((n) => n.slug === "narozniki")!;
    const modulowy = narozniki.children.find((n) => n.slug === "naroznik-modulowy")!;
    expect(modulowy.children).toEqual([]);
  });

  it("pomija poddrzewo ukrytego przodka", () => {
    const nodes = [
      node({ id: "1", slug: "meble", active: false }),
      node({ id: "2", slug: "narozniki", parent_id: "1" }),
    ];
    expect(menuProjection(nodes)).toEqual([]);
  });

  it("respektuje maxDepth podany jawnie (stopka bierze dwa poziomy)", () => {
    const menu = menuProjection(TREE, 2);
    const meble = menu.find((n) => n.slug === "meble")!;
    expect(meble.children.map((n) => n.slug)).toEqual(["narozniki", "sofy"]);
    expect(meble.children[0].children).toEqual([]);
  });
});

describe("flattenForSelect", () => {
  it("grupuje po korzeniu i podaje głębokość każdej opcji", () => {
    const groups = flattenForSelect(TREE);
    expect(groups.map((g) => g.label)).toEqual(["MEBLE", "INSPIRACJE"]);
    expect(groups[0].options).toEqual([
      { slug: "meble", label: "MEBLE", depth: 0 },
      { slug: "narozniki", label: "NAROZNIKI", depth: 1 },
      { slug: "naroznik-modulowy", label: "NAROZNIK-MODULOWY", depth: 2 },
      { slug: "naroznik-l", label: "NAROZNIK-L", depth: 2 },
      { slug: "sofy", label: "SOFY", depth: 1 },
      { slug: "sofa-2", label: "SOFA-2", depth: 2 },
    ]);
  });

  it("korzeń bez dzieci daje grupę z jedną opcją (produkt może wisieć na nim)", () => {
    const groups = flattenForSelect([node({ id: "1", slug: "schodki" })]);
    expect(groups).toEqual([
      { label: "SCHODKI", options: [{ slug: "schodki", label: "SCHODKI", depth: 0 }] },
    ]);
  });

  // W przeciwieństwie do menuProjection ta funkcja NIE filtruje widoczności:
  // decyduje caller. Formularz „nowy produkt" podaje getCategories() (widoczne),
  // a edytor istniejącego produktu getAllCategories() — inaczej produkt siedzący
  // w ukrytej kategorii nie miałby swojej wartości na liście i „Zapisz"
  // przeniósłby go po cichu do pierwszej opcji.
  it("NIE filtruje ukrytych gałęzi — widoczność jest decyzją wołającego", () => {
    const nodes = [
      node({ id: "1", slug: "meble" }),
      node({ id: "2", slug: "ukryte", parent_id: "1", active: false }),
    ];
    expect(flattenForSelect(nodes)[0].options.map((o) => o.slug)).toEqual([
      "meble",
      "ukryte",
    ]);
  });
});

describe("allowedParents", () => {
  it("nie pozwala wybrać samego siebie ani własnego potomka", () => {
    const slugs = allowedParents(TREE, "2").map((p) => p.id);
    expect(slugs).not.toContain("2"); // sam węzeł
    expect(slugs).not.toContain("3"); // dziecko
    expect(slugs).not.toContain("4"); // dziecko
    expect(slugs).toContain("1"); // rodzic
    expect(slugs).toContain("5"); // rodzeństwo
    expect(slugs).toContain("7"); // inny korzeń
  });

  it("dla nowego węzła (bez id) zwraca całe drzewo", () => {
    expect(allowedParents(TREE, "").length).toBe(TREE.length);
  });

  it("podaje głębokość do wcięcia w liście", () => {
    const parents = allowedParents(TREE, "7");
    expect(parents.find((p) => p.id === "3")?.depth).toBe(2);
  });
});

describe("resolveCategoryFilter", () => {
  it("kategoria wygrywa nad legacy sekcja", () => {
    const res = resolveCategoryFilter(TREE, { kategoria: "sofy", sekcja: "meble" });
    expect(res).toEqual({ slug: "sofy", slugs: ["sofy", "sofa-2"] });
  });

  it("sekcja działa, gdy nie ma kategorii (stare zaindeksowane linki)", () => {
    const res = resolveCategoryFilter(TREE, { sekcja: "sofy" });
    expect(res?.slug).toBe("sofy");
    expect(res?.slugs).toEqual(["sofy", "sofa-2"]);
  });

  it("brak obu parametrów to brak filtra", () => {
    expect(resolveCategoryFilter(TREE, {})).toBeNull();
    expect(resolveCategoryFilter(TREE, { kategoria: "  " })).toBeNull();
  });

  it("nieznany slug daje pustą listę slugów, nie brak filtra", () => {
    expect(resolveCategoryFilter(TREE, { kategoria: "nie-ma" })).toEqual({
      slug: "nie-ma",
      slugs: [],
    });
  });
});

describe("subtreeProductCounts", () => {
  it("liczy własne i z poddrzewa", () => {
    const counts = subtreeProductCounts(TREE, {
      "naroznik-modulowy": 3,
      "naroznik-l": 7,
      "sofa-2": 8,
      meble: 1,
    });
    expect(counts.get("naroznik-modulowy")).toEqual({ own: 3, subtree: 3 });
    expect(counts.get("narozniki")).toEqual({ own: 0, subtree: 10 });
    expect(counts.get("meble")).toEqual({ own: 1, subtree: 19 });
    expect(counts.get("inspiracje")).toEqual({ own: 0, subtree: 0 });
  });
});
