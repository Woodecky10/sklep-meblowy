import { describe, expect, test } from "vitest";
import { COMPANY } from "@/app/_lib/company";
import {
  buildProductFeedXml,
  formatFeedPrice,
  selectFeedItems,
  type FeedProduct,
} from "@/app/_lib/product-feed";

const BASE = `https://${COMPANY.domain}`;

function product(over: Partial<FeedProduct> = {}): FeedProduct {
  return {
    id: "abc-123",
    name: "Narożnik VEGAS",
    description: "Wygodny narożnik z funkcją spania.",
    price: 3499,
    salePrice: null,
    images: ["https://cdn.example/vegas-1.jpg"],
    categoryLabel: "Narożniki",
    sizeGroup: null,
    ...over,
  };
}

describe("formatFeedPrice", () => {
  // Merchant Center wymaga "<liczba> <waluta>" z kropką i dwoma miejscami.
  test("formatuje z dwoma miejscami po kropce i kodem waluty", () => {
    expect(formatFeedPrice(3499, "PLN")).toBe("3499.00 PLN");
    expect(formatFeedPrice(999.5, "PLN")).toBe("999.50 PLN");
    expect(formatFeedPrice(820, "EUR")).toBe("820.00 EUR");
  });

  test("nie używa separatora tysięcy ani przecinka dziesiętnego", () => {
    const out = formatFeedPrice(12999.9, "PLN");
    expect(out).toBe("12999.90 PLN");
    // Dokładnie: liczba, kropka, dwie cyfry, jedna spacja, waluta.
    expect(out).toMatch(/^\d+\.\d{2} [A-Z]{3}$/);
  });
});

describe("selectFeedItems", () => {
  // Merchant odrzuca oferty bez zdjęcia i bez ceny — lepiej pominąć je u nas
  // i zaraportować, niż zbierać błędy w panelu Google.
  test("przepuszcza kompletny produkt", () => {
    const { included, skipped } = selectFeedItems([product()]);
    expect(included).toHaveLength(1);
    expect(skipped).toEqual([]);
  });

  test("pomija produkt bez zdjęcia", () => {
    const { included, skipped } = selectFeedItems([product({ images: [] })]);
    expect(included).toEqual([]);
    expect(skipped).toEqual([{ id: "abc-123", reason: "brak-zdjecia" }]);
  });

  test("pomija produkt z ceną zero lub ujemną", () => {
    const { included, skipped } = selectFeedItems([
      product({ id: "zero", price: 0 }),
      product({ id: "minus", price: -10 }),
    ]);
    expect(included).toEqual([]);
    expect(skipped.map((s) => s.reason)).toEqual(["brak-ceny", "brak-ceny"]);
  });

  test("pomija produkt bez nazwy", () => {
    const { included, skipped } = selectFeedItems([product({ name: "  " })]);
    expect(included).toEqual([]);
    expect(skipped).toEqual([{ id: "abc-123", reason: "brak-nazwy" }]);
  });
});

