import { describe, it, expect } from "vitest";
import {
  addRecentlyViewed,
  RECENTLY_VIEWED_MAX,
  type RecentlyViewedItem,
} from "@/app/_lib/recently-viewed";

const item = (id: string, price = 100): RecentlyViewedItem => ({
  id,
  name: `Produkt ${id}`,
  price,
  image: `${id}.jpg`,
  category: "sofy",
});

describe("addRecentlyViewed — lista ostatnio oglądanych", () => {
  it("dokłada nowy produkt na początek", () => {
    const result = addRecentlyViewed([item("a"), item("b")], item("c"));
    expect(result.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("istniejący produkt przesuwa na początek bez duplikatu", () => {
    const result = addRecentlyViewed([item("a"), item("b"), item("c")], item("c"));
    expect(result.map((p) => p.id)).toEqual(["c", "a", "b"]);
  });

  it("aktualizuje snapshot przy ponownym obejrzeniu (nowa cena)", () => {
    const result = addRecentlyViewed([item("a", 100)], item("a", 199));
    expect(result).toHaveLength(1);
    expect(result[0].price).toBe(199);
  });

  it("przycina do max (najstarszy wypada)", () => {
    const full = Array.from({ length: RECENTLY_VIEWED_MAX }, (_, i) => item(`p${i}`));
    const result = addRecentlyViewed(full, item("nowy"));
    expect(result).toHaveLength(RECENTLY_VIEWED_MAX);
    expect(result[0].id).toBe("nowy");
    expect(result.map((p) => p.id)).not.toContain(`p${RECENTLY_VIEWED_MAX - 1}`);
  });

  it("respektuje przekazany max", () => {
    const result = addRecentlyViewed([item("a"), item("b")], item("c"), 2);
    expect(result.map((p) => p.id)).toEqual(["c", "a"]);
  });

  it("nie mutuje wejścia", () => {
    const input = [item("a"), item("b")];
    addRecentlyViewed(input, item("c"));
    expect(input.map((p) => p.id)).toEqual(["a", "b"]);
  });
});
