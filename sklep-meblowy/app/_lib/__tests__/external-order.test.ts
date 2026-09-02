import { describe, it, expect } from "vitest";
import {
  parseExternalOrderInput,
  parsePrice,
  NOTES_MAX_LENGTH,
  type RawExternalOrder,
} from "../external-order";

// Komplet poprawnych pól; testy nadpisują to, o co pytają.
function raw(over: Partial<RawExternalOrder> = {}): RawExternalOrder {
  return {
    source: "Allegro",
    source_name: "",
    email: "  Jan.Kowalski@Example.com ",
    fullname: " Jan Kowalski ",
    phone: "500 600 700",
    street: "Testowa 1",
    postal_code: "00-001",
    city: "Warszawa",
    items: JSON.stringify([
      { product_id: "prod-1", price: "1 299,50", quantity: "2", notes: " Vena 12, lewy " },
      { product_id: "prod-2", price: 400, quantity: 1, notes: "" },
    ]),
    ...over,
  };
}

describe("parsePrice", () => {
  it("przyjmuje zapis z Allegro: spacja tysięcy i przecinek", () => {
    expect(parsePrice("1 299,50")).toBe(1299.5);
    expect(parsePrice("399")).toBe(399);
    expect(parsePrice(0)).toBe(0);
  });

  it("zaokrągla do grosza", () => {
    expect(parsePrice("10.005")).toBe(10.01);
  });

  it("odrzuca puste, ujemne i nieliczbowe", () => {
    expect(parsePrice("")).toBeNull();
    expect(parsePrice("-1")).toBeNull();
    expect(parsePrice("abc")).toBeNull();
    expect(parsePrice(undefined)).toBeNull();
  });
});

describe("parseExternalOrderInput", () => {
  it("komplet → znormalizowane dane i suma Σ cena × ilość", () => {
    const res = parseExternalOrderInput(raw());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.source).toBe("Allegro");
    expect(res.value.email).toBe("jan.kowalski@example.com");
    expect(res.value.address).toEqual({
      fullname: "Jan Kowalski",
      phone: "500 600 700",
      street: "Testowa 1",
      postal_code: "00-001",
      city: "Warszawa",
      country: "Polska",
    });
    expect(res.value.items).toEqual([
      { product_id: "prod-1", price: 1299.5, quantity: 2, notes: "Vena 12, lewy" },
      { product_id: "prod-2", price: 400, quantity: 1, notes: null },
    ]);
    // 2 × 1299.50 + 400 = 2999.00
    expect(res.value.total).toBe(2999);
  });

  it("suma zaokrąglona do grosza (0.1 × 3 nie daje 0.30000000000000004)", () => {
    const res = parseExternalOrderInput(
      raw({ items: JSON.stringify([{ product_id: "p", price: "0.1", quantity: 3 }]) })
    );
    expect(res.ok && res.value.total).toBe(0.3);
  });

  it("pusty telefon → adres bez pola phone", () => {
    const res = parseExternalOrderInput(raw({ phone: "" }));
    expect(res.ok && "phone" in res.value.address).toBe(false);
  });

  it("„Inne” bez nazwy → błąd ze źródła", () => {
    const res = parseExternalOrderInput(raw({ source: "Inne", source_name: "" }));
    expect(res).toEqual({ ok: false, error: "Podaj nazwę źródła przy opcji „Inne”" });
  });

  it("„Inne” z nazwą → nazwa jako źródło", () => {
    const res = parseExternalOrderInput(raw({ source: "Inne", source_name: "Vinted" }));
    expect(res.ok && res.value.source).toBe("Vinted");
  });

  it("zły e-mail → błąd", () => {
    expect(parseExternalOrderInput(raw({ email: "jan@" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ email: "" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ email: "jan kowalski@example.com" })).ok).toBe(false);
  });

  it("brak nazwiska albo adresu → błąd", () => {
    expect(parseExternalOrderInput(raw({ fullname: " " })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ street: "" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ postal_code: "" })).ok).toBe(false);
    expect(parseExternalOrderInput(raw({ city: "" })).ok).toBe(false);
  });

  it("brak pozycji → błąd", () => {
    expect(parseExternalOrderInput(raw({ items: "[]" }))).toEqual({
      ok: false,
      error: "Dodaj co najmniej jedną pozycję",
    });
    expect(parseExternalOrderInput(raw({ items: undefined })).ok).toBe(false);
  });

  it("nieczytelny JSON pozycji → błąd zamiast wyjątku", () => {
    expect(parseExternalOrderInput(raw({ items: "{nie json" })).ok).toBe(false);
  });

  it("ilość 0, ułamkowa albo ujemna → błąd z numerem pozycji", () => {
    for (const quantity of ["0", "1.5", "-2", ""]) {
      const res = parseExternalOrderInput(
        raw({ items: JSON.stringify([{ product_id: "p", price: "10", quantity }]) })
      );
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error).toContain("Pozycja 1");
    }
  });

  it("cena ujemna albo pusta → błąd", () => {
    for (const price of ["-5", "", "abc"]) {
      const res = parseExternalOrderInput(
        raw({ items: JSON.stringify([{ product_id: "p", price, quantity: 1 }]) })
      );
      expect(res.ok).toBe(false);
    }
  });

  it("pozycja bez product_id → błąd", () => {
    const res = parseExternalOrderInput(
      raw({ items: JSON.stringify([{ price: "10", quantity: 1 }]) })
    );
    expect(res.ok).toBe(false);
  });

  it("notatka ucinana do limitu", () => {
    const res = parseExternalOrderInput(
      raw({
        items: JSON.stringify([
          { product_id: "p", price: "10", quantity: 1, notes: "x".repeat(NOTES_MAX_LENGTH + 50) },
        ]),
      })
    );
    expect(res.ok && res.value.items[0].notes?.length).toBe(NOTES_MAX_LENGTH);
  });
});
