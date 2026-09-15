import { describe, it, expect } from "vitest";
import { byBundleSortOrder, validateReorderIds } from "@/app/_lib/bundle-order";

describe("byBundleSortOrder", () => {
  it("sortuje po sort_order rosnąco", () => {
    const rows = [
      { id: "b", sort_order: 2, created_at: "2026-09-01T00:00:00Z" },
      { id: "a", sort_order: 0, created_at: "2026-09-01T00:00:00Z" },
      { id: "c", sort_order: 1, created_at: "2026-09-01T00:00:00Z" },
    ];
    expect([...rows].sort(byBundleSortOrder).map((r) => r.id)).toEqual(["a", "c", "b"]);
  });

  it("przy równym sort_order nowsze pierwsze — tak jak zestawy były sortowane przed migracją 83", () => {
    const rows = [
      { id: "stary", sort_order: 0, created_at: "2026-07-17T00:00:00Z" },
      { id: "nowy", sort_order: 0, created_at: "2026-09-14T00:00:00Z" },
    ];
    expect([...rows].sort(byBundleSortOrder).map((r) => r.id)).toEqual(["nowy", "stary"]);
  });
});

describe("validateReorderIds", () => {
  const uuid = (n: string) => `00000000-0000-4000-8000-00000000000${n}`;

  it("zwraca listę id w podanej kolejności", () => {
    const r = validateReorderIds([{ id: uuid("1") }, { id: uuid("2") }]);
    expect(r).toEqual({ ok: true, ids: [uuid("1"), uuid("2")] });
  });

  it("pusta lista → błąd", () => {
    expect(validateReorderIds([]).ok).toBe(false);
  });

  it("puste albo nie-UUID id odrzuca CAŁE żądanie — RPC przenumerowuje dokładnie to, co dostanie", () => {
    // Samo `.filter(Boolean)` przestawiłoby podzbiór zestawów i zgłosiło sukces.
    expect(validateReorderIds([{ id: uuid("1") }, { id: "" }]).ok).toBe(false);
    expect(validateReorderIds([{ id: uuid("1") }, { id: "system:bundles" }]).ok).toBe(false);
  });

  it("powtórzone id odrzuca — jeden zestaw nie może mieć dwóch pozycji", () => {
    expect(validateReorderIds([{ id: uuid("1") }, { id: uuid("1") }]).ok).toBe(false);
  });
});
