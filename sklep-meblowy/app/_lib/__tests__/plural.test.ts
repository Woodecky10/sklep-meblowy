import { describe, it, expect } from "vitest";
import { pluralForm } from "@/app/_lib/plural";

const F = { one: "produkt", few: "produkty", many: "produktów" };

describe("pluralForm", () => {
  it("1 → forma 'one'", () => {
    expect(pluralForm(1, F)).toBe("produkt");
  });
  it("2-4 → forma 'few'", () => {
    expect(pluralForm(2, F)).toBe("produkty");
    expect(pluralForm(3, F)).toBe("produkty");
    expect(pluralForm(4, F)).toBe("produkty");
  });
  it("0 → forma 'few' (zgodnie z regułą n<5, jak w aplikacji)", () => {
    // Uwaga: poprawna polszczyzna chce tu "many" ("0 produktów"), ale wzorzec
    // aplikacji to n<5 → few. Zachowujemy istniejące zachowanie.
    expect(pluralForm(0, F)).toBe("produkty");
  });
  it(">=5 → forma 'many'", () => {
    expect(pluralForm(5, F)).toBe("produktów");
    expect(pluralForm(21, F)).toBe("produktów");
  });
  it("zachowuje uproszczenie aplikacji: 22 → 'many' (a nie poprawne PL 'few')", () => {
    // Poprawna polszczyzna to "22 produkty" (few), ale wzorzec n<5 daje many.
    // Test pilnuje, żeby refaktor nie zmienił tej (świadomie uproszczonej) reguły.
    expect(pluralForm(22, F)).toBe("produktów");
  });
});
