import { describe, it, expect } from "vitest";
import { usesCollectionOrder } from "@/app/_lib/collection-order";

// Kiedy produkty mają iść w kolejności ustawionej przez admina, a kiedy
// w tej, o którą poprosił klient. Reguła: ręczna kolejność jest DOMYŚLNA
// dla widoku kolekcji i ustępuje dopiero wtedy, gdy klient sam poprosi
// o inne uporządkowanie — czyli wybierze sortowanie albo szuka frazy.
describe("usesCollectionOrder", () => {
  it("stosuje kolejność admina przy samym wejściu w kolekcję", () => {
    expect(usesCollectionOrder({ kolekcja: "kolekcja-nuvo" })).toBe(true);
  });

  // Przycisk „Pokaż wszystkie jako listę" nie jest prośbą o inne
  // uporządkowanie — to nadal ta sama kolekcja, tylko w siatce.
  it("stosuje kolejność admina także w widoku listy", () => {
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", widok: "lista" })
    ).toBe(true);
  });

  // Zawężenie to nadal ta sama kolekcja — kolejność zostaje.
  it("stosuje kolejność admina przy zawężeniu kategorią", () => {
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", kategoria: "sofy" })
    ).toBe(true);
  });

  it("ustępuje wybranemu sortowaniu", () => {
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", sortuj: "price_asc" })
    ).toBe(false);
  });

  // Nawet „alfabetycznie" wybrane RĘCZNIE wygrywa: klient poprosił wprost,
  // a kolejność admina bywa inna niż alfabetyczna.
  it("ustępuje jawnie wybranemu sortowaniu alfabetycznemu", () => {
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", sortuj: "alphabetic" })
    ).toBe(false);
  });

  // Wyszukiwanie ma własne rankowanie po trafności (products.ts liczy je
  // w JS). Kolejność admina nie ma tam sensu i tylko by z nim walczyła.
  it("ustępuje wyszukiwaniu frazy", () => {
    expect(usesCollectionOrder({ kolekcja: "kolekcja-nuvo", q: "sofa" })).toBe(
      false
    );
  });

  it("nie dotyczy widoku bez kolekcji", () => {
    expect(usesCollectionOrder({})).toBe(false);
    expect(usesCollectionOrder({ kategoria: "sofy" })).toBe(false);
  });

  it("nie dotyczy pustego parametru kolekcji", () => {
    expect(usesCollectionOrder({ kolekcja: "" })).toBe(false);
    expect(usesCollectionOrder({ kolekcja: "   " })).toBe(false);
  });

  // Puste zostają po wyczyszczeniu formularza filtrów — nie są prośbą o nic.
  it("ignoruje puste sortowanie i pustą frazę", () => {
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", sortuj: "", q: "" })
    ).toBe(true);
  });

  it("ignoruje parametry kampanii", () => {
    expect(
      usesCollectionOrder({
        kolekcja: "kolekcja-nuvo",
        utm_source: "pinterest",
        gclid: "xyz",
      })
    ).toBe(true);
  });

  // Next oddaje tablicę dla powtórzonego parametru.
  it("radzi sobie z powtórzonymi parametrami", () => {
    expect(usesCollectionOrder({ kolekcja: ["kolekcja-nuvo", "x"] })).toBe(true);
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", sortuj: ["newest", "x"] })
    ).toBe(false);
  });
});
