import { describe, it, expect } from "vitest";
import {
  effectivePrice,
  isOnSale,
  computeOmnibus,
  computePriceUpdates,
} from "@/app/_lib/pricing";

describe("effectivePrice / isOnSale", () => {
  it("sale niższa od regularnej → sale i on-sale", () => {
    expect(effectivePrice(1000, 800)).toBe(800);
    expect(isOnSale(1000, 800)).toBe(true);
  });
  it("sale >= regularna → regularna i NIE on-sale", () => {
    expect(effectivePrice(1000, 1000)).toBe(1000);
    expect(effectivePrice(1000, 1200)).toBe(1000);
    expect(isOnSale(1000, 1000)).toBe(false);
  });
  it("sale null/undefined → regularna, nie on-sale", () => {
    expect(effectivePrice(1000, null)).toBe(1000);
    expect(effectivePrice(1000, undefined)).toBe(1000);
    expect(isOnSale(1000, null)).toBe(false);
  });
});

describe("computeOmnibus — najniższa cena z 30 dni przed obniżką", () => {
  const d = (iso: string) => iso;
  it("cena stała >30 dni, potem obniżka → referencja = cena sprzed obniżki (atWindowStart)", () => {
    const h = [
      { effective_price: 1000, recorded_at: d("2026-04-01T00:00:00Z") },
      { effective_price: 800, recorded_at: d("2026-06-01T00:00:00Z") },
    ];
    expect(computeOmnibus(h)).toBe(1000);
  });
  it("kilka zmian w oknie 30 dni → MIN z okna", () => {
    const h = [
      { effective_price: 1000, recorded_at: d("2026-05-20T00:00:00Z") },
      { effective_price: 900, recorded_at: d("2026-05-25T00:00:00Z") },
      { effective_price: 700, recorded_at: d("2026-06-10T00:00:00Z") }, // obniżka (t0)
    ];
    expect(computeOmnibus(h)).toBe(900);
  });
  it("wcześniejsza promocja w oknie niższa niż regularna → MIN łapie tę promocję", () => {
    const h = [
      { effective_price: 1000, recorded_at: d("2026-05-22T00:00:00Z") },
      { effective_price: 850, recorded_at: d("2026-05-28T00:00:00Z") }, // krótka promo
      { effective_price: 1000, recorded_at: d("2026-05-30T00:00:00Z") }, // powrót
      { effective_price: 750, recorded_at: d("2026-06-12T00:00:00Z") }, // nowa obniżka (t0)
    ];
    expect(computeOmnibus(h)).toBe(850);
  });
  it("brak wcześniejszej historii (tylko bieżący wiersz) → null", () => {
    expect(computeOmnibus([{ effective_price: 800, recorded_at: d("2026-06-10T00:00:00Z") }])).toBeNull();
    expect(computeOmnibus([])).toBeNull();
  });
  it("kolejność wejścia bez znaczenia (sortuje po recorded_at)", () => {
    const h = [
      { effective_price: 700, recorded_at: d("2026-06-10T00:00:00Z") },
      { effective_price: 1000, recorded_at: d("2026-04-01T00:00:00Z") },
    ];
    expect(computeOmnibus(h)).toBe(1000);
  });
});

describe("computePriceUpdates", () => {
  it("wstawia wiersz tylko gdy cena efektywna jednostki się zmieniła", () => {
    const units = [{ variant_key: null, regular: 1000, sale: 800 }];
    const history = [
      { variant_key: null, effective_price: 1000, recorded_at: "2026-05-01T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-10T00:00:00Z");
    expect(plan.inserts).toEqual([{ variant_key: null, effective_price: 800 }]);
    expect(plan.omnibus).toEqual([{ variant_key: null, value: 1000 }]);
  });
  it("brak zmiany ceny → brak insertu i brak zmiany omnibus", () => {
    const units = [{ variant_key: null, regular: 1000, sale: null }];
    const history = [
      { variant_key: null, effective_price: 1000, recorded_at: "2026-05-01T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-10T00:00:00Z");
    expect(plan.inserts).toEqual([]);
    expect(plan.omnibus).toEqual([]);
  });
  it("zejście z promocji (sale usunięte) → omnibus = null dla tej jednostki", () => {
    const units = [{ variant_key: "Kolor=Beż", regular: 1000, sale: null }];
    const history = [
      { variant_key: "Kolor=Beż", effective_price: 1000, recorded_at: "2026-04-01T00:00:00Z" },
      { variant_key: "Kolor=Beż", effective_price: 800, recorded_at: "2026-06-01T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-15T00:00:00Z");
    expect(plan.inserts).toEqual([{ variant_key: "Kolor=Beż", effective_price: 1000 }]);
    expect(plan.omnibus).toEqual([{ variant_key: "Kolor=Beż", value: null }]);
  });
  it("dwie kombinacje — tylko zmieniona trafia do planu", () => {
    const units = [
      { variant_key: "Kolor=Beż", regular: 1000, sale: 700 },
      { variant_key: "Kolor=Granat", regular: 1000, sale: null },
    ];
    const history = [
      { variant_key: "Kolor=Beż", effective_price: 1000, recorded_at: "2026-05-20T00:00:00Z" },
      { variant_key: "Kolor=Granat", effective_price: 1000, recorded_at: "2026-05-20T00:00:00Z" },
    ];
    const plan = computePriceUpdates(units, history, "2026-06-10T00:00:00Z");
    expect(plan.inserts).toEqual([{ variant_key: "Kolor=Beż", effective_price: 700 }]);
    expect(plan.omnibus).toEqual([{ variant_key: "Kolor=Beż", value: 1000 }]);
  });
});

