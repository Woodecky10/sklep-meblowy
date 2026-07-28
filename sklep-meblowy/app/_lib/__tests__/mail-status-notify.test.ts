import { describe, it, expect } from "vitest";
import { shouldNotifyCustomer, wasOrderPaid } from "../mail/status-notify";

describe("shouldNotifyCustomer", () => {
  it("shipped wysyła — o tym klient musi wiedzieć", () => {
    expect(shouldNotifyCustomer("shipped")).toBe(true);
  });

  it("cancelled wysyła — dziś klient nie dowiedziałby się w żaden sposób", () => {
    expect(shouldNotifyCustomer("cancelled")).toBe(true);
  });

  it("processing NIE wysyła — to klik gaszący licznik nowych zamowien (PR #100)", () => {
    expect(shouldNotifyCustomer("processing")).toBe(false);
  });

  it("paid NIE wysyła — koliduje z mailem o zakupie z webhooka", () => {
    expect(shouldNotifyCustomer("paid")).toBe(false);
  });

  it("delivered NIE wysyła — decyzja 2026-07-28", () => {
    expect(shouldNotifyCustomer("delivered")).toBe(false);
  });

  it("pending NIE wysyła", () => {
    expect(shouldNotifyCustomer("pending")).toBe(false);
  });
});

describe("wasOrderPaid", () => {
  // Błąd który to naprawia: COD nigdy nie przechodzi przez "pending" (createOrder
  // nadaje mu "processing" od razu), więc bez wyjątku na płatność `previousStatus
  // !== "pending"` byłoby dla każdego COD prawdziwe — mail obiecywałby zwrot
  // gotówki, której sklep nigdy nie wziął.
  it('("cod", "processing") → false — pobranie płaci się gotówką przy dostawie, nie wcześniej', () => {
    expect(wasOrderPaid("cod", "processing")).toBe(false);
  });

  it('("cod", "shipped") → false — pobranie można anulować też po wysyłce, wciąż bez zwrotu', () => {
    expect(wasOrderPaid("cod", "shipped")).toBe(false);
  });

  it('("cod", "pending") → false', () => {
    expect(wasOrderPaid("cod", "pending")).toBe(false);
  });

  it('("online", "pending") → false — nigdy nie opłacone, bez tekstu o zwrocie', () => {
    expect(wasOrderPaid("online", "pending")).toBe(false);
  });

  it('("online", "paid") → true', () => {
    expect(wasOrderPaid("online", "paid")).toBe(true);
  });

  it('("online", "shipped") → true — opłacone wcześniej, admin przesunął dalej przed anulowaniem', () => {
    expect(wasOrderPaid("online", "shipped")).toBe(true);
  });
});
