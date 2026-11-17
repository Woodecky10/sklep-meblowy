import { describe, expect, it } from "vitest";
import {
  effectiveGroupSurcharges,
  fabricSizeFromForm,
  fabricSizeIdFromForm,
  needsFabricSize,
  parseSurchargeByCode,
  resolveFabricSizing,
  withGroupSurcharges,
  type FabricSize,
} from "../fabric-sizes";

const GROUPS = [
  { id: "g-std", code: "standard", surcharge: 0 },
  { id: "g-pre", code: "premium", surcharge: 250 },
  { id: "g-hi", code: "premium_high", surcharge: 400 },
];
const FOTEL: FabricSize = { id: "s-fotel", name: "Fotel", sort_order: 0, created_at: "",
  surcharges: { standard: 0, premium: 100, premium_high: 160 } };
const CATS = [{ slug: "fotele", defaultFabricSizeId: "s-fotel" }, { slug: "pufy", defaultFabricSizeId: null }];

describe("parseSurchargeByCode", () => {
  it("zostawia liczby >= 0 zaokrąglone do 2 miejsc", () =>
    expect(parseSurchargeByCode({ premium: 99.999, standard: 0 })).toEqual({ premium: 100, standard: 0 }));
  it("pomija wartości ujemne, NaN i nie-liczby", () =>
    expect(parseSurchargeByCode({ premium: -1, standard: "5", premium_high: NaN, x: 10 })).toEqual({ x: 10 }));
  it("null dla nie-obiektu, tablicy i pustego wyniku", () => {
    expect(parseSurchargeByCode(null)).toBeNull();
    expect(parseSurchargeByCode([1])).toBeNull();
    expect(parseSurchargeByCode({ premium: -1 })).toBeNull();
  });
});

describe("resolveFabricSizing", () => {
  it("własne dopłaty wygrywają z rozmiarem produktu", () =>
    expect(resolveFabricSizing({ category: "fotele", fabric_size_id: "s-fotel", fabric_surcharges: { premium: 50 } }, CATS, [FOTEL]))
      .toEqual({ source: "own", size: null, surcharges: { premium: 50 } }));
  it("rozmiar produktu wygrywa z kategorią", () =>
    expect(resolveFabricSizing({ category: "pufy", fabric_size_id: "s-fotel" }, CATS, [FOTEL]).source).toBe("product"));
  it("bez rozmiaru produktu bierze rozmiar kategorii głównej", () =>
    expect(resolveFabricSizing({ category: "fotele" }, CATS, [FOTEL]))
      .toEqual({ source: "category", size: FOTEL, surcharges: FOTEL.surcharges }));
  it("usunięty rozmiar na produkcie spada do kategorii", () =>
    expect(resolveFabricSizing({ category: "fotele", fabric_size_id: "s-nie-ma" }, CATS, [FOTEL]).source).toBe("category"));
  it("nieznana kategoria, kategoria bez rozmiaru i brak kolumn dają none", () => {
    const none = { source: "none", size: null, surcharges: null };
    expect(resolveFabricSizing({ category: "nie-ma" }, CATS, [FOTEL])).toEqual(none);
    expect(resolveFabricSizing({ category: "pufy", fabric_size_id: undefined, fabric_surcharges: undefined }, CATS, [FOTEL])).toEqual(none);
    expect(resolveFabricSizing({ category: "fotele" }, [{ slug: "fotele" }], [FOTEL])).toEqual(none);
  });
});

describe("effectiveGroupSurcharges", () => {
  it("null → globalne dopłaty grup", () =>
    expect(effectiveGroupSurcharges(GROUPS, null)).toEqual({ "g-std": 0, "g-pre": 250, "g-hi": 400 }));
  it("podmienia grupy wycenione w rozmiarze", () =>
    expect(effectiveGroupSurcharges(GROUPS, FOTEL.surcharges)).toEqual({ "g-std": 0, "g-pre": 100, "g-hi": 160 }));
  it("brak klucza grupy → globalna dopłata, nie 0", () =>
    expect(effectiveGroupSurcharges(GROUPS, { premium: 100 })).toEqual({ "g-std": 0, "g-pre": 100, "g-hi": 400 }));
});

describe("withGroupSurcharges", () => {
  it("zwraca kopie z podmienioną dopłatą, bez mutacji wejścia", () => {
    const out = withGroupSurcharges(GROUPS, { "g-pre": 100 });
    expect(out.map((g) => g.surcharge)).toEqual([0, 100, 400]);
    expect(GROUPS[1].surcharge).toBe(250);
  });
});

describe("needsFabricSize", () => {
  const zTkanina = { options: [{ name: "Tkanina", values: ["Sawana 21"] }] };
  const none = { source: "none" as const, size: null, surcharges: null };
  it("produkt z tkaniną i bez źródła potrzebuje rozmiaru", () => expect(needsFabricSize(zTkanina, none)).toBe(true));
  it("produkt bez opcji Tkanina nie potrzebuje", () => {
    expect(needsFabricSize(null, none)).toBe(false);
    expect(needsFabricSize({ options: [{ name: "Strona", values: ["Lewa"] }] }, none)).toBe(false);
  });
  it("produkt ze źródłem nie potrzebuje", () =>
    expect(needsFabricSize(zTkanina, { source: "category", size: FOTEL, surcharges: FOTEL.surcharges })).toBe(false));
});

const fd = (o: Record<string, string>) => { const f = new FormData(); for (const [k, v] of Object.entries(o)) f.set(k, v); return f; };
const CODES = ["standard", "premium", "premium_high"];
const SIZES = [{ id: "s-fotel" }];

describe("fabricSizeFromForm", () => {
  it("czyta nazwę i kwoty wszystkich grup, przecinek jako separator", () =>
    expect(fabricSizeFromForm(fd({ name: " Fotel ", sort_order: "2", surcharge_standard: "", surcharge_premium: "100", surcharge_premium_high: "160,50" }), CODES))
      .toEqual({ ok: true, name: "Fotel", sort_order: 2, surcharges: { standard: 0, premium: 100, premium_high: 160.5 } }));
  it("odrzuca pustą nazwę", () =>
    expect(fabricSizeFromForm(fd({ name: "  " }), CODES)).toEqual({ ok: false, error: "Nazwa rozmiaru jest wymagana" }));
  it("odrzuca kwotę ujemną i nieliczbową", () => {
    expect(fabricSizeFromForm(fd({ name: "Fotel", surcharge_premium: "-5" }), CODES)).toEqual({ ok: false, error: "Dopłata musi być liczbą nieujemną" });
    expect(fabricSizeFromForm(fd({ name: "Fotel", surcharge_premium: "abc" }), CODES)).toEqual({ ok: false, error: "Dopłata musi być liczbą nieujemną" });
  });
});

describe("fabricSizeIdFromForm", () => {
  it("brak pola → undefined (kolumny nie ruszamy)", () =>
    expect(fabricSizeIdFromForm(new FormData(), "default_fabric_size_id", SIZES)).toBeUndefined());
  it("pusta wartość → null", () =>
    expect(fabricSizeIdFromForm(fd({ default_fabric_size_id: "" }), "default_fabric_size_id", SIZES)).toBeNull());
  it("znane id przechodzi, nieznane → null", () => {
    expect(fabricSizeIdFromForm(fd({ default_fabric_size_id: "s-fotel" }), "default_fabric_size_id", SIZES)).toBe("s-fotel");
    expect(fabricSizeIdFromForm(fd({ default_fabric_size_id: "s-nie-ma" }), "default_fabric_size_id", SIZES)).toBeNull();
  });
});
