import { describe, it, expect } from "vitest";
import {
  ORDER_SOURCES,
  OTHER_SOURCE,
  SOURCE_MAX_LENGTH,
  resolveOrderSource,
} from "../order-source";

describe("ORDER_SOURCES", () => {
  it("ma pięć źródeł z listy właściciela, bez „Inne” (to osobna opcja)", () => {
    expect([...ORDER_SOURCES]).toEqual([
      "Allegro",
      "OLX",
      "Empik",
      "Facebook / Instagram",
      "Telefon / e-mail",
    ]);
    expect(ORDER_SOURCES).not.toContain(OTHER_SOURCE);
  });
});

describe("resolveOrderSource", () => {
  it("pozycja z listy → ta sama etykieta, wpisana nazwa jest ignorowana", () => {
    expect(resolveOrderSource("Allegro", "cokolwiek")).toEqual({ ok: true, source: "Allegro" });
  });

  it("„Inne” bez nazwy → błąd (nazwa jest obowiązkowa — decyzja właściciela 2026-09-02)", () => {
    expect(resolveOrderSource(OTHER_SOURCE, "")).toEqual({
      ok: false,
      error: "Podaj nazwę źródła przy opcji „Inne”",
    });
    expect(resolveOrderSource(OTHER_SOURCE, "   ").ok).toBe(false);
    expect(resolveOrderSource(OTHER_SOURCE, undefined).ok).toBe(false);
  });

  it("„Inne” z nazwą → nazwa po trim", () => {
    expect(resolveOrderSource(OTHER_SOURCE, "  Vinted ")).toEqual({ ok: true, source: "Vinted" });
  });

  it("„Inne” z nazwą dłuższą niż limit → błąd", () => {
    const tooLong = "x".repeat(SOURCE_MAX_LENGTH + 1);
    expect(resolveOrderSource(OTHER_SOURCE, tooLong).ok).toBe(false);
    expect(resolveOrderSource(OTHER_SOURCE, "x".repeat(SOURCE_MAX_LENGTH)).ok).toBe(true);
  });

  it("wartość spoza listy albo nie-string → błąd", () => {
    expect(resolveOrderSource("Amazon", "")).toEqual({ ok: false, error: "Wybierz źródło zamówienia" });
    expect(resolveOrderSource(undefined, "").ok).toBe(false);
    expect(resolveOrderSource(42, "").ok).toBe(false);
  });
});