describe("buildProductFeedXml", () => {
  test("jest RSS 2.0 z przestrzenią nazw g: (format Merchant Center)", () => {
    const xml = buildProductFeedXml([product()], { locale: "pl", currency: "PLN" });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">');
    expect(xml).toContain("</rss>");
    expect(xml).toContain(`<link>${BASE}</link>`);
  });

  test("wystawia wymagane pola oferty", () => {
    const xml = buildProductFeedXml([product()], { locale: "pl", currency: "PLN" });
    expect(xml).toContain("<g:id>abc-123</g:id>");
    expect(xml).toContain("<g:title>Narożnik VEGAS</g:title>");
    expect(xml).toContain(`<g:link>${BASE}/produkt/abc-123</g:link>`);
    expect(xml).toContain("<g:image_link>https://cdn.example/vegas-1.jpg</g:image_link>");
    expect(xml).toContain("<g:price>3499.00 PLN</g:price>");
    expect(xml).toContain("<g:availability>in_stock</g:availability>");
    expect(xml).toContain("<g:condition>new</g:condition>");
    expect(xml).toContain(`<g:brand>${COMPANY.brandName}</g:brand>`);
  });

  test("deklaruje brak GTIN — meble są robione na zamówienie", () => {
    const xml = buildProductFeedXml([product()], { locale: "pl", currency: "PLN" });
    expect(xml).toContain("<g:identifier_exists>no</g:identifier_exists>");
  });

  test("podaje sale_price tylko gdy realnie taniej niż cena regularna", () => {
    const promo = buildProductFeedXml([product({ salePrice: 2999 })], {
      locale: "pl",
      currency: "PLN",
    });
    expect(promo).toContain("<g:price>3499.00 PLN</g:price>");
    expect(promo).toContain("<g:sale_price>2999.00 PLN</g:sale_price>");

    const bezPromo = buildProductFeedXml([product({ salePrice: 3499 })], {
      locale: "pl",
      currency: "PLN",
    });
    expect(bezPromo).not.toContain("sale_price");
  });

  test("escapuje znaki specjalne XML w nazwie i opisie", () => {
    const xml = buildProductFeedXml(
      [product({ name: 'Sofa "L" & <XL>', description: "Tkanina & skóra" })],
      { locale: "pl", currency: "PLN" }
    );
    expect(xml).toContain("<g:title>Sofa &quot;L&quot; &amp; &lt;XL&gt;</g:title>");
    expect(xml).toContain("<g:description>Tkanina &amp; skóra</g:description>");
    // Żaden surowy `&` bez encji nie może zostać — inaczej XML jest niepoprawny.
    expect(xml).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/);
  });

  test("dokłada pozostałe zdjęcia jako additional_image_link, max 10", () => {
    const images = Array.from({ length: 14 }, (_, i) => `https://cdn.example/${i}.jpg`);
    const xml = buildProductFeedXml([product({ images })], {
      locale: "pl",
      currency: "PLN",
    });
    expect(xml).toContain("<g:image_link>https://cdn.example/0.jpg</g:image_link>");
    const additional = xml.match(/<g:additional_image_link>/g) ?? [];
    expect(additional).toHaveLength(10);
    expect(xml).toContain("<g:additional_image_link>https://cdn.example/10.jpg</g:additional_image_link>");
    expect(xml).not.toContain("https://cdn.example/11.jpg");
  });

  test("grupuje rozmiary tego samego modelu przez item_group_id", () => {
    const xml = buildProductFeedXml([product({ sizeGroup: "vegas" })], {
      locale: "pl",
      currency: "PLN",
    });
    expect(xml).toContain("<g:item_group_id>vegas</g:item_group_id>");
  });

  test("bez size_group nie emituje pustego item_group_id", () => {
    const xml = buildProductFeedXml([product()], { locale: "pl", currency: "PLN" });
    expect(xml).not.toContain("item_group_id");
  });

  test("product_type bierze z etykiety kategorii", () => {
    const xml = buildProductFeedXml([product()], { locale: "pl", currency: "PLN" });
    expect(xml).toContain("<g:product_type>Narożniki</g:product_type>");
  });

  test("obcina tytuł do 150 znaków (limit Merchant Center)", () => {
    const xml = buildProductFeedXml([product({ name: "A".repeat(200) })], {
      locale: "pl",
      currency: "PLN",
    });
    const title = xml.match(/<g:title>(.*?)<\/g:title>/)![1];
    expect(title).toHaveLength(150);
  });

  test("obcina opis do 5000 znaków", () => {
    const xml = buildProductFeedXml([product({ description: "B".repeat(6000) })], {
      locale: "pl",
      currency: "PLN",
    });
    const desc = xml.match(/<g:description>(.*?)<\/g:description>/)![1];
    expect(desc).toHaveLength(5000);
  });

  test("na DE linkuje do /de i wystawia ceny w EUR", () => {
    const xml = buildProductFeedXml([product({ price: 820 })], {
      locale: "de",
      currency: "EUR",
    });
    expect(xml).toContain(`<g:link>${BASE}/de/produkt/abc-123</g:link>`);
    expect(xml).toContain("<g:price>820.00 EUR</g:price>");
  });

  test("pomija niekompletne oferty, a poprawne wystawia", () => {
    const xml = buildProductFeedXml(
      [product({ id: "ok" }), product({ id: "bez-foty", images: [] })],
      { locale: "pl", currency: "PLN" }
    );
    expect(xml).toContain("<g:id>ok</g:id>");
    expect(xml).not.toContain("bez-foty");
    expect(xml.match(/<item>/g)).toHaveLength(1);
  });

  test("pusta lista daje poprawny XML z zerem ofert", () => {
    const xml = buildProductFeedXml([], { locale: "pl", currency: "PLN" });
    expect(xml).toContain("<channel>");
    expect(xml).not.toContain("<item>");
  });
});
