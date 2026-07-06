import { describe, it, expect } from "vitest";
import { sortVariantValues } from "@/app/_lib/variants";

const id = (v: string) => v;

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
