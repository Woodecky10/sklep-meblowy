import { describe, it, expect } from "vitest";
import {
  byCollectionSortOrder,
  maKolumneKolejnosci,
  usesCollectionOrder,
} from "@/app/_lib/collection-order";

// Kiedy produkty mają iść w kolejności ustawionej przez admina, a kiedy
// w tej, o którą poprosił klient. Reguła: ręczna kolejność jest DOMYŚLNA
// dla widoku kolekcji i ustępuje dopiero wtedy, gdy klient sam poprosi
// o inne uporządkowanie — czyli wybierze sortowanie albo szuka frazy.
describe("usesCollectionOrder", () => {
  it("stosuje kolejność admina przy samym wejściu w kolekcję", () => {
    expect(usesCollectionOrder({ kolekcja: "kolekcja-nuvo" })).toBe(true);
  });

  // Nieznany parametr nie jest prośbą o inne uporządkowanie — tylko `sortuj`
  // i `q` nią są. Reszta adresu może wyglądać dowolnie.
  it("nie daje się zmylić nieznanemu parametrowi", () => {
    expect(
      usesCollectionOrder({ kolekcja: "kolekcja-nuvo", cokolwiek: "x" })
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

// ── Kolejność produktów W OBRĘBIE kolekcji ────────────────────────────────
// Regresja z 2026-08-28: panel kolekcji pobierał produkty bez kolumny
// collection_sort_order, więc odejmowanie dawało NaN. NaN jest FAŁSZYWY, więc
// `NaN || a.name.localeCompare(b.name)` wykonywało gałąź zapasową i lista
// wychodziła alfabetycznie — a zapis utrwalał ten alfabet w bazie, kasując
// ułożoną kolejność. Rzutowanie `as Product[]` ukryło brak kolumny przed
// TypeScriptem.
describe("byCollectionSortOrder", () => {
  const p = (name: string, collection_sort_order: number) => ({ name, collection_sort_order });

  it("ustawia po zapisanej kolejności, nie po nazwie", () => {
    const lista = [p("Zebra", 0), p("Antylopa", 1), p("Mysz", 2)];
    expect([...lista].sort(byCollectionSortOrder).map((x) => x.name)).toEqual([
      "Zebra",
      "Antylopa",
      "Mysz",
    ]);
  });

  it("przy równych numerach rozstrzyga nazwa (po polsku)", () => {
    const lista = [p("Łódka", 5), p("Lampa", 5), p("Zegar", 5)];
    expect([...lista].sort(byCollectionSortOrder).map((x) => x.name)).toEqual([
      "Lampa",
      "Łódka",
      "Zegar",
    ]);
  });

  it("radzi sobie z zerem i wartościami ujemnymi", () => {
    const lista = [p("Trzeci", 1), p("Pierwszy", -2), p("Drugi", 0)];
    expect([...lista].sort(byCollectionSortOrder).map((x) => x.name)).toEqual([
      "Pierwszy",
      "Drugi",
      "Trzeci",
    ]);
  });
});

// Strażnik brakującej kolumny. Sam komparator nie ma jak się bronić: dostaje
// już wyciągnięte wartości. Zapytanie sprawdzamy więc osobno, ZANIM cokolwiek
// posortujemy — inaczej brak kolumny znowu wygląda jak alfabet, zamiast jak
// błąd.
describe("maKolumneKolejnosci", () => {
  it("pusta lista przechodzi — nie ma czego sortować", () => {
    expect(maKolumneKolejnosci([])).toBe(true);
  });

  it("wykrywa brak kolumny w wyniku zapytania", () => {
    expect(maKolumneKolejnosci([{ collection_sort_order: undefined }])).toBe(false);
  });

  it("przepuszcza poprawny wynik", () => {
    expect(maKolumneKolejnosci([{ collection_sort_order: 0 }])).toBe(true);
  });

  it("null też jest brakiem — kolumna jest NOT NULL, więc null znaczy błąd zapytania", () => {
    expect(maKolumneKolejnosci([{ collection_sort_order: null }])).toBe(false);
  });
});
