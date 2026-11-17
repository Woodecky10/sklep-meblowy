import { describe, expect, it } from "vitest";
import {
  effectiveGroupSurcharges,
  fabricSizeFromForm,
  fabricSizeIdFromForm,
  fabricSizingChanged,
  groupSurchargeLabel,
  groupSurchargesByProduct,
  productFabricSizingFromForm,
  needsFabricSize,
  parseSurchargeByCode,
  resolveFabricSizing,
  sizeOptionsWithCurrent,
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

describe("groupSurchargesByProduct", () => {
  const SOFA: FabricSize = { id: "s-sofa", name: "Sofa", sort_order: 1, created_at: "",
    surcharges: { premium: 200 } };
  const cats = [...CATS, { slug: "sofy", defaultFabricSizeId: "s-sofa" }];

  it("dwa meble różnych rozmiarów → różne kwoty dla tego samego kodu grupy", () => {
    const out = groupSurchargesByProduct(
      [{ id: "fotel", category: "fotele" }, { id: "sofa", category: "sofy" }],
      GROUPS, cats, [FOTEL, SOFA]
    );
    expect(out.fotel.premium).toBe(100);
    expect(out.sofa.premium).toBe(200);
  });
  it("grupa bez klucza w rozmiarze → globalna dopłata, kluczem jest kod grupy", () =>
    expect(groupSurchargesByProduct([{ id: "sofa", category: "sofy" }], GROUPS, cats, [SOFA]))
      .toEqual({ sofa: { standard: 0, premium: 200, premium_high: 400 } }));
  it("produkt bez rozmiaru → globalne dopłaty grup", () =>
    expect(groupSurchargesByProduct([{ id: "puf", category: "pufy" }], GROUPS, cats, [FOTEL, SOFA]))
      .toEqual({ puf: { standard: 0, premium: 250, premium_high: 400 } }));
  it("własne dopłaty produktu wygrywają z rozmiarem kategorii", () =>
    expect(groupSurchargesByProduct(
      [{ id: "fotel", category: "fotele", fabric_surcharges: { premium: 50 } }], GROUPS, cats, [FOTEL]
    ).fotel.premium).toBe(50));
});

describe("groupSurchargeLabel", () => {
  const STD = { code: "standard", surcharge: 0 };
  const PRE = { code: "premium", surcharge: 250 };

  it("rozmiar wycenia grupę inaczej niż globalnie → zależy od mebla", () =>
    expect(groupSurchargeLabel(PRE, [FOTEL])).toEqual({ kind: "depends" }));
  it("bez rozmiarów → kwota grupy", () =>
    expect(groupSurchargeLabel(PRE, [])).toEqual({ kind: "amount", amount: 250 }));
  it("grupa bez dopłaty i bez korekty → bez dopłaty", () =>
    expect(groupSurchargeLabel(STD, [FOTEL])).toEqual({ kind: "none" }));
  it("grupa 0 + korekta tkaniny > 0, rozmiary nie wyceniają grupy inaczej → kwota korekty, nie „zależy”", () =>
    expect(groupSurchargeLabel(STD, [FOTEL, { surcharges: { premium: 100 } }], 20))
      .toEqual({ kind: "amount", amount: 20 }));
  it("rozmiar z dopłatą w grupie standard (globalnie 0) → zależy od mebla, nie „bez dopłaty”", () =>
    expect(groupSurchargeLabel(STD, [{ surcharges: { standard: 50 } }])).toEqual({ kind: "depends" }));
  it("rozmiar równy globalnej dopłacie albo bez klucza grupy → nie zależy", () =>
    expect(groupSurchargeLabel(PRE, [{ surcharges: { premium: 250 } }, { surcharges: {} }], 10))
      .toEqual({ kind: "amount", amount: 260 }));
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
  it("czyta nazwę i kwoty grup, przecinek jako separator; puste pole pomija grupę (= globalna dopłata)", () =>
    expect(fabricSizeFromForm(fd({ name: " Fotel ", sort_order: "2", surcharge_standard: "", surcharge_premium: "100", surcharge_premium_high: "160,50" }), CODES))
      .toEqual({ ok: true, name: "Fotel", sort_order: 2, surcharges: { premium: 100, premium_high: 160.5 } }));
  it("wpisane 0 zostaje 0; brak pola w formularzu pomija grupę", () =>
    expect(fabricSizeFromForm(fd({ name: "Fotel", surcharge_standard: "0", surcharge_premium: " " }), CODES))
      .toEqual({ ok: true, name: "Fotel", sort_order: 0, surcharges: { standard: 0 } }));
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

describe("productFabricSizingFromForm", () => {
  it("bez znacznika → undefined", () => expect(productFabricSizingFromForm(new FormData(), CODES, SIZES)).toBeUndefined());
  it("pusty wybór → rozmiar z kategorii", () =>
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "" }), CODES, SIZES)).toEqual({ fabric_size_id: null, fabric_surcharges: null }));
  it("wybrany rozmiar czyści własne dopłaty", () =>
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "s-fotel", own_surcharge_premium: "50" }), CODES, SIZES)).toEqual({ fabric_size_id: "s-fotel", fabric_surcharges: null }));
  it("nieznany rozmiar → null/null", () =>
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "s-nie-ma" }), CODES, SIZES)).toEqual({ fabric_size_id: null, fabric_surcharges: null }));
  it("własne dopłaty: puste i brakujące pola pomijają grupę (= globalna dopłata), nie 0", () =>
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own", own_surcharge_standard: "", own_surcharge_premium: "120" }), CODES, SIZES))
      .toEqual({ fabric_size_id: null, fabric_surcharges: { premium: 120 } }));
  it("własne dopłaty: wpisane 0 zostaje 0", () =>
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own", own_surcharge_standard: "0", own_surcharge_premium: "0,5" }), CODES, SIZES))
      .toEqual({ fabric_size_id: null, fabric_surcharges: { standard: 0, premium: 0.5 } }));
  it("własne dopłaty bez żadnej kwoty (puste albo brak pól) → brak własnych dopłat", () => {
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own", own_surcharge_premium: "" }), CODES, SIZES))
      .toEqual({ fabric_size_id: null, fabric_surcharges: null });
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own" }), CODES, SIZES))
      .toEqual({ fabric_size_id: null, fabric_surcharges: null });
  });
  it("własne dopłaty z kwotą ujemną → błąd", () =>
    expect(productFabricSizingFromForm(fd({ fabric_size_present: "1", fabric_size_id: "__own", own_surcharge_premium: "-1" }), CODES, SIZES)).toEqual({ error: "Dopłata musi być liczbą nieujemną" }));
});

