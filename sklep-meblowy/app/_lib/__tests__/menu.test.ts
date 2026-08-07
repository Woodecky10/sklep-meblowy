import { describe, it, expect } from "vitest";
import {
  MENU_LOCATIONS,
  MENU_ROUTES,
  MENU_HREF_MAX,
  isMenuLocation,
  validateMenuHref,
  prepareMenuItems,
  type MenuItemRow,
} from "@/app/_lib/menu";
import { RESERVED_SLUGS } from "@/app/_lib/pages";

const row = (over: Partial<MenuItemRow>): MenuItemRow => ({
  id: "i1",
  location: "navbar",
  page_id: "p1",
  href: null,
  label: null,
  label_de: null,
  sort_order: 0,
  visible: true,
  page: { slug: "pielegnacja", title: "Pielęgnacja", title_de: null, published: true },
  ...over,
});

describe("isMenuLocation", () => {
  it("navbar/footer tak, reszta nie", () => {
    expect(MENU_LOCATIONS).toEqual(["navbar", "footer"]);
    expect(isMenuLocation("navbar")).toBe(true);
    expect(isMenuLocation("footer")).toBe(true);
    expect(isMenuLocation("sidebar")).toBe(false);
  });
});

describe("prepareMenuItems", () => {
  it("null (błąd fetch) → pusta lista (fail-open)", () => {
    expect(prepareMenuItems(null, "navbar", "pl")).toEqual([]);
  });
  it("filtruje: lokację, niewidoczne, strony nieopublikowane i pozycje bez strony", () => {
    const rows = [
      row({ id: "ok" }),
      row({ id: "zla-lokacja", location: "footer" }),
      row({ id: "ukryta", visible: false }),
      row({ id: "szkic", page: { slug: "s", title: "S", title_de: null, published: false } }),
      row({ id: "sierota", page: null }),
    ];
    expect(prepareMenuItems(rows, "navbar", "pl").map((i) => i.id)).toEqual(["ok"]);
  });
  it("sortuje po sort_order z tie-breakiem po id; href = /slug", () => {
    const rows = [
      row({ id: "b", sort_order: 1 }),
      row({ id: "a", sort_order: 1 }),
      row({ id: "c", sort_order: 0 }),
    ];
    const items = prepareMenuItems(rows, "navbar", "pl");
    expect(items.map((i) => i.id)).toEqual(["c", "a", "b"]);
    expect(items[0].href).toBe("/pielegnacja");
  });
  it("etykieta: własna wygrywa nad tytułem; DE per pole z fallbackiem PL", () => {
    const rows = [
      row({
        id: "custom",
        label: "Porady",
        label_de: "Tipps",
        page: { slug: "x", title: "Pielęgnacja", title_de: "Möbelpflege", published: true },
      }),
      row({
        id: "custom-pl-only",
        sort_order: 1,
        label: "Porady",
        page: { slug: "y", title: "T", title_de: null, published: true },
      }),
      row({
        id: "tytul",
        sort_order: 2,
        page: { slug: "z", title: "Pielęgnacja", title_de: "Möbelpflege", published: true },
      }),
      row({
        id: "tytul-pl",
        sort_order: 3,
        label: "   ",
        page: { slug: "w", title: "Tylko PL", title_de: "", published: true },
      }),
    ];
    const pl = prepareMenuItems(rows, "navbar", "pl").map((i) => i.label);
    const de = prepareMenuItems(rows, "navbar", "de").map((i) => i.label);
    expect(pl).toEqual(["Porady", "Porady", "Pielęgnacja", "Tylko PL"]);
    expect(de).toEqual(["Tipps", "Porady", "Möbelpflege", "Tylko PL"]);
  });
  it("link własny: renderuje swój href i etykietę, mimo page = null", () => {
    const rows = [row({ id: "tkaniny", page_id: null, href: "/tkaniny", label: "Tkaniny", page: null })];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([
      { id: "tkaniny", href: "/tkaniny", label: "Tkaniny" },
    ]);
  });
  it("link własny: etykieta DE z fallbackiem na PL", () => {
    const rows = [
      row({ id: "a", page_id: null, href: "/o-nas", label: "O nas", label_de: "Über uns", page: null }),
      row({ id: "b", sort_order: 1, page_id: null, href: "/kontakt", label: "Kontakt", page: null }),
    ];
    expect(prepareMenuItems(rows, "navbar", "de").map((i) => i.label)).toEqual(["Über uns", "Kontakt"]);
  });
  it("link własny bez etykiety wypada (baza tego broni, kod nie ufa)", () => {
    const rows = [row({ id: "pusty", page_id: null, href: "/tkaniny", label: "   ", page: null })];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([]);
  });
  it("linki własne i podstrony mieszają się w jednej lokacji, po sort_order", () => {
    const rows = [
      row({ id: "link", sort_order: 1, page_id: null, href: "/tkaniny", label: "Tkaniny", page: null }),
      row({ id: "strona", sort_order: 0 }),
    ];
    expect(prepareMenuItems(rows, "navbar", "pl").map((i) => i.href)).toEqual([
      "/pielegnacja",
      "/tkaniny",
    ]);
  });
  it("link własny niewidoczny dalej wypada", () => {
    const rows = [row({ id: "x", visible: false, page_id: null, href: "/tkaniny", label: "T", page: null })];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([]);
  });
  it("href pusty/brakujący nie robi z pozycji linku własnego", () => {
    expect(prepareMenuItems([row({ href: "" })], "navbar", "pl")).toEqual([
      { id: "i1", href: "/pielegnacja", label: "Pielęgnacja" },
    ]);
  });
  it("href niezdefiniowany w wierszu (np. brak kolumny w SELECT) nie robi z pozycji linku własnego", () => {
    // Symuluje realny defekt: menu-server.ts rzutuje wynik zapytania przez
    // `unknown`, więc jeśli SELECT nie pobiera href, w runtime jest
    // `undefined`, nie `null` — mimo że typ deklaruje `string | null`.
    const rows = [{ ...row({}), href: undefined } as unknown as MenuItemRow];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([
      { id: "i1", href: "/pielegnacja", label: "Pielęgnacja" },
    ]);
  });
  it("link własny z niepoprawnym href (obchodzącym walidację zapisu) wypada z listy, nie trafia do podstrony", () => {
    const rows = [
      row({ id: "a", page_id: null, href: "//evil.com", label: "A", page: null }),
      row({ id: "b", sort_order: 1, page_id: null, href: "https://evil.com", label: "B", page: null }),
    ];
    expect(prepareMenuItems(rows, "navbar", "pl")).toEqual([]);
  });
});

