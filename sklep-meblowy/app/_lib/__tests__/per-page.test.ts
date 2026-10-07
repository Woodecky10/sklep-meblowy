import { describe, it, expect } from "vitest";
import { DEFAULT_PER_PAGE, PER_PAGE_OPTIONS, parsePerPage } from "@/app/_lib/per-page";

describe("parsePerPage — ile produktów na stronę w /sklep (?na_stronie=)", () => {
  it("brak parametru → domyślne 12, jak przed wprowadzeniem wyboru", () => {
    expect(parsePerPage(undefined)).toBe(12);
    expect(DEFAULT_PER_PAGE).toBe(12);
  });

  it("każda wartość z listy przechodzi", () => {
    for (const n of PER_PAGE_OPTIONS) expect(parsePerPage(String(n))).toBe(n);
  });

  it("wartość spoza listy → 12, żeby adres nie wymusił dowolnej liczby kart", () => {
    // 100 przepuściłby clampLimit — lista jest ciaśniejsza celowo.
    for (const raw of ["100", "13", "0", "-24", "24.5", "abc", "", " 24"]) {
      expect(parsePerPage(raw)).toBe(12);
    }
  });

  it("parametr powtórzony w adresie (?na_stronie=24&na_stronie=48) → pierwszy", () => {
    expect(parsePerPage(["24", "48"])).toBe(24);
  });

  it("wszystkie opcje wypełniają pełne rzędy siatki 2, 3 i 4 kolumn", () => {
    for (const n of PER_PAGE_OPTIONS) {
      expect(n % 2).toBe(0);
      expect(n % 3).toBe(0);
      expect(n % 4).toBe(0);
    }
  });
});