describe("sizeOptionsWithCurrent", () => {
  const LIST = [{ id: "s-fotel", name: "Fotel" }];
  it("bieżący rozmiar jest na liście → lista bez zmian", () =>
    expect(sizeOptionsWithCurrent(LIST, "s-fotel", "Obecny")).toEqual(LIST));
  it("brak bieżącego rozmiaru → lista bez zmian", () => {
    expect(sizeOptionsWithCurrent(LIST, null, "Obecny")).toEqual(LIST);
    expect(sizeOptionsWithCurrent(LIST, undefined, "Obecny")).toEqual(LIST);
  });
  it("bieżącego rozmiaru nie ma na liście (lista się nie wczytała) → dokłada go, żeby select go nie zgubił", () => {
    expect(sizeOptionsWithCurrent(LIST, "s-inny", "Obecny")).toEqual([...LIST, { id: "s-inny", name: "Obecny" }]);
    expect(sizeOptionsWithCurrent([], "s-inny", "Obecny")).toEqual([{ id: "s-inny", name: "Obecny" }]);
  });
});

describe("fabricSizingChanged", () => {
  const base = { category: "fotele", fabric_size_id: "s-fotel", fabric_surcharges: null };
  it("te same wartości → bez zmiany", () =>
    expect(fabricSizingChanged(base, { ...base })).toBe(false));
  it("brak kolumn (undefined) = null", () =>
    expect(fabricSizingChanged({ category: "fotele" }, { category: "fotele", fabric_size_id: null, fabric_surcharges: null })).toBe(false));
  it("zmiana kategorii głównej albo rozmiaru → zmiana", () => {
    expect(fabricSizingChanged(base, { ...base, category: "sofy" })).toBe(true);
    expect(fabricSizingChanged(base, { ...base, fabric_size_id: null })).toBe(true);
  });
  it("własne dopłaty porównywane po wartościach, nie po kolejności kluczy", () => {
    const a = { ...base, fabric_surcharges: { premium: 100, standard: 0 } };
    expect(fabricSizingChanged(a, { ...base, fabric_surcharges: { standard: 0, premium: 100 } })).toBe(false);
    expect(fabricSizingChanged(a, { ...base, fabric_surcharges: { standard: 0, premium: 120 } })).toBe(true);
    expect(fabricSizingChanged(a, { ...base, fabric_surcharges: { premium: 100 } })).toBe(true);
    expect(fabricSizingChanged(a, base)).toBe(true);
  });
  it("puste własne dopłaty ({}) = brak", () =>
    expect(fabricSizingChanged({ ...base, fabric_surcharges: {} }, base)).toBe(false));
});
