import { describe, it, expect } from "vitest";
import { resolveShopView } from "@/app/_lib/shop-view";

// Reguła widoku na /sklep: slider TYLKO dla czystego wejścia w kolekcję.
// Cokolwiek zawęża albo przestawia wynik — kategoria, fraza, cena, sortowanie,
// strona, facety — oddaje sterowanie dzisiejszej liście.
describe("resolveShopView", () => {
  it("daje slider dla samego wejścia w kolekcję", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo" })).toBe("slider");
  });

  it("daje listę, gdy nie ma kolekcji", () => {
    expect(resolveShopView({})).toBe("list");
  });

  it("daje listę, gdy kolekcja jest pusta", () => {
    expect(resolveShopView({ kolekcja: "" })).toBe("list");
  });

  it("daje listę, gdy kolekcja to same spacje", () => {
    expect(resolveShopView({ kolekcja: "   " })).toBe("list");
  });

  // To jest przycisk „Pokaż wszystkie jako listę".
  it("daje listę na jawne widok=lista", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", widok: "lista" })).toBe(
      "list"
    );
  });

  it("daje listę przy filtrze kategorii", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", kategoria: "sofy" })).toBe(
      "list"
    );
  });

  it("daje listę przy starym parametrze sekcja", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", sekcja: "sofy" })).toBe(
      "list"
    );
  });

  it("daje listę przy frazie wyszukiwania", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", q: "sofa" })).toBe("list");
  });

  it("daje listę przy sortowaniu", () => {
    expect(
      resolveShopView({ kolekcja: "kolekcja-nuvo", sortuj: "price_asc" })
    ).toBe("list");
  });

  it("daje listę na dalszej stronie", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", strona: "2" })).toBe(
      "list"
    );
  });

  it("daje listę przy filtrze ceny", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", cena_od: "1000" })).toBe(
      "list"
    );
  });

  it("daje listę przy filtrze dostępności", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", dostepne: "1" })).toBe(
      "list"
    );
  });

  it("daje listę przy filtrze wymiaru", () => {
    expect(resolveShopView({ kolekcja: "kolekcja-nuvo", szer_od: "200" })).toBe(
      "list"
    );
  });

  it("daje listę przy facecie opcji", () => {
    expect(
      resolveShopView({ kolekcja: "kolekcja-nuvo", opcja_kolor: "bezowy" })
    ).toBe("list");
  });

  it("daje listę przy facecie cechy", () => {
    expect(
      resolveShopView({ kolekcja: "kolekcja-nuvo", cecha_wodoodporna: "1" })
    ).toBe("list");
  });

  // Parametry kampanii doklejają Pinterest, Google Ads i newsletter. Gdyby
  // liczyły się jak filtr, płatny ruch dostawałby inny widok niż organiczny —
  // po cichu, bo w kodzie nic by o tym nie mówiło.
  it("ignoruje parametry kampanii i zostaje przy sliderze", () => {
    expect(
      resolveShopView({
        kolekcja: "kolekcja-nuvo",
        utm_source: "pinterest",
        utm_medium: "cpc",
        fbclid: "abc123",
      })
    ).toBe("slider");
  });

  // Puste parametry zostawia po sobie wyczyszczony formularz filtrów.
  it("ignoruje parametry o pustej wartości", () => {
    expect(
      resolveShopView({ kolekcja: "kolekcja-nuvo", q: "", kategoria: "" })
    ).toBe("slider");
  });

  // Next oddaje tablicę dla powtórzonego parametru (?kolekcja=a&kolekcja=b).
  it("radzi sobie z powtórzonym parametrem kolekcji", () => {
    expect(resolveShopView({ kolekcja: ["kolekcja-nuvo", "kolekcja-mio"] })).toBe(
      "slider"
    );
  });

  it("daje listę przy powtórzonym parametrze filtra", () => {
    expect(
      resolveShopView({ kolekcja: "kolekcja-nuvo", kategoria: ["sofy", "fotele"] })
    ).toBe("list");
  });
});
