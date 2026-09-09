import { describe, it, expect } from "vitest";
import { shouldNotifyCustomer, wasOrderPaid } from "../mail/status-notify";

describe("shouldNotifyCustomer — które statusy mailują automatycznie", () => {
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

describe("shouldNotifyCustomer — zamówienie zewnętrzne nie ma już własnej reguły", () => {
  // Do 2026-09-09 `processing` mailowało zamówieniom z `source` maila
  // „Dziękujemy za zamówienie" (spec 2026-09-02). Zgłoszenie pracownicy: nie
  // widziała tej wiadomości, nie mogła zmienić jej treści i nie wiedziała, czy
  // poszła. Decyzja właściciela: automat znika — mail wysyła teraz świadomym
  // klikiem z karty zamówienia (sendExternalOrderMail), więc lista statusów
  // jest JEDNA dla wszystkich zamówień i funkcja nie potrzebuje już `source`.
  it("przestawienie zewnętrznego na „W realizacji” nie wysyła nic samo z siebie", () => {
    expect(shouldNotifyCustomer("processing")).toBe(false);
  });

  it("shipped i cancelled wysyłają tak samo jak w sklepie (decyzja właściciela 2026-09-02)", () => {
    expect(shouldNotifyCustomer("shipped")).toBe(true);
    expect(shouldNotifyCustomer("cancelled")).toBe(true);
  });
});

describe("wasOrderPaid", () => {
  // Błąd który to naprawia: COD nigdy nie przechodzi przez "pending" (createOrder
  // nadaje mu "processing" od razu), więc bez wyjątku na płatność `previousStatus
  // !== "pending"` byłoby dla każdego COD prawdziwe — mail obiecywałby zwrot
  // gotówki, której sklep nigdy nie wziął.
  it('("cod", "processing") → false — pobranie płaci się gotówką przy dostawie, nie wcześniej', () => {
    expect(wasOrderPaid("cod", "processing", null)).toBe(false);
  });

  it('("cod", "shipped") → false — pobranie można anulować też po wysyłce, wciąż bez zwrotu', () => {
    expect(wasOrderPaid("cod", "shipped", null)).toBe(false);
  });

  it('("cod", "pending") → false', () => {
    expect(wasOrderPaid("cod", "pending", null)).toBe(false);
  });

  it('("online", "pending") → false — nigdy nie opłacone, bez tekstu o zwrocie', () => {
    expect(wasOrderPaid("online", "pending", null)).toBe(false);
  });

  it('("online", "paid") → true', () => {
    expect(wasOrderPaid("online", "paid", null)).toBe(true);
  });

  it('("online", "shipped") → true — opłacone wcześniej, admin przesunął dalej przed anulowaniem', () => {
    expect(wasOrderPaid("online", "shipped", null)).toBe(true);
  });

  it("zamówienie zewnętrzne → ZAWSZE false — zwrot idzie przez marketplace, sklep nie obiecuje pieniędzy", () => {
    expect(wasOrderPaid("online", "paid", "Allegro")).toBe(false);
    expect(wasOrderPaid("online", "shipped", "Allegro")).toBe(false);
    expect(wasOrderPaid("online", "processing", "OLX")).toBe(false);
  });

  it('("online", "paid", undefined) → true — undefined (brak kolumny przed migracją) ma znaczyć "ze sklepu", nie "zewnętrzne"', () => {
    expect(wasOrderPaid("online", "paid", undefined)).toBe(true);
  });
});
