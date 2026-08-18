import { describe, it, expect } from "vitest";
import {
  resolveGpc,
  warnsAboutMissingGpc,
  GPC_BY_SLUG,
  type GpcCategory,
} from "@/app/_lib/gpc";

// Drzewo kategorii sklepu w kształcie, w jakim naprawdę stoi w bazie
// (stan 2026-08-18). Trzymane tutaj jawnie, bo test ma pilnować REALNEGO
// pokrycia, a nie wymyślonej hierarchii.
const KATEGORIE: GpcCategory[] = [
  { id: "meble", slug: "meble", parent_id: null },
  { id: "zprod", slug: "z-produkcji", parent_id: null },

  { id: "sofy", slug: "sofy", parent_id: "meble" },
  { id: "salon", slug: "salon", parent_id: "meble" },
  { id: "sypialnia", slug: "sypialnia", parent_id: "meble" },
  { id: "materace", slug: "materace", parent_id: "meble" },
  { id: "fotele", slug: "fotele", parent_id: "meble" },
  { id: "pufy", slug: "pufy", parent_id: "meble" },
  { id: "schodki", slug: "schodki-dla-pupila", parent_id: "meble" },

  { id: "s2", slug: "sofa-2-osobowa", parent_id: "sofy" },
  { id: "s3", slug: "sofa-3-osobowa", parent_id: "sofy" },
  { id: "smod", slug: "sofa-modulowa", parent_id: "sofy" },
  { id: "nl", slug: "naroznik-l", parent_id: "salon" },
  { id: "nu", slug: "naroznik-u", parent_id: "salon" },
  { id: "nmod", slug: "naroznik-modulowy", parent_id: "salon" },
  { id: "lk", slug: "lozko-kontynentalne", parent_id: "sypialnia" },
  { id: "ld", slug: "lozka-dzieciece", parent_id: "sypialnia" },
  { id: "lt", slug: "lozka-tapicerowane", parent_id: "sypialnia" },
  { id: "mk", slug: "materace-kieszeniowe", parent_id: "materace" },
  { id: "mn", slug: "materace-nawierzchniowe", parent_id: "materace" },
  { id: "mp", slug: "materace-piankowe", parent_id: "materace" },
  { id: "ft", slug: "fotele-tapicerowane", parent_id: "fotele" },
  { id: "pt", slug: "pufy-tapicerowane", parent_id: "pufy" },

  // Te dwie wisza pod "Nasze realizacje" — kategoria, ktora NIE jest typem
  // produktu, wiec dziedziczenie ich nie uratuje. Musza byc zmapowane wprost.
  { id: "nlx", slug: "narozniki-l", parent_id: "zprod" },
  { id: "nux", slug: "narozniki-u", parent_id: "zprod" },
];

