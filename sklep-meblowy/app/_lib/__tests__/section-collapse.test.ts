import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  readCollapsed,
  writeCollapsed,
  COLLAPSE_KEY_PREFIX,
} from "@/app/_lib/section-collapse";

describe("section-collapse — persystencja localStorage", () => {
  let store: Record<string, string>;

  beforeEach(() => {
    store = {};
    // Minimalny mock localStorage (node env nie ma go domyślnie).
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: (k: string) => (k in store ? store[k] : null),
      setItem: (k: string, v: string) => {
        store[k] = v;
      },
      removeItem: (k: string) => {
        delete store[k];
      },
    };
  });

  afterEach(() => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
  });

  it("readCollapsed → brak klucza = false (rozwinięte)", () => {
    expect(readCollapsed("warianty")).toBe(false);
  });

  it("readCollapsed → '1' = true (zwinięte)", () => {
    store[COLLAPSE_KEY_PREFIX + "warianty"] = "1";
    expect(readCollapsed("warianty")).toBe(true);
  });

  it("readCollapsed → '0' = false", () => {
    store[COLLAPSE_KEY_PREFIX + "warianty"] = "0";
    expect(readCollapsed("warianty")).toBe(false);
  });

  it("writeCollapsed → zapisuje '1'/'0' pod prefiksowanym kluczem", () => {
    writeCollapsed("zdjecia", true);
    expect(store[COLLAPSE_KEY_PREFIX + "zdjecia"]).toBe("1");
    writeCollapsed("zdjecia", false);
    expect(store[COLLAPSE_KEY_PREFIX + "zdjecia"]).toBe("0");
  });

  it("round-trip → write(true) potem read = true", () => {
    writeCollapsed("opis", true);
    expect(readCollapsed("opis")).toBe(true);
  });

  it("brak localStorage (SSR) → readCollapsed=false, writeCollapsed nie rzuca", () => {
    delete (globalThis as unknown as { localStorage?: unknown }).localStorage;
    expect(readCollapsed("x")).toBe(false);
    expect(() => writeCollapsed("x", true)).not.toThrow();
  });

  it("wyjątek storage (tryb prywatny) → readCollapsed=false, writeCollapsed nie rzuca", () => {
    (globalThis as unknown as { localStorage: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(readCollapsed("x")).toBe(false);
    expect(() => writeCollapsed("x", true)).not.toThrow();
  });
});
