import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ⚠️ GUARD TEKSTOWY, NIE BEHAWIORALNY — wzorzec jak product-collection-wiring.
// Logika (parsery, sizeOptionsWithCurrent, fabricSizingChanged) ma testy
// zachowania w fabric-sizes.test.ts. Tu pilnujemy szwów, których repo nie
// testuje inaczej (render kliencki, akcje na prawdziwym supabase): bez nich
// nieudany odczyt listy po cichu zmieniał ceny przy niezwiązanym zapisie.

const read = (...parts: string[]) => readFileSync(path.join(process.cwd(), ...parts), "utf8");

const ACTIONS = read("app", "admin", "produkty", "actions.ts");
const EDITOR = read("app", "admin", "produkty", "[id]", "ProductEditor.tsx");
const CATEGORY_EDITOR = read("app", "admin", "kategorie", "KategorieEditor.tsx");

function between(source: string, start: string, end: string): string {
  const i = source.indexOf(start);
  const j = source.indexOf(end, i + 1);
  expect(i).toBeGreaterThan(-1);
  return source.slice(i, j === -1 ? undefined : j);
}

describe("updateProductBasics — przeliczenie dopłat tylko przy zmianie źródła", () => {
  const fn = between(ACTIONS, "export async function updateProductBasics", "export async function updateProductImages");

  it("porównuje stan sprzed zapisu przez fabricSizingChanged", () => {
    expect(/fabricSizingChanged\(/.test(fn)).toBe(true);
  });

  it("recompute wołany wyłącznie pod warunkiem sizingChanged", () => {
    const calls = fn.match(/recomputeFabricSurcharges\(/g) ?? [];
    expect(calls).toHaveLength(1);
    expect(/sizingChanged \? await recomputeFabricSurcharges\(/.test(fn)).toBe(true);
  });
});

describe("edytor produktu — pole „Rozmiar do dopłat za tkaninę”", () => {
  it("znacznik obecności renderuje się tylko przy wczytanych grupach cenowych", () => {
    const i = EDITOR.indexOf('name="fabric_size_present"');
    expect(i).toBeGreaterThan(-1);
    const guard = EDITOR.lastIndexOf("fabricGroups.length > 0 &&", i);
    expect(guard).toBeGreaterThan(-1);
    expect(i - guard).toBeLessThan(200);
  });

  it("bieżący rozmiar zostaje opcją selecta (sizeOptionsWithCurrent)", () => {
    expect(/sizeOptionsWithCurrent\(\s*fabricSizes,\s*product\.fabric_size_id/.test(EDITOR)).toBe(true);
  });
});

describe("edytor kategorii — rozmiar domyślny", () => {
  it("zapisany rozmiar zostaje opcją selecta (sizeOptionsWithCurrent)", () => {
    expect(/sizeOptionsWithCurrent\(\s*sizes,\s*initial\?\.defaultFabricSizeId/.test(CATEGORY_EDITOR)).toBe(true);
  });
});
