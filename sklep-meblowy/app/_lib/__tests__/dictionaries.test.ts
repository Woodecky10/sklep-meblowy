import { describe, it, expect } from "vitest";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pl } from "@/app/_lib/dictionaries/pl";
import { de } from "@/app/_lib/dictionaries/de";

// Klucze celowo NIE tłumaczone — fallback do PL jest akceptowalny.
const ALLOW_PL_FALLBACK = new Set<string>(["common.back"]);

function leafPaths(obj: Record<string, unknown>, prefix = ""): string[] {
  return Object.entries(obj).flatMap(([k, v]) => {
    const path = prefix ? `${prefix}.${k}` : k;
    return typeof v === "object" && v !== null
      ? leafPaths(v as Record<string, unknown>, path)
      : [path];
  });
}

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, key) =>
        acc && typeof acc === "object"
          ? (acc as Record<string, unknown>)[key]
          : undefined,
      obj
    );
}

describe("paritet słownika PL/DE", () => {
  it("każdy klucz UI po polsku ma niepuste tłumaczenie DE (poza allowlistą)", () => {
    const missing = leafPaths(pl as unknown as Record<string, unknown>)
      .filter((p) => !ALLOW_PL_FALLBACK.has(p))
      .filter((p) => {
        const v = getPath(de as unknown as Record<string, unknown>, p);
        return typeof v !== "string" || v.trim() === "";
      });
    expect(missing).toEqual([]);
  });
});

describe("getDictionary", () => {
  it("pl zwraca polskie stringi", () => {
    expect(getDictionary("pl").nav.shop).toBe("Sklep");
  });
  it("de nadpisuje przetłumaczonym stringiem", () => {
    expect(getDictionary("de").nav.shop).toBe("Shop");
  });
  it("brakujący klucz DE → fallback do PL", () => {
    // common.back jest celowo NIE przetłumaczony w de.ts
    const de = getDictionary("de");
    const pl = getDictionary("pl");
    expect(de.common.back).toBe(pl.common.back);
    expect(de.common.back).toBe("Wstecz");
  });
});
