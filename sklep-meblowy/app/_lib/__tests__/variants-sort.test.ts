import { describe, it, expect } from "vitest";
import { sortVariantValues, sortVariantOptions } from "@/app/_lib/variants";
import type { ProductOption } from "@/app/_lib/types";

const id = (v: string) => v;
const opt = (name: string, values: string[] = ["x"]): ProductOption => ({ name, values });

describe("sortVariantValues — sortowanie naturalne A-Z po etykiecie", () => {
  it("liczby w nazwie rosnąco (naturalnie, nie leksykalnie)", () => {
    expect(sortVariantValues(["Woolly 10", "Woolly 2", "Woolly 3", "Woolly 1"], id, "pl")).toEqual([
      "Woolly 1",
      "Woolly 2",
      "Woolly 3",
      "Woolly 10",
    ]);
  });

  it("większe liczby o różnej liczbie cyfr (60 < 100 < 105)", () => {
    expect(sortVariantValues(["Poso 105", "Poso 60", "Poso 100"], id, "pl")).toEqual([
      "Poso 60",
      "Poso 100",
      "Poso 105",
    ]);
  });

  it("litery A-Z (kolory)", () => {
    expect(sortVariantValues(["Złoty", "Czarny", "Srebrny"], id, "pl")).toEqual([
      "Czarny",
      "Srebrny",
      "Złoty",
    ]);
  });

  it("mieszane kolekcje tkanin grupują się po nazwie, potem po numerze", () => {
    expect(
      sortVariantValues(["Poso 02", "Chill Me 02", "Vena 05", "Monolith 04", "Poso 01"], id, "pl")
    ).toEqual(["Chill Me 02", "Monolith 04", "Poso 01", "Poso 02", "Vena 05"]);
  });

  it("sortuje wg ETYKIETY wyświetlanej (override/DE), nie surowej wartości", () => {
    // Surowe wartości "a","b", ale etykiety odwracają kolejność.
    const labelOf = (v: string) => (v === "a" ? "Zenon" : "Ala");
    expect(sortVariantValues(["a", "b"], labelOf, "pl")).toEqual(["b", "a"]);
  });

  it("działa dla locale DE (liczby naturalnie)", () => {
    expect(sortVariantValues(["Woolly 10", "Woolly 2"], id, "de")).toEqual([
      "Woolly 2",
      "Woolly 10",
    ]);
  });

  it("jest odporne na wielkość liter (case-insensitive)", () => {
    expect(sortVariantValues(["pianka T30", "Pianka HR"], id, "pl")).toEqual([
      "Pianka HR",
      "pianka T30",
    ]);
  });

  it("nie mutuje tablicy wejściowej", () => {
    const input = ["Woolly 10", "Woolly 2"];
    const copy = [...input];
    sortVariantValues(input, id, "pl");
    expect(input).toEqual(copy);
  });

  it("pusta i jednoelementowa tablica", () => {
    expect(sortVariantValues([], id, "pl")).toEqual([]);
    expect(sortVariantValues(["X"], id, "pl")).toEqual(["X"]);
  });
});

describe("sortVariantOptions — sortowanie nazw opcji (kategorii) A-Z", () => {
  it("sortuje opcje A-Z po nazwie wyświetlanej", () => {
    const options = [opt("Rozmiar"), opt("Kolor"), opt("Tkanina")];
    expect(sortVariantOptions(options, id, "pl").map((o) => o.name)).toEqual([
      "Kolor",
      "Rozmiar",
      "Tkanina",
    ]);
  });

  it("sortuje wg nazwy WYŚWIETLANEJ (override admina), nie surowej", () => {
    // Surowa nazwa "Wariant" z override na "Kolor" → ma trafić przed "Rozmiar".
    const displayNameOf = (name: string) => (name === "Wariant" ? "Kolor" : name);
    const options = [opt("Rozmiar"), opt("Wariant")];
    expect(sortVariantOptions(options, displayNameOf, "pl").map((o) => o.name)).toEqual([
      "Wariant",
      "Rozmiar",
    ]);
  });

  it("diakrytyki i wielkość liter (Ł traktowane jak L, case-insensitive)", () => {
    const options = [opt("Zagłówek"), opt("łóżko"), opt("Materiał")];
    expect(sortVariantOptions(options, id, "pl").map((o) => o.name)).toEqual([
      "łóżko",
      "Materiał",
      "Zagłówek",
    ]);
  });

  it("zachowuje nienaruszone obiekty opcji (values, value_prices)", () => {
    const options: ProductOption[] = [
      { name: "Rozmiar", values: ["S", "M"], value_prices: { M: 100 } },
      { name: "Kolor", values: ["Beż"] },
    ];
    const sorted = sortVariantOptions(options, id, "pl");
    expect(sorted[0]).toEqual({ name: "Kolor", values: ["Beż"] });
    expect(sorted[1]).toEqual({ name: "Rozmiar", values: ["S", "M"], value_prices: { M: 100 } });
  });

  it("nie mutuje tablicy wejściowej", () => {
    const options = [opt("Rozmiar"), opt("Kolor")];
    const copy = [...options];
    sortVariantOptions(options, id, "pl");
    expect(options).toEqual(copy);
    expect(options[0].name).toBe("Rozmiar");
  });

  it("pusta i jednoelementowa tablica", () => {
    expect(sortVariantOptions([], id, "pl")).toEqual([]);
    expect(sortVariantOptions([opt("Kolor")], id, "pl").map((o) => o.name)).toEqual(["Kolor"]);
  });
});
