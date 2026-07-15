import { describe, it, expect } from "vitest";
import {
  MENU_LOCATIONS,
  isMenuLocation,
  NAVBAR_MAX_INLINE,
  prepareMenuItems,
  splitNavbarItems,
  type MenuItemRow,
  type LocalizedMenuItem,
} from "@/app/_lib/menu";

const row = (over: Partial<MenuItemRow>): MenuItemRow => ({
  id: "i1",
  location: "navbar",
  page_id: "p1",
  label: null,
  label_de: null,
  sort_order: 0,
  visible: true,
  page: { slug: "pielegnacja", title: "Pielęgnacja", title_de: null, published: true },
  ...over,
});

describe("isMenuLocation", () => {
  it("navbar/footer tak, reszta nie", () => {
    expect(MENU_LOCATIONS).toEqual(["navbar", "footer"]);
    expect(isMenuLocation("navbar")).toBe(true);
    expect(isMenuLocation("footer")).toBe(true);
    expect(isMenuLocation("sidebar")).toBe(false);
  });
});

describe("prepareMenuItems", () => {
  it("null (błąd fetch) → pusta lista (fail-open)", () => {
    expect(prepareMenuItems(null, "navbar", "pl")).toEqual([]);
  });
  it("filtruje: lokację, niewidoczne, strony nieopublikowane i pozycje bez strony", () => {
    const rows = [
      row({ id: "ok" }),
      row({ id: "zla-lokacja", location: "footer" }),
      row({ id: "ukryta", visible: false }),
      row({ id: "szkic", page: { slug: "s", title: "S", title_de: null, published: false } }),
      row({ id: "sierota", page: null }),
    ];
    expect(prepareMenuItems(rows, "navbar", "pl").map((i) => i.id)).toEqual(["ok"]);
  });
  it("sortuje po sort_order z tie-breakiem po id; href = /slug", () => {
    const rows = [
      row({ id: "b", sort_order: 1 }),
      row({ id: "a", sort_order: 1 }),
      row({ id: "c", sort_order: 0 }),
    ];
    const items = prepareMenuItems(rows, "navbar", "pl");
    expect(items.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(items[0].href).toBe("/pielegnacja");
  });
  it("etykieta: własna wygrywa nad tytułem; DE per pole z fallbackiem PL", () => {
    const rows = [
      row({
        id: "custom",
        label: "Porady",
        label_de: "Tipps",
        page: { slug: "x", title: "Pielęgnacja", title_de: "Möbelpflege", published: true },
      }),
      row({
        id: "custom-pl-only",
        sort_order: 1,
        label: "Porady",
        page: { slug: "y", title: "T", title_de: null, published: true },
      }),
      row({
        id: "tytul",
        sort_order: 2,
        page: { slug: "z", title: "Pielęgnacja", title_de: "Möbelpflege", published: true },
      }),
      row({
        id: "tytul-pl",
        sort_order: 3,
        label: "   ",
        page: { slug: "w", title: "Tylko PL", title_de: "", published: true },
      }),
    ];
    const pl = prepareMenuItems(rows, "navbar", "pl").map((i) => i.label);
    const de = prepareMenuItems(rows, "navbar", "de").map((i) => i.label);
    expect(pl).toEqual(["Porady", "Porady", "Pielęgnacja", "Tylko PL"]);
    expect(de).toEqual(["Tipps", "Porady", "Möbelpflege", "Tylko PL"]);
  });
});

describe("splitNavbarItems", () => {
  const make = (n: number): LocalizedMenuItem[] =>
    Array.from({ length: n }, (_, i) => ({ id: `i${i}`, href: `/p${i}`, label: `P${i}` }));
  it("do 4 pozycji wszystko inline, bez overflow", () => {
    expect(splitNavbarItems(make(0))).toEqual({ inline: [], overflow: [] });
    const four = splitNavbarItems(make(4));
    expect(four.inline).toHaveLength(4);
    expect(four.overflow).toHaveLength(0);
  });
  it("powyżej 4: pierwsze 4 inline, reszta w overflow (Więcej)", () => {
    const six = splitNavbarItems(make(6));
    expect(six.inline.map((i) => i.id)).toEqual(["i0", "i1", "i2", "i3"]);
    expect(six.overflow.map((i) => i.id)).toEqual(["i4", "i5"]);
    expect(NAVBAR_MAX_INLINE).toBe(4);
  });
});
