// Pozycje menu (spec 2026-07-14, krok D) — CZYSTY moduł: filtr, sort,
// lokalizacja etykiet. Fetch żyje w menu-server.ts (split pure/server jak
// pages.ts / blocks.ts).
//
// Podziału na inline/„Więcej" tu NIE MA: pozycje paska zawijają się do
// kolejnego rzędu (flex-wrap w NavStrip.tsx). Wcześniejszy sztywny limit 4
// pozycji nie brał pod uwagę ani grup kategorii, ani długości etykiet, ani
// szerokości okna — i to on pozwalał uciąć prawą część headera.

import type { Locale } from "./i18n";

export const MENU_LOCATIONS = ["navbar", "footer"] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

export function isMenuLocation(v: string): v is MenuLocation {
  return (MENU_LOCATIONS as readonly string[]).includes(v);
}

// Trasy zaszyte w kodzie, które wolno podlinkować w menu. Świadomie WĘŻSZY
// zbiór niż RESERVED_SLUGS z pages.ts: tamten wylicza wszystkie segmenty
// top-level (także /api, /checkout, /konto, /og), a tu wchodzą tylko strony
// mające sens jako pozycja menu. Dopisanie nowej trasy w app/ wymaga dopisania
// jej TUTAJ — test niezmiennika pilnuje, że ścieżka naprawdę istnieje.
export const MENU_ROUTES: readonly { href: string; label: string }[] = [
  { href: "/sklep", label: "Sklep" },
  { href: "/tkaniny", label: "Tkaniny" },
  { href: "/probki", label: "Próbki tkanin" },
  { href: "/o-nas", label: "O nas" },
  { href: "/kontakt", label: "Kontakt" },
  { href: "/dostawa", label: "Dostawa" },
  { href: "/zwroty", label: "Zwroty" },
  { href: "/regulamin", label: "Regulamin" },
  { href: "/prywatnosc", label: "Prywatność" },
] as const;

export const MENU_HREF_MAX = 200;

// Małe litery, cyfry, myślnik i ukośnik. Backslash celowo POZA klasą —
// przeglądarki normalizują /\evil.com do //evil.com, czyli do adresu
// zewnętrznego.
const MENU_HREF_RE = /^\/[a-z0-9\-/]*$/;

// Komunikaty PO POLSKU — widzi je administratorka w toaście (wzorzec
// validatePageSlug). Tylko ścieżki wewnętrzne: LocalizedLink dokleja prefiks
// /de, więc adres zewnętrzny dałby „/de/https://…", a wolne pole na https://
// w nawigacji to gotowy open redirect.
export function validateMenuHref(
  href: string
): { ok: true } | { ok: false; error: string } {
  if (!href) return { ok: false, error: "Adres jest wymagany" };
  if (href.length > MENU_HREF_MAX) {
    return { ok: false, error: `Adres może mieć najwyżej ${MENU_HREF_MAX} znaków` };
  }
  if (!href.startsWith("/")) {
    return { ok: false, error: "Adres musi zaczynać się od „/”" };
  }
  // MUSI iść przed regexem: „//" przechodzi przez klasę znaków, a jest
  // adresem protokołowo-względnym, czyli wyjściem poza sklep.
  if (href.startsWith("//")) {
    return { ok: false, error: "Adres nie może prowadzić poza sklep" };
  }
  if (!MENU_HREF_RE.test(href)) {
    return {
      ok: false,
      error: "Adres może zawierać tylko małe litery, cyfry, myślniki i ukośniki",
    };
  }
  return { ok: true };
}

export type MenuItemRow = {
  id: string;
  location: string;
  // XOR: dokładnie jedno z page_id/href jest niepuste (constraint
  // menu_items_target_xor, migracja 71).
  page_id: string | null;
  href: string | null;
  label: string | null;
  label_de: string | null;
  sort_order: number;
  visible: boolean;
  // Nested select page:pages(...) — null gdy relacja nie wróciła ALBO gdy to
  // link własny (nie ma czego joinować).
  page: {
    slug: string;
    title: string;
    title_de: string | null;
    published: boolean;
  } | null;
};

export type LocalizedMenuItem = { id: string; href: string; label: string };

// Wiersz jest linkiem własnym TYLKO, gdy `href` jest niepustym i poprawnym
// adresem wewnętrznym. Trzy pułapki, przed którymi to broni:
// 1. `href` nie zawsze wróci z bazy jako `null` — jeśli SELECT go nie
//    pobiera (dziś tak jest, MENU_SELECT w menu-server.ts nie ma tej
//    kolumny), w runtime jest `undefined`, a `undefined !== null` daje
//    fałszywy pozytyw. `menu-server.ts` rzutuje wynik przez `unknown`, więc
//    tsc tego nie złapie — sprawdzamy to więc tutaj, ręcznie.
// 2. `""` z bazy to też nie `null` — bez tego wiersz renderowałby `<a href="">`.
// 3. Format sprawdzany tym samym `validateMenuHref`, co przy zapisie w
//    Tasku 3 — na wypadek gdyby dane w bazie obszedły tamtą walidację, ten
//    chokepoint (jedyny wspólny dla NavStrip/MobileMenu/Footer) i tak nie
//    puści adresu spoza sklepu do globalnej nawigacji.
function linkHref(r: MenuItemRow): string | null {
  const h = typeof r.href === "string" ? r.href.trim() : "";
  if (h === "") return null;
  return validateMenuHref(h).ok ? h : null;
}

// Renderują się wyłącznie pozycje widoczne. Podstrona CMS musi być dodatkowo
// OPUBLIKOWANA (cofnięcie publikacji chowa link automatycznie); link własny
// wskazuje trasę z kodu, więc nie ma czego sprawdzać — o ile `href` jest
// poprawny (patrz `linkHref`). Etykieta: własna (label_de→label per pole)
// wygrywa nad tytułem strony (title_de→title).
export function prepareMenuItems(
  rows: MenuItemRow[] | null,
  location: MenuLocation,
  locale: Locale
): LocalizedMenuItem[] {
  if (rows === null) return [];
  const pick = (deCol: string | null, plCol: string | null) =>
    locale === "de" && deCol && deCol.trim() ? deCol : plCol;
  return rows
    .filter(
      (r) =>
        r.location === location &&
        r.visible &&
        (linkHref(r) !== null || (r.page !== null && r.page.published))
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((r) => {
      const custom = pick(r.label_de, r.label);
      // Link własny: etykieta jest jedynym źródłem nazwy (constraint
      // menu_items_href_needs_label pilnuje jej w bazie).
      const h = linkHref(r);
      if (h !== null) {
        return { id: r.id, href: h, label: (custom ?? "").trim() };
      }
      const page = r.page!;
      const label =
        custom && custom.trim()
          ? custom
          : pick(page.title_de, page.title) ?? page.title;
      return { id: r.id, href: `/${page.slug}`, label };
    })
    // Pozycja bez nazwy byłaby klikalna, ale niewidoczna. Baza tego broni,
    // kod i tak nie ufa danym.
    .filter((item) => item.label !== "");
}
