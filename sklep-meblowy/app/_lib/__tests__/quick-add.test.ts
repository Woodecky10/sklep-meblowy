import { describe, it, expect } from "vitest";
import { toQuickAddProduct } from "@/app/_lib/quick-add";
import type { Product } from "@/app/_lib/types";

// Karta produktu (serwer) przekazuje do przycisku „+" (klient) tylko to, co
// ten przycisk naprawdę czyta. Wcześniej szedł CAŁY produkt — opisy PL i DE,
// klucze wyszukiwania, wszystkie tkaniny z cenami — i lądował w payloadzie RSC
// strony: na stronie głównej ~200 KB z 416 KB payloadu (pomiar 2026-11-03).
function product(over: Partial<Product> = {}): Product {
  return {
    id: "p-1",
    name: "Narożnik Vegas",
    description: "<p>Bardzo długi opis…</p>",
    price: 3499,
    category: "narozniki",
    images: ["https://cdn.example/1.jpg", "https://cdn.example/2.jpg"],
    stock: 0,
    color: null,
    material: null,
    dimensions: null,
    weight: null,
    construction: null,
    delivery_time: null,
    warranty: null,
    features: [],
    description_sections: [],
    variants: null,
    collection_id: null,
    collection_sort_order: 0,
    size_group: null,
    size_label: null,
    sale_price: null,
    omnibus_price: null,
    sale_price_planned: null,
    sale_from: null,
    sale_to: null,
    promo_badge: null,
    is_active: true,
    deactivation_source: null,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  } as Product;
}

describe("toQuickAddProduct", () => {
  it("zwraca wyłącznie pola potrzebne przyciskowi — nic z opisów ani wariantów", () => {
    const out = toQuickAddProduct(product());
    expect(Object.keys(out).sort()).toEqual(
      ["category", "hasVariants", "id", "image", "name", "price"].sort()
    );
  });

  it("cena = cena efektywna (promocja wygrywa, gdy niższa)", () => {
    expect(toQuickAddProduct(product({ price: 3499, sale_price: 2999 })).price).toBe(2999);
    expect(toQuickAddProduct(product({ price: 3499, sale_price: null })).price).toBe(3499);
  });

  it("zdjęcie = pierwsze zdjęcie produktu, pusty napis gdy brak", () => {
    expect(toQuickAddProduct(product()).image).toBe("https://cdn.example/1.jpg");
    expect(toQuickAddProduct(product({ images: [] })).image).toBe("");
  });

  it("hasVariants = czy produkt ma jakąkolwiek opcję", () => {
    expect(toQuickAddProduct(product({ variants: null })).hasVariants).toBe(false);
    expect(
      toQuickAddProduct(product({ variants: { options: [] } as unknown as Product["variants"] }))
        .hasVariants
    ).toBe(false);
    expect(
      toQuickAddProduct(
        product({
          variants: { options: [{ name: "Tkanina", values: ["Sawana 21"] }] } as unknown as Product["variants"],
        })
      ).hasVariants
    ).toBe(true);
  });
});
