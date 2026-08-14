import { describe, it, expect } from "vitest";
import {
  isValidMetaPixelId,
  toPixelCurrency,
  buildContents,
  buildCartEventPayload,
  buildPurchasePayload,
  shouldTrackPurchase,
  type PixelLineItem,
} from "@/app/_lib/meta-pixel";

describe("isValidMetaPixelId", () => {
  it("przyjmuje realny identyfikator pixela (15 i 16 cyfr)", () => {
    expect(isValidMetaPixelId("123456789012345")).toBe(true);
    expect(isValidMetaPixelId("1234567890123456")).toBe(true);
  });

  it("odrzuca pusty i za krótki/za długi", () => {
    expect(isValidMetaPixelId("")).toBe(false);
    expect(isValidMetaPixelId("12345678901234")).toBe(false);
    expect(isValidMetaPixelId("12345678901234567")).toBe(false);
  });

  it("odrzuca identyfikator GA wklejony do złego pola", () => {
    // Realne ryzyko: dwie zmienne NEXT_PUBLIC_* obok siebie w panelu Vercela.
    expect(isValidMetaPixelId("G-GL6DBHYQYT")).toBe(false);
  });

  it("odrzuca wartości z białymi znakami i literami", () => {
    expect(isValidMetaPixelId(" 123456789012345")).toBe(false);
    expect(isValidMetaPixelId("123456789012345 ")).toBe(false);
    expect(isValidMetaPixelId("12345678901234a")).toBe(false);
  });
});

describe("toPixelCurrency", () => {
  it("podnosi kod waluty do wielkich liter (Meta wymaga ISO-4217)", () => {
    expect(toPixelCurrency("pln")).toBe("PLN");
    expect(toPixelCurrency("eur")).toBe("EUR");
  });
});

describe("buildContents", () => {
  const item = (productId: string, quantity: number, price: number): PixelLineItem => ({
    productId,
    quantity,
    price,
  });

  it("mapuje pozycje na content_ids + contents + num_items", () => {
    const out = buildContents([item("prod-a", 1, 2499), item("prod-b", 2, 199.5)]);
    expect(out.content_type).toBe("product");
    expect(out.content_ids).toEqual(["prod-a", "prod-b"]);
    expect(out.contents).toEqual([
      { id: "prod-a", quantity: 1, item_price: 2499 },
      { id: "prod-b", quantity: 2, item_price: 199.5 },
    ]);
    expect(out.num_items).toBe(3);
  });

  it("scala ten sam produkt kupiony w dwóch wariantach", () => {
    // Sofa w dwóch tkaninach to dwa wiersze order_items, ale JEDEN produkt w
    // katalogu. Powtórzone content_ids psują dopasowanie do katalogu Meta,
    // a powtórzone contents zawyżają liczbę sztuk w raporcie.
    const out = buildContents([item("prod-a", 1, 2499), item("prod-a", 2, 2499)]);
    expect(out.content_ids).toEqual(["prod-a"]);
    expect(out.contents).toEqual([{ id: "prod-a", quantity: 3, item_price: 2499 }]);
    expect(out.num_items).toBe(3);
  });

  it("pomija pozycje bez identyfikatora produktu", () => {
    // product_id ma FK ON DELETE SET NULL — po skasowaniu produktu z katalogu
    // stare zamówienie zostaje z pustą pozycją. Lepiej wysłać zakup bez tej
    // pozycji niż z `undefined` w content_ids.
    const out = buildContents([
      item("prod-a", 1, 2499),
      { productId: "", quantity: 1, price: 100 },
    ]);
    expect(out.content_ids).toEqual(["prod-a"]);
    expect(out.num_items).toBe(1);
  });

  it("pusta lista pozycji daje puste tablice, nie wywala się", () => {
    const out = buildContents([]);
    expect(out.content_ids).toEqual([]);
    expect(out.contents).toEqual([]);
    expect(out.num_items).toBe(0);
  });

  it("zaokrągla cenę jednostkową do dwóch miejsc", () => {
    const out = buildContents([item("prod-a", 1, 33.333)]);
    expect(out.contents[0].item_price).toBe(33.33);
  });
});

