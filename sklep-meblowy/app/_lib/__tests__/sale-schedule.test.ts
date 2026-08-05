import { describe, it, expect } from "vitest";
import {
  planSaleActivation,
  saleStatus,
  promoChipLabel,
  warsawToday,
  type SaleScheduleRow,
} from "@/app/_lib/sale-schedule";

// Bazowy wiersz — testy nadpisują tylko to, co badają.
function row(over: Partial<SaleScheduleRow> = {}): SaleScheduleRow {
  return {
    id: "p1",
    price: 1000,
    sale_price: null,
    sale_price_planned: null,
    sale_from: null,
    sale_to: null,
    promo_badge: null,
    ...over,
  };
}

describe("planSaleActivation", () => {
  it("okno otwarte, cena jeszcze nieaktywna → włącza", () => {
    const rows = [row({ sale_price_planned: 800, sale_from: "2026-08-01", sale_to: "2026-08-31" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: 800 }]);
  });

  it("brak dat → promocja natychmiastowa", () => {
    const rows = [row({ sale_price_planned: 800 })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: 800 }]);
  });

  it("granice okna są WŁĄCZNIE — pierwszy i ostatni dzień aktywne", () => {
    const rows = [row({ sale_price_planned: 800, sale_from: "2026-08-05", sale_to: "2026-08-05" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: 800 }]);
  });

  it("dzień przed oknem → nie włącza", () => {
    const rows = [row({ sale_price_planned: 800, sale_from: "2026-08-06" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([]);
  });

  it("dzień po oknie, cena była aktywna → gasi", () => {
    const rows = [row({ sale_price: 800, sale_price_planned: 800, sale_to: "2026-08-04" })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: null }]);
  });

  it("cena planowana NIE niższa od regularnej → nie włącza (spójnie z isOnSale)", () => {
    expect(planSaleActivation([row({ sale_price_planned: 1000 })], "2026-08-05")).toEqual([]);
    expect(planSaleActivation([row({ sale_price_planned: 1200 })], "2026-08-05")).toEqual([]);
  });

  it("cena regularna zjechała poniżej promocyjnej → gasi promocję", () => {
    const rows = [row({ price: 700, sale_price: 800, sale_price_planned: 800 })];
    expect(planSaleActivation(rows, "2026-08-05")).toEqual([{ id: "p1", sale_price: null }]);
  });

  it("jest IDEMPOTENTNA — stan już zgodny zwraca pustą listę", () => {
    const active = [row({ sale_price: 800, sale_price_planned: 800, sale_to: "2026-08-31" })];
    expect(planSaleActivation(active, "2026-08-05")).toEqual([]);
    const off = [row()];
    expect(planSaleActivation(off, "2026-08-05")).toEqual([]);
  });

  it("promo_badge sam nie rusza ceny", () => {
    expect(planSaleActivation([row({ promo_badge: "Nowość" })], "2026-08-05")).toEqual([]);
  });
});

describe("saleStatus", () => {
  it("aktywna z końcem", () => {
    expect(saleStatus(row({ sale_price: 800, sale_price_planned: 800, sale_to: "2026-08-31" }), "2026-08-05"))
      .toEqual({ kind: "active", until: "2026-08-31" });
  });
  it("aktywna bez końca", () => {
    expect(saleStatus(row({ sale_price: 800, sale_price_planned: 800 }), "2026-08-05"))
      .toEqual({ kind: "active", until: null });
  });
  it("zaplanowana", () => {
    expect(saleStatus(row({ sale_price_planned: 800, sale_from: "2026-08-10" }), "2026-08-05"))
      .toEqual({ kind: "scheduled", from: "2026-08-10" });
  });
  it("zakończona", () => {
    expect(saleStatus(row({ sale_price_planned: 800, sale_to: "2026-08-04" }), "2026-08-05"))
      .toEqual({ kind: "ended", on: "2026-08-04" });
  });
  it("sam napis bez ceny", () => {
    expect(saleStatus(row({ promo_badge: "Nowość" }), "2026-08-05")).toEqual({ kind: "badgeOnly" });
  });
  it("nic", () => {
    expect(saleStatus(row(), "2026-08-05")).toEqual({ kind: "none" });
  });
  it("aktywna promocja wygrywa nad napisem", () => {
    expect(saleStatus(row({ sale_price: 800, sale_price_planned: 800, promo_badge: "Hit" }), "2026-08-05").kind)
      .toBe("active");
  });
});

describe("promoChipLabel", () => {
  it("aktywna → Promocja", () => {
    expect(promoChipLabel(row({ sale_price: 800, sale_price_planned: 800 }), "2026-08-05")).toBe("Promocja");
  });
  it("zaplanowana → Zaplanowana", () => {
    expect(promoChipLabel(row({ sale_price_planned: 800, sale_from: "2026-08-10" }), "2026-08-05")).toBe("Zaplanowana");
  });
  it("zakończona promocja z wciąż wpisanym napisem → Wstążka (to jest wyciek, który chcemy widzieć)", () => {
    const r = row({ sale_price_planned: 800, sale_to: "2026-08-04", promo_badge: "Wyprzedaż" });
    expect(promoChipLabel(r, "2026-08-05")).toBe("Wstążka");
  });
  it("zakończona bez napisu → brak chipa", () => {
    expect(promoChipLabel(row({ sale_price_planned: 800, sale_to: "2026-08-04" }), "2026-08-05")).toBeNull();
  });
  it("czysty produkt → brak chipa", () => {
    expect(promoChipLabel(row(), "2026-08-05")).toBeNull();
  });
});

describe("warsawToday", () => {
  it("zwraca dzień w strefie Europe/Warsaw, nie UTC", () => {
    // 2026-08-05T23:30Z = już 2026-08-06 w Warszawie (CEST = UTC+2)
    expect(warsawToday(new Date("2026-08-05T23:30:00Z"))).toBe("2026-08-06");
    // 2026-01-05T23:30Z = już 2026-01-06 w Warszawie (CET = UTC+1)
    expect(warsawToday(new Date("2026-01-05T23:30:00Z"))).toBe("2026-01-06");
    expect(warsawToday(new Date("2026-08-05T10:00:00Z"))).toBe("2026-08-05");
  });
});