describe("resolveGpc", () => {
  it("bierze identyfikator z bezpośredniego mapowania", () => {
    expect(resolveGpc(KATEGORIE, "sofy")).toBe(460);
  });

  it("dziedziczy identyfikator po rodzicu", () => {
    expect(resolveGpc(KATEGORIE, "sofa-3-osobowa")).toBe(460);
  });

  it("dziedziczy przez dwa poziomy w górę", () => {
    const glebokie: GpcCategory[] = [
      ...KATEGORIE,
      { id: "wnuk", slug: "sofa-3-osobowa-xxl", parent_id: "s3" },
    ];
    expect(resolveGpc(glebokie, "sofa-3-osobowa-xxl")).toBe(460);
  });

  // Bez tego 7 produktow z "Naszych realizacji" zostaloby bez kategorii.
  it("mapowanie bezpośrednie działa mimo niezmapowanego rodzica", () => {
    expect(resolveGpc(KATEGORIE, "narozniki-l")).toBe(460);
    expect(resolveGpc(KATEGORIE, "narozniki-u")).toBe(460);
  });

  // "Zgadniety bledny identyfikator szkodzi bardziej niz jego brak"
  // (komentarz w product-feed.ts) — dlatego korzen i galeria zostaja puste.
  it("nie zgaduje dla kategorii, które nie są typem produktu", () => {
    expect(resolveGpc(KATEGORIE, "meble")).toBeNull();
    expect(resolveGpc(KATEGORIE, "z-produkcji")).toBeNull();
  });

  it("zwraca null dla nieznanego sluga", () => {
    expect(resolveGpc(KATEGORIE, "czego-tu-nie-ma")).toBeNull();
  });

  it("zwraca null dla braku kategorii", () => {
    expect(resolveGpc(KATEGORIE, null)).toBeNull();
    expect(resolveGpc(KATEGORIE, undefined)).toBeNull();
    expect(resolveGpc(KATEGORIE, "")).toBeNull();
  });

  // Drzewo w bazie moze sie zapetlic przy recznej edycji parent_id. Bez
  // ochrony feed wieszalby sie w nieskonczonej petli — czyli caly katalog
  // przestalby sie pobierac.
  it("nie zapętla się przy cyklu w drzewie", () => {
    const cykl: GpcCategory[] = [
      { id: "a", slug: "a", parent_id: "b" },
      { id: "b", slug: "b", parent_id: "a" },
    ];
    expect(resolveGpc(cykl, "a")).toBeNull();
  });

  // Test pokrycia: kazda kategoria, ktora MA dzis produkty, musi dostac
  // identyfikator. Padnie, gdy ktos usunie wpis z mapy albo przepnie
  // kategorie pod niezmapowana galaz.
  it("każda kategoria z produktami dostaje identyfikator", () => {
    const zProduktami = [
      "lozko-kontynentalne", "lozka-dzieciece", "lozka-tapicerowane",
      "materace-kieszeniowe", "materace-nawierzchniowe", "materace-piankowe",
      "sofa-modulowa", "sofa-3-osobowa", "sofa-2-osobowa",
      "naroznik-l", "naroznik-u", "naroznik-modulowy",
      "narozniki-l", "narozniki-u",
      "pufy-tapicerowane", "fotele-tapicerowane", "schodki-dla-pupila",
    ];
    const bez = zProduktami.filter((s) => resolveGpc(KATEGORIE, s) === null);
    expect(bez).toEqual([]);
  });

  it("mapuje na identyfikatory z oficjalnej taksonomii Google", () => {
    expect(GPC_BY_SLUG).toMatchObject({
      sofy: 460,
      salon: 460,
      sypialnia: 505764,
      materace: 2696,
      fotele: 443,
      pufy: 458,
      "schodki-dla-pupila": 6973,
    });
  });
});

// Ostrzeżenie w /admin/kategorie. Warunek jest wąski celowo: alarm ma się
// odezwać dokładnie wtedy, gdy realne oferty idą do katalogu bez kategorii.
describe("warnsAboutMissingGpc", () => {
  it("ostrzega, gdy kategoria ma produkty i nie ma odpowiednika Google", () => {
    expect(warnsAboutMissingGpc(KATEGORIE, "z-produkcji", 4)).toBe(true);
  });

  // Kategoria-pojemnik bez produktów niczego nie psuje w feedzie, a plakietka
  // przy każdej gałęzi zamieniłaby ostrzeżenie w tło, które się ignoruje.
  it("milczy dla kategorii bez własnych produktów", () => {
    expect(warnsAboutMissingGpc(KATEGORIE, "meble", 0)).toBe(false);
    expect(warnsAboutMissingGpc(KATEGORIE, "z-produkcji", 0)).toBe(false);
  });

  it("milczy, gdy kategoria ma odpowiednik Google", () => {
    expect(warnsAboutMissingGpc(KATEGORIE, "sofy", 12)).toBe(false);
  });

  // Najważniejszy przypadek: dziecko dziedziczy po rodzicu, więc plakietka
  // NIE ma się pokazać, mimo że sam slug nie jest w mapie.
  it("milczy dla podkategorii dziedziczącej po rodzicu", () => {
    expect(warnsAboutMissingGpc(KATEGORIE, "sofa-3-osobowa", 13)).toBe(false);
  });
});