describe("buildCartEventPayload", () => {
  it("bez podanej kwoty liczy wartość z pozycji", () => {
    const p = buildCartEventPayload([
      { productId: "prod-a", quantity: 2, price: 100 },
      { productId: "prod-b", quantity: 1, price: 49.5 },
    ]);
    expect(p.value).toBe(249.5);
    expect(p.num_items).toBe(3);
  });

  it("zdarzenia koszykowe idą w PLN niezależnie od locale", () => {
    // Ceny w bazie i w koszyku są ZAWSZE w PLN (app/_lib/money.ts) — EUR
    // powstaje dopiero przy wyświetlaniu i przy checkoucie.
    expect(buildCartEventPayload([{ productId: "a", quantity: 1, price: 10 }]).currency).toBe(
      "PLN"
    );
  });

  it("podana kwota nadpisuje sumę pozycji", () => {
    // InitiateCheckout ma pokazać kwotę PO rabacie, nie sumę cen katalogowych.
    const p = buildCartEventPayload([{ productId: "a", quantity: 1, price: 100 }], 80);
    expect(p.value).toBe(80);
  });

  it("kwota 0 jest respektowana, nie traktowana jak brak kwoty", () => {
    // Klasyczna pułapka `value || sum` — koszyk w 100% pokryty rabatem
    // wysyłałby wtedy pełną cenę katalogową.
    expect(buildCartEventPayload([{ productId: "a", quantity: 1, price: 100 }], 0).value).toBe(0);
  });
});

describe("shouldTrackPurchase", () => {
  it("płatność online: dopiero potwierdzona wpłata liczy się jako zakup", () => {
    // "pending" to klient przed bramką albo w jej trakcie — notyfikacja z P24
    // jeszcze nie doszła. Liczenie tego jako sprzedaży zawyżałoby wynik kampanii
    // o każdą porzuconą i nieudaną płatność.
    expect(shouldTrackPurchase("pending", "online")).toBe(false);
    expect(shouldTrackPurchase("paid", "online")).toBe(true);
  });

  it("płatność online: każdy status po opłaceniu nadal jest zakupem", () => {
    // Klient wraca na link z maila po tygodniu — zamówienie jest już wysłane.
    // Zdarzenie i tak zdeduplikuje się po eventID, ale nie może zniknąć.
    for (const status of ["processing", "shipped", "delivered"] as const) {
      expect(shouldTrackPurchase(status, "online")).toBe(true);
    }
  });

  it("pobranie liczy się od razu, bo zamówienie jest przyjęte do realizacji", () => {
    // COD startuje ze statusem "pending" — pieniądze przyjdą od kuriera.
    expect(shouldTrackPurchase("pending", "cod")).toBe(true);
    expect(shouldTrackPurchase("shipped", "cod")).toBe(true);
  });

  it("anulowane NIE jest zakupem — ani online, ani za pobraniem", () => {
    // Kluczowy przypadek: `status !== "pending"` przepuszczałby anulowane.
    expect(shouldTrackPurchase("cancelled", "online")).toBe(false);
    expect(shouldTrackPurchase("cancelled", "cod")).toBe(false);
  });
});

describe("buildPurchasePayload", () => {
  const order = {
    total: 2698.5,
    currency: "pln",
    items: [
      { productId: "prod-a", quantity: 1, price: 2499 },
      { productId: "prod-b", quantity: 1, price: 199.5 },
    ],
  };

  it("wysyła kwotę zamówienia, nie sumę pozycji", () => {
    // `value` ma odpowiadać temu, co klient realnie zapłacił — po rabatach,
    // z dostawą. Suma item_price ich nie uwzględnia, więc ROAS liczony z niej
    // byłby zawyżony przy każdym kuponie.
    expect(buildPurchasePayload(order).value).toBe(2698.5);
  });

  it("dokłada walutę i komplet parametrów zawartości", () => {
    const p = buildPurchasePayload(order);
    expect(p.currency).toBe("PLN");
    expect(p.content_ids).toEqual(["prod-a", "prod-b"]);
    expect(p.num_items).toBe(2);
    expect(p.content_type).toBe("product");
  });

  it("zaokrągla wartość zamówienia do dwóch miejsc", () => {
    expect(buildPurchasePayload({ ...order, total: 99.999 }).value).toBe(100);
  });

  it("zamówienie w EUR zachowuje swoją walutę", () => {
    expect(buildPurchasePayload({ ...order, currency: "eur" }).currency).toBe("EUR");
  });
});
