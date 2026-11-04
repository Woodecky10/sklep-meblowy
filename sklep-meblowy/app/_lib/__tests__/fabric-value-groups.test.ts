import { describe, it, expect } from "vitest";
import {
  groupValuesByFabric,
  commonPrice,
  setPriceForValues,
} from "@/app/_lib/fabric-value-groups";
import type { FabricLite } from "@/app/_lib/variants";

const f = (name: string, colors: string[], group_id = "g"): FabricLite => ({
  name,
  colors,
  price: 0,
  group_id,
});

describe("groupValuesByFabric", () => {
  it("grupuje wartości po tkaninie z katalogu, kolor = reszta po nazwie", () => {
    const { groups, orphans } = groupValuesByFabric(
      ["Baloo 2071", "Baloo 2072", "Kronos 01"],
      [f("Kronos", ["01"]), f("Baloo", ["2071", "2072"])]
    );
    expect(groups.map((g) => g.fabric.name)).toEqual(["Baloo", "Kronos"]);
    expect(groups[0].items).toEqual([
      { value: "Baloo 2071", color: "2071" },
      { value: "Baloo 2072", color: "2072" },
    ]);
    expect(orphans).toEqual([]);
  });

  it("kolejność tkanin = kolejność pierwszego wystąpienia w wartościach produktu", () => {
    const { groups } = groupValuesByFabric(
      ["Kronos 01", "Baloo 2071", "Kronos 02"],
      [f("Baloo", ["2071"]), f("Kronos", ["01", "02"])]
    );
    expect(groups.map((g) => g.fabric.name)).toEqual(["Kronos", "Baloo"]);
    expect(groups[0].items.map((i) => i.value)).toEqual(["Kronos 01", "Kronos 02"]);
  });

  it("kolory wielowyrazowe (Trinity 02 Light) zostają w jednej tkaninie", () => {
    const { groups } = groupValuesByFabric(
      ["Trinity 01", "Trinity 02 Light"],
      [f("Trinity", ["01", "02 Light"])]
    );
    expect(groups).toHaveLength(1);
    expect(groups[0].items.map((i) => i.color)).toEqual(["01", "02 Light"]);
  });

  it("dłuższa nazwa wygrywa z prefiksem (Magic vs Magic Velvet)", () => {
    const { groups } = groupValuesByFabric(
      ["Magic Velvet 01", "Magic 01"],
      [f("Magic", ["01", "Velvet 01"]), f("Magic Velvet", ["01"])]
    );
    expect(groups.find((g) => g.fabric.name === "Magic Velvet")!.items.map((i) => i.value)).toEqual([
      "Magic Velvet 01",
    ]);
    expect(groups.find((g) => g.fabric.name === "Magic")!.items.map((i) => i.value)).toEqual([
      "Magic 01",
    ]);
  });

  it("tkanina bez kolorów: wartość = sama nazwa, kolor pusty", () => {
    const { groups } = groupValuesByFabric(["Sawana"], [f("Sawana", [])]);
    expect(groups[0].items).toEqual([{ value: "Sawana", color: "" }]);
  });

  it("wartości spoza katalogu (literówki, wykreślone kolory) idą do orphans", () => {
    const { groups, orphans } = groupValuesByFabric(
      ["Velvet Velvet 17", "Baloo 2071", "Baloo 9999"],
      [f("Baloo", ["2071"])]
    );
    expect(groups.map((g) => g.fabric.name)).toEqual(["Baloo"]);
    expect(orphans).toEqual(["Velvet Velvet 17", "Baloo 9999"]);
  });
});

describe("commonPrice", () => {
  it("wspólna dopłata wszystkich wartości", () => {
    expect(commonPrice(["a", "b"], { a: 400, b: 400 })).toBe(400);
  });
  it("brak wpisu = 0 zł", () => {
    expect(commonPrice(["a", "b"], undefined)).toBe(0);
    expect(commonPrice(["a", "b"], { c: 250 })).toBe(0);
  });
  it("różne dopłaty → null", () => {
    expect(commonPrice(["a", "b"], { a: 400 })).toBeNull();
  });
});

describe("setPriceForValues", () => {
  it("ustawia dopłatę wszystkim wskazanym wartościom, innych nie rusza", () => {
    expect(setPriceForValues({ a: 1, x: 7 }, ["a", "b"], 400)).toEqual({ a: 400, b: 400, x: 7 });
  });
  it("0 albo null usuwa wpisy; pusta mapa → undefined", () => {
    expect(setPriceForValues({ a: 400, x: 7 }, ["a"], 0)).toEqual({ x: 7 });
    expect(setPriceForValues({ a: 400 }, ["a"], null)).toBeUndefined();
  });
});
