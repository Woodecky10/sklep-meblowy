import { describe, it, expect } from "vitest";
import { orderItemDisplayName } from "@/app/_lib/order-items";

describe("orderItemDisplayName", () => {
  it("pozycja z katalogu → nazwa produktu z joina", () => {
    expect(orderItemDisplayName({ product: { name: "Narożnik VEGAS" } }, "Produkt")).toBe(
      "Narożnik VEGAS"
    );
  });

  it("pozycja spoza katalogu → nazwa wpisana ręcznie (migracja 82)", () => {
    expect(
      orderItemDisplayName({ custom_name: "Pufa na zamówienie", product: null }, "Produkt")
    ).toBe("Pufa na zamówienie");
  });

  it("custom_name wygrywa z produktem — wiersz i tak ma tylko jedno z dwóch", () => {
    expect(
      orderItemDisplayName({ custom_name: "Pufa", product: { name: "Sofa Porto" } }, "Produkt")
    ).toBe("Pufa");
  });

  it("puste custom_name (DEFAULT '' dla pozycji z katalogu) nie przesłania produktu", () => {
    // Kolumna jest `not null default ''`, więc KAŻDA pozycja z katalogu ma tu
    // pusty string. Gdyby helper brał go dosłownie, cała historia zamówień
    // straciłaby nazwy produktów.
    expect(orderItemDisplayName({ custom_name: "", product: { name: "Sofa" } }, "Produkt")).toBe(
      "Sofa"
    );
    expect(orderItemDisplayName({ custom_name: "   ", product: { name: "Sofa" } }, "Produkt")).toBe(
      "Sofa"
    );
  });

  it("brak kolumny custom_name (odczyt przed aplikacją migracji 82) → jak dotąd", () => {
    // `select("*")` na tabeli bez kolumny nie rzuca — po prostu nie zwraca pola.
    expect(orderItemDisplayName({ product: { name: "Sofa" } }, "Produkt")).toBe("Sofa");
    expect(orderItemDisplayName({ product: null }, "Produkt")).toBe("Produkt");
  });

  it("produkt usunięty z katalogu i brak nazwy własnej → tekst zastępczy", () => {
    expect(orderItemDisplayName({ product: null, custom_name: null }, "produkt usunięty")).toBe(
      "produkt usunięty"
    );
    expect(orderItemDisplayName({ product: { name: "  " } }, "Produkt")).toBe("Produkt");
  });
});
