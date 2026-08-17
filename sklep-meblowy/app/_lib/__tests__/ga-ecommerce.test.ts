import { describe, it, expect } from "vitest";
import {
  buildGaItems,
  buildGaCartPayload,
  buildGaPurchasePayload,
  buildGaLeadPayload,
  type GaLineItem,
} from "@/app/_lib/ga-ecommerce";

const item = (
  productId: string,
  name: string,
  quantity: number,
  price: number
): GaLineItem => ({ productId, name, quantity, price });

describe("buildGaItems", () => {
  it("mapuje pozycje na kształt `items` z GA4", () => {
    // GA4 nazywa pola inaczej niż Meta: item_id/item_name zamiast id, i NAZWA
    // jest obowiązkowa — bez niej raport „Wyświetlone produkty" pokazuje UUID-y.
    const out = buildGaItems([
      item("prod-a", "Sofa Vienna", 1, 2499),
      item("prod-b", "Poduszka Lino", 2, 199.5),
    ]);
    expect(out).toEqual([
      { item_id: "prod-a", item_name: "Sofa Vienna", price: 2499, quantity: 1 },
      { item_id: "prod-b", item_name: "Poduszka Lino", price: 199.5, quantity: 2 },
    ]);
  });

  it("scala ten sam produkt kupiony w dwóch wariantach", () => {
    // Ta sama zasada co w buildContents dla Meta: sofa w dwóch tkaninach to dwa
    // wiersze order_items, ale JEDEN produkt w katalogu. Bez scalania GA4
    // pokazuje dwie osobne pozycje o tej samej nazwie.
    const out = buildGaItems([
      item("prod-a", "Sofa Vienna", 1, 2499),
      item("prod-a", "Sofa Vienna", 2, 2499),
    ]);
    expect(out).toEqual([
      { item_id: "prod-a", item_name: "Sofa Vienna", price: 2499, quantity: 3 },
    ]);
  });

  it("pomija pozycje bez identyfikatora produktu", () => {
    // product_id ma FK ON DELETE SET NULL — po skasowaniu produktu z katalogu
    // stara pozycja zostaje bez id (i bez nazwy, bo join zwraca null).
    const out = buildGaItems([
      item("prod-a", "Sofa Vienna", 1, 2499),
      item("", "", 1, 100),
    ]);
    expect(out).toEqual([
      { item_id: "prod-a", item_name: "Sofa Vienna", price: 2499, quantity: 1 },
    ]);
  });

  it("pusta lista daje pustą tablicę, nie wywala się", () => {
    expect(buildGaItems([])).toEqual([]);
  });

  it("zaokrągla cenę jednostkową do dwóch miejsc", () => {
    expect(buildGaItems([item("prod-a", "Sofa", 1, 33.333)])[0].price).toBe(33.33);
  });
});

describe("buildGaCartPayload", () => {
  it("bez podanej kwoty liczy wartość z pozycji", () => {
    const p = buildGaCartPayload([
      item("prod-a", "Sofa Vienna", 2, 100),
      item("prod-b", "Poduszka Lino", 1, 49.5),
    ]);
    expect(p.value).toBe(249.5);
    expect(p.items).toHaveLength(2);
  });

  it("zdarzenia koszykowe idą w PLN niezależnie od locale", () => {
    // Ceny w bazie i w koszyku są ZAWSZE w PLN (app/_lib/money.ts) — EUR
    // powstaje dopiero przy wyświetlaniu i przy checkoucie.
    expect(buildGaCartPayload([item("a", "Sofa", 1, 10)]).currency).toBe("PLN");
  });

  it("podana kwota nadpisuje sumę pozycji", () => {
    // begin_checkout ma pokazać kwotę PO rabacie, nie sumę cen katalogowych.
    expect(buildGaCartPayload([item("a", "Sofa", 1, 100)], 80).value).toBe(80);
  });

  it("kwota 0 jest respektowana, nie traktowana jak brak kwoty", () => {
    // Pułapka `value || sum` — koszyk w 100% pokryty rabatem wysyłałby wtedy
    // pełną cenę katalogową.
    expect(buildGaCartPayload([item("a", "Sofa", 1, 100)], 0).value).toBe(0);
  });
});

describe("buildGaPurchasePayload", () => {
  const order = {
    orderId: "5d1f0e6c-6f1a-4d3b-9a2c-0b7e8f9a1c2d",
    total: 2698.5,
    currency: "pln",
    items: [
      item("prod-a", "Sofa Vienna", 1, 2499),
      item("prod-b", "Poduszka Lino", 1, 199.5),
    ],
  };

  it("ustawia transaction_id z identyfikatora zamówienia", () => {
    // To jest klucz deduplikacji po stronie GA4 — bez niego odświeżenie strony
    // podziękowania liczy sprzedaż drugi raz i zawyża przychód.
    expect(buildGaPurchasePayload(order).transaction_id).toBe(order.orderId);
  });

  it("wysyła kwotę zamówienia, nie sumę pozycji", () => {
    // `value` ma odpowiadać temu, co klient realnie zapłacił — po rabatach,
    // z dostawą. Suma cen pozycji ich nie uwzględnia.
    expect(buildGaPurchasePayload(order).value).toBe(2698.5);
  });

  it("dokłada walutę w ISO-4217 i komplet pozycji", () => {
    const p = buildGaPurchasePayload(order);
    expect(p.currency).toBe("PLN");
    expect(p.items).toEqual([
      { item_id: "prod-a", item_name: "Sofa Vienna", price: 2499, quantity: 1 },
      { item_id: "prod-b", item_name: "Poduszka Lino", price: 199.5, quantity: 1 },
    ]);
  });

  it("zaokrągla wartość zamówienia do dwóch miejsc", () => {
    expect(buildGaPurchasePayload({ ...order, total: 99.999 }).value).toBe(100);
  });

  it("zamówienie w EUR zachowuje swoją walutę", () => {
    expect(buildGaPurchasePayload({ ...order, currency: "eur" }).currency).toBe("EUR");
  });
});

describe("buildGaLeadPayload", () => {
  it("niesie wartość i walutę, bez pozycji", () => {
    // Zamówienie próbek idzie jako generate_lead — GA4 nie oczekuje tu `items`,
    // a doklejenie ich mieszałoby próbki do raportów sprzedaży mebli.
    expect(buildGaLeadPayload(19.9)).toEqual({ currency: "PLN", value: 19.9 });
  });

  it("zaokrągla wartość do dwóch miejsc", () => {
    expect(buildGaLeadPayload(19.999).value).toBe(20);
  });

  it("darmowa próbka wysyła wartość 0", () => {
    // Wzornik bywa gratis — zdarzenie ma polecieć mimo zerowej kwoty, bo to
    // nadal mocny sygnał zakupowy.
    expect(buildGaLeadPayload(0).value).toBe(0);
  });
});
