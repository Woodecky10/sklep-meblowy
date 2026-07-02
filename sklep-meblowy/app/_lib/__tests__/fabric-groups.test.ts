import { describe, it, expect } from "vitest";
import {
  groupFabricsByCategory,
  groupSelectionState,
  NO_CATEGORY_LABEL,
  type FabricGroup,
} from "@/app/_lib/fabric-groups";
import type { Fabric } from "@/app/_lib/types";

// Minimalna fabryka tkaniny — tylko pola używane przez grupowanie.
function fab(name: string, category: string | null): Fabric {
  return {
    id: name,
    name,
    name_de: null,
    colors: [],
    color_images: {},
    price: 0,
    sort_order: 0,
    category,
    created_at: "",
  };
}

describe("groupFabricsByCategory", () => {
  it("grupuje po kategorii, sortuje kategorie alfabetycznie (pl)", () => {
    const out = groupFabricsByCategory([
      fab("Welur A", "Welur"),
      fab("Sztruks A", "Sztruks"),
      fab("Welur B", "Welur"),
    ]);
    expect(out.map((g) => g.category)).toEqual(["Sztruks", "Welur"]);
    expect(out.find((g) => g.category === "Welur")!.fabrics.map((f) => f.name)).toEqual([
      "Welur A",
      "Welur B",
    ]);
  });

  it("null/puste/whitespace → grupa 'Bez kategorii' ZAWSZE na końcu", () => {
    const out = groupFabricsByCategory([
      fab("X", null),
      fab("Y", "   "),
      fab("Aaa", "Aaa"),
    ]);
    expect(out.map((g) => g.category)).toEqual(["Aaa", NO_CATEGORY_LABEL]);
    expect(out[1].fabrics.map((f) => f.name)).toEqual(["X", "Y"]);
  });

  it("'Bez kategorii' jest ostatnia nawet gdy realna kategoria sortuje się po niej (Zamsz > Bez)", () => {
    const out = groupFabricsByCategory([fab("Zamsz 1", "Zamsz"), fab("Orphan", null)]);
    expect(out.map((g) => g.category)).toEqual(["Zamsz", NO_CATEGORY_LABEL]);
  });

  it("puste wejście → []", () => {
    expect(groupFabricsByCategory([])).toEqual([]);
  });

  it("category z białymi znakami jest trymowane do wspólnej grupy", () => {
    const out = groupFabricsByCategory([fab("A", "Welur"), fab("B", "  Welur  ")]);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("Welur");
  });
});

describe("groupSelectionState", () => {
  const group: FabricGroup = { category: "Welur", fabrics: [fab("A", "Welur"), fab("B", "Welur")] };
  it("żadna zaznaczona → none", () => {
    expect(groupSelectionState(group, new Set())).toBe("none");
  });
  it("część zaznaczona → some", () => {
    expect(groupSelectionState(group, new Set(["A"]))).toBe("some");
  });
  it("wszystkie zaznaczone → all", () => {
    expect(groupSelectionState(group, new Set(["A", "B"]))).toBe("all");
  });
  it("pusta grupa → none", () => {
    expect(groupSelectionState({ category: "X", fabrics: [] }, new Set())).toBe("none");
  });
});
