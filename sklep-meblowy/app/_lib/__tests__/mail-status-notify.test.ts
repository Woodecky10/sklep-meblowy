import { describe, it, expect } from "vitest";
import { shouldNotifyCustomer, mayNotifyCustomer, wasOrderPaid } from "../mail/status-notify";

describe("shouldNotifyCustomer — zamówienie ze sklepu (source = null)", () => {
  it("shipped wysyła — o tym klient musi wiedzieć", () => {
    expect(shouldNotifyCustomer("shipped", null)).toBe(true);
  });

  it("cancelled wysyła — dziś klient nie dowiedziałby się w żaden sposób", () => {
    expect(shouldNotifyCustomer("cancelled", null)).toBe(true);
  });

  it("processing NIE wysyła — to klik gaszący licznik nowych zamowien (PR #100)", () => {
    expect(shouldNotifyCustomer("processing", null)).toBe(false);
  });

  it("paid NIE wysyła — koliduje z mailem o zakupie z webhooka", () => {
    expect(shouldNotifyCustomer("paid", null)).toBe(false);
  });

  it("delivered NIE wysyła — decyzja 2026-07-28", () => {
    expect(shouldNotifyCustomer("delivered", null)).toBe(false);
  });

  it("pending NIE wysyła", () => {
    expect(shouldNotifyCustomer("pending", null)).toBe(false);
  });
});

describe("shouldNotifyCustomer — zamówienie zewnętrzne (source = „Allegro”)", () => {
  it("processing WYSYŁA — to jedyny moment, w którym klient z Allegro dowiaduje się od nas o przyjęciu", () => {
    expect(shouldNotifyCustomer("processing", "Allegro")).toBe(true);
  });

  it("shipped i cancelled wysyłają jak w sklepie (decyzja właściciela 2026-09-02)", () => {
    expect(shouldNotifyCustomer("shipped", "Allegro")).toBe(true);
    expect(shouldNotifyCustomer("cancelled", "Allegro")).toBe(true);
  });

  it("paid NIE wysyła — z tym statusem zamówienie jest zapisywane, mail idzie dopiero przy „W realizacji”", () => {
    expect(shouldNotifyCustomer("paid", "Allegro")).toBe(false);
  });

  it("delivered i pending NIE wysyłają", () => {
    expect(shouldNotifyCustomer("delivered", "Allegro")).toBe(false);
    expect(shouldNotifyCustomer("pending", "Allegro")).toBe(false);
  });
});

describe("shouldNotifyCustomer — source undefined (kolumna jeszcze nie istnieje w bazie)", () => {
  // select("*") na `orders` bez kolumny `source` (okno między wdrożeniem kodu
  // a ręczną aplikacją migracji 81) zwraca `source === undefined`, NIE `null`.
  // `undefined` musi się zachowywać jak „zamówienie ze sklepu" — inaczej admin
  // przestawiający zwykłe zamówienie na „W realizacji" wysłałby klientowi mail
  // „Dziękujemy za zamówienie" z „Źródło zamówienia: undefined".
  it('processing → false, tak jak dla source=null (undefined ma znaczyć "ze sklepu")', () => {
    expect(shouldNotifyCustomer("processing", undefined)).toBe(false);
  });

  it("shipped → true, tak jak dla source=null", () => {
    expect(shouldNotifyCustomer("shipped", undefined)).toBe(true);
  });
});

describe("mayNotifyCustomer — tani filtr przed odczytem zamówienia", () => {
  it("true dla każdego statusu, przy którym JAKIKOLWIEK rodzaj zamówienia mailuje", () => {
    expect(mayNotifyCustomer("processing")).toBe(true);
    expect(mayNotifyCustomer("shipped")).toBe(true);
    expect(mayNotifyCustomer("cancelled")).toBe(true);
  });

  it("false tam, gdzie nikt nie mailuje — bez zbędnego zapytania do bazy", () => {
    expect(mayNotifyCustomer("paid")).toBe(false);
    expect(mayNotifyCustomer("delivered")).toBe(false);
    expect(mayNotifyCustomer("pending")).toBe(false);
  });

  it("jest nadzbiorem shouldNotifyCustomer dla obu rodzajów zamówień", () => {
    for (const s of ["pending", "paid", "processing", "shipped", "delivered", "cancelled"] as const) {
      if (shouldNotifyCustomer(s, null) || shouldNotifyCustomer(s, "Allegro")) {
        expect(mayNotifyCustomer(s)).toBe(true);
      }
    }
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