describe("MENU_ROUTES", () => {
  // Ten test jest powodem, dla którego rejestr w ogóle istnieje: literówka
  // w ścieżce ma się wywalić tutaj, a nie jako pozycja menu wiodąca w 404.
  it("każda trasa z rejestru jest prawdziwym segmentem top-level", () => {
    for (const r of MENU_ROUTES) {
      expect(r.href.startsWith("/")).toBe(true);
      expect(RESERVED_SLUGS.has(r.href.slice(1))).toBe(true);
    }
  });
  it("bez duplikatów i z niepustymi etykietami", () => {
    const hrefs = MENU_ROUTES.map((r) => r.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(MENU_ROUTES.every((r) => r.label.trim() !== "")).toBe(true);
  });
});

describe("validateMenuHref", () => {
  it("przepuszcza ścieżki wewnętrzne", () => {
    expect(validateMenuHref("/tkaniny").ok).toBe(true);
    expect(validateMenuHref("/o-nas").ok).toBe(true);
  });
  it("odrzuca pusty, za długi i bez wiodącego ukośnika", () => {
    expect(validateMenuHref("").ok).toBe(false);
    expect(validateMenuHref("/" + "a".repeat(MENU_HREF_MAX)).ok).toBe(false);
    expect(validateMenuHref("tkaniny").ok).toBe(false);
  });
  it("odrzuca wyjścia poza sklep", () => {
    expect(validateMenuHref("//evil.com").ok).toBe(false);
    expect(validateMenuHref("https://evil.com").ok).toBe(false);
    expect(validateMenuHref("/\\evil.com").ok).toBe(false);
    expect(validateMenuHref("javascript:alert(1)").ok).toBe(false);
  });
  it("komunikaty błędów są konkretne, nie ogólnikowe", () => {
    expect(validateMenuHref("")).toEqual({ ok: false, error: "Adres jest wymagany" });
    expect(validateMenuHref("https://evil.com")).toEqual({
      ok: false,
      error: "Adres musi zaczynać się od „/”",
    });
    expect(validateMenuHref("//evil.com")).toEqual({
      ok: false,
      error: "Adres nie może prowadzić poza sklep",
    });
  });
});

// splitNavbarItems / NAVBAR_MAX_INLINE usunięte — nadmiar pozycji paska zawija
// się do kolejnego rzędu (flex-wrap w NavStrip.tsx), bo sztywny limit 4 nie
// widział grup kategorii ani szerokości okna i pozwalał uciąć prawą część
// headera. Zawijanie to czysty CSS, więc nie ma tu czego testować jednostkowo;
// weryfikacja jest wizualna (Playwright na kilku szerokościach okna).
