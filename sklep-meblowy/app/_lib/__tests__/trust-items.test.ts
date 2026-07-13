import { describe, it, expect } from "vitest";
import { prepareTrustItems, type TrustItemRow } from "@/app/_lib/trust-items";
import { pl } from "@/app/_lib/dictionaries/pl";
import { de } from "@/app/_lib/dictionaries/de";

const row = (over: Partial<TrustItemRow>): TrustItemRow => ({
  id: "x",
  icon: "star",
  label: "Etykieta",
  label_de: null,
  subline: null,
  subline_de: null,
  sort_order: 0,
  active: true,
  ...over,
});

describe("prepareTrustItems", () => {
  it("null (błąd odczytu / brak migracji) → 4 domyślne pozycje ze słownika", () => {
    const items = prepareTrustItems(null, "pl");
    expect(items).toHaveLength(4);
    expect(items.map((i) => i.icon)).toEqual([
      "medal-pl",
      "shield-check",
      "truck-free",
      "warranty-2y",
    ]);
    expect(items[0].label).toBe(pl.trustBar.producer);
    expect(items[2].subline).toBe(pl.trustBar.deliveryScope);
  });

  it("defaulty po niemiecku dla locale de", () => {
    const items = prepareTrustItems(null, "de");
    expect(items[3].label).toBe(de.trustBar!.warranty);
    expect(items[2].subline).toBe(de.trustBar!.deliveryScope);
  });

  it("pusta lista z DB (admin usunął wszystko) → pusta lista, BEZ fallbacku", () => {
    expect(prepareTrustItems([], "pl")).toEqual([]);
  });

  it("filtruje nieaktywne i nieznane ikony, sortuje po sort_order", () => {
    const items = prepareTrustItems(
      [
        row({ id: "b", sort_order: 2, label: "B" }),
        row({ id: "off", active: false }),
        row({ id: "bad", icon: "nie-ma-takiej" }),
        row({ id: "a", sort_order: 1, label: "A" }),
      ],
      "pl"
    );
    expect(items.map((i) => i.id)).toEqual(["a", "b"]);
  });

  it("de: label_de/subline_de z fallbackiem na PL przy pustych", () => {
    const items = prepareTrustItems(
      [row({ label: "Polska", label_de: "Deutsch", subline: "dopiska", subline_de: "" })],
      "de"
    );
    expect(items[0].label).toBe("Deutsch");
    expect(items[0].subline).toBe("dopiska"); // "" → fallback PL
  });
});
