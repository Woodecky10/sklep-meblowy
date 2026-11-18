import { describe, it, expect } from "vitest";
import { mapDe, VARIANT_OPTION_DE } from "../de-content-maps";
import { localizedOptionName, missingVariantOptions, missingBundleGroups } from "../variant-missing";

const P = { variants: { options: [
  { name: "Tkanina", values: ["Sawana 21"] },
  { name: "Strona", values: ["Lewa", "Prawa"] },
] } };

describe("localizedOptionName", () => {
  it("bez nadpisania zwraca nazwę opcji", () => expect(localizedOptionName(P, "Tkanina", "pl")).toBe("Tkanina"));
  it("nadpisanie admina wygrywa", () =>
    expect(localizedOptionName({ variants: { ...P.variants, overrides: { option_names: { Strona: "Strona narożnika" } } } }, "Strona", "pl")).toBe("Strona narożnika"));
  it("na DE tłumaczy z mapy", () =>
    expect(localizedOptionName(P, "Tkanina", "de")).toBe(mapDe(VARIANT_OPTION_DE, "Tkanina") ?? "Tkanina"));
  it("bez produktu zwraca nazwę", () => expect(localizedOptionName(undefined, "Tkanina", "pl")).toBe("Tkanina"));
});

describe("missingVariantOptions", () => {
  it("nic nie wybrano → wszystkie opcje, w kolejności A-Z po etykiecie", () =>
    expect(missingVariantOptions(P, {}, "pl")).toEqual([{ name: "Strona", label: "Strona" }, { name: "Tkanina", label: "Tkanina" }]));
  it("wybrana opcja znika z listy", () =>
    expect(missingVariantOptions(P, { Strona: "Lewa" }, "pl")).toEqual([{ name: "Tkanina", label: "Tkanina" }]));
  it("pusty string to brak wyboru", () =>
    expect(missingVariantOptions(P, { Strona: "", Tkanina: "Sawana 21" }, "pl").map((m) => m.name)).toEqual(["Strona"]));
  it("komplet i produkt bez wariantów → []", () => {
    expect(missingVariantOptions(P, { Strona: "Lewa", Tkanina: "Sawana 21" }, "pl")).toEqual([]);
    expect(missingVariantOptions({ variants: null }, {}, "pl")).toEqual([]);
    expect(missingVariantOptions({ variants: { options: [] } }, {}, "pl")).toEqual([]);
  });
  it("etykieta bierze nadpisanie admina", () =>
    expect(missingVariantOptions({ variants: { ...P.variants, overrides: { option_names: { Strona: "Bok" } } } }, { Tkanina: "Sawana 21" }, "pl"))
      .toEqual([{ name: "Strona", label: "Bok" }]));
});

describe("missingBundleGroups", () => {
  const sofa = { id: "s", name: "Sofa Mio", ...P };
  const puf = { id: "p", name: "Pufa Mio", variants: null };
  const fotel = { id: "f", name: "Fotel Mio", variants: { options: [{ name: "Tkanina", values: ["Sawana 21"] }] } };
  it("wymienia tylko meble z brakami, w kolejności zestawu", () =>
    expect(missingBundleGroups([sofa, puf, fotel], { s: { Strona: "Lewa" } }, "pl")).toEqual([
      { title: "Sofa Mio", labels: ["Tkanina"] },
      { title: "Fotel Mio", labels: ["Tkanina"] },
    ]));
  it("komplet → []", () =>
    expect(missingBundleGroups([sofa, puf], { s: { Strona: "Lewa", Tkanina: "Sawana 21" } }, "pl")).toEqual([]));
  it("brak wpisu w selections = nic nie wybrano", () =>
    expect(missingBundleGroups([fotel], {}, "pl")).toEqual([{ title: "Fotel Mio", labels: ["Tkanina"] }]));
});
