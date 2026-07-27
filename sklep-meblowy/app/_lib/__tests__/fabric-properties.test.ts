import { describe, it, expect } from "vitest";
import {
  FABRIC_PROPERTY_CODES,
  parseFabricProperties,
} from "@/app/_lib/fabric-properties";

describe("FABRIC_PROPERTY_CODES", () => {
  it("to dokładnie trzy kody w ustalonej kolejności wyświetlania", () => {
    expect([...FABRIC_PROPERTY_CODES]).toEqual([
      "waterproof",
      "pet_friendly",
      "easy_clean",
    ]);
  });
});

describe("parseFabricProperties", () => {
  it("przepuszcza znane kody", () => {
    expect(parseFabricProperties(["waterproof", "easy_clean"])).toEqual([
      "waterproof",
      "easy_clean",
    ]);
  });

  it("zwraca kody w stałej kolejności niezależnie od kolejności wejścia", () => {
    expect(parseFabricProperties(["easy_clean", "waterproof"])).toEqual([
      "waterproof",
      "easy_clean",
    ]);
  });

  it("odsiewa nieznane kody", () => {
    expect(parseFabricProperties(["waterproof", "teleportacja"])).toEqual([
      "waterproof",
    ]);
  });

  it("usuwa duplikaty", () => {
    expect(parseFabricProperties(["waterproof", "waterproof"])).toEqual([
      "waterproof",
    ]);
  });

  it("przycina białe znaki wokół kodu", () => {
    expect(parseFabricProperties([" pet_friendly "])).toEqual(["pet_friendly"]);
  });

  it("pomija elementy nie-stringowe", () => {
    expect(parseFabricProperties([1, null, {}, "easy_clean"])).toEqual([
      "easy_clean",
    ]);
  });

  it("wejście nie-tablicowe → pusta lista (stary cache, null z bazy)", () => {
    expect(parseFabricProperties(null)).toEqual([]);
    expect(parseFabricProperties(undefined)).toEqual([]);
    expect(parseFabricProperties("waterproof")).toEqual([]);
    expect(parseFabricProperties({ waterproof: true })).toEqual([]);
  });

  it("nie mutuje wejścia", () => {
    const input = ["easy_clean", "waterproof"];
    const snapshot = JSON.stringify(input);
    parseFabricProperties(input);
    expect(JSON.stringify(input)).toBe(snapshot);
  });
});
