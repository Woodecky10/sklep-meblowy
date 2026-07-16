import { describe, it, expect } from "vitest";
import { groupCategoriesForSelect } from "@/app/_lib/categories";

const sections = [
  { slug: "salon", label: "Narożniki" },
  { slug: "sypialnia", label: "ŁÓŻKA" },
  { slug: "materace", label: "MATERACE" },
];

const cats = [
  { slug: "naroznik-l", label: "Narożnik w kształcie L", group_slug: "salon" },
  { slug: "pufy", label: "Narożnik w kształcie U", group_slug: "salon" },
  { slug: "lozka-tapicerowane", label: "Łóżka tapicerowane", group_slug: "sypialnia" },
];

describe("groupCategoriesForSelect", () => {
  it("grupuje kategorie pod sekcją wg group_slug", () => {
    const groups = groupCategoriesForSelect(sections, cats);
    expect(groups).toEqual([
      {
        label: "Narożniki",
        categories: [
          { slug: "naroznik-l", label: "Narożnik w kształcie L" },
          { slug: "pufy", label: "Narożnik w kształcie U" },
        ],
      },
      {
        label: "ŁÓŻKA",
        categories: [{ slug: "lozka-tapicerowane", label: "Łóżka tapicerowane" }],
      },
    ]);
  });

  it("pomija sekcje bez kategorii (np. MATERACE tu puste)", () => {
    const labels = groupCategoriesForSelect(sections, cats).map((g) => g.label);
    expect(labels).not.toContain("MATERACE");
  });

  it("zachowuje kolejność sekcji", () => {
    const labels = groupCategoriesForSelect(sections, cats).map((g) => g.label);
    expect(labels).toEqual(["Narożniki", "ŁÓŻKA"]);
  });

  it("pomija kategorie-sieroty (group_slug bez pasującej sekcji)", () => {
    const orphan = [
      ...cats,
      { slug: "duch", label: "Duch", group_slug: "nieistniejaca" },
    ];
    const allSlugs = groupCategoriesForSelect(sections, orphan)
      .flatMap((g) => g.categories)
      .map((c) => c.slug);
    expect(allSlugs).not.toContain("duch");
  });

  it("puste wejście → pusta lista", () => {
    expect(groupCategoriesForSelect([], [])).toEqual([]);
    expect(groupCategoriesForSelect(sections, [])).toEqual([]);
  });
});
