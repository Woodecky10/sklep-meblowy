// Pozycje menu (spec 2026-07-14, krok D) — CZYSTY moduł: filtr, sort,
// lokalizacja etykiet, podział Navbara na inline/„Więcej". Fetch żyje
// w menu-server.ts (split pure/server jak pages.ts / blocks.ts).

import type { Locale } from "./i18n";

export const MENU_LOCATIONS = ["navbar", "footer"] as const;
export type MenuLocation = (typeof MENU_LOCATIONS)[number];

export function isMenuLocation(v: string): v is MenuLocation {
  return (MENU_LOCATIONS as readonly string[]).includes(v);
}

// Limit paska: powyżej 4 pozycji nadmiar ląduje w dropdownie „Więcej".
export const NAVBAR_MAX_INLINE = 4;

export type MenuItemRow = {
  id: string;
  location: string;
  page_id: string;
  label: string | null;
  label_de: string | null;
  sort_order: number;
  visible: boolean;
  // Nested select page:pages(...) — null gdy relacja nie wróciła.
  page: {
    slug: string;
    title: string;
    title_de: string | null;
    published: boolean;
  } | null;
};

export type LocalizedMenuItem = { id: string; href: string; label: string };

// Renderują się wyłącznie pozycje widoczne, wskazujące OPUBLIKOWANE strony
// (cofnięcie publikacji chowa link automatycznie). Etykieta: własna
// (label_de→label per pole) wygrywa nad tytułem strony (title_de→title).
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
        r.page !== null &&
        r.page.published
    )
    .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id))
    .map((r) => {
      const page = r.page!;
      const custom = pick(r.label_de, r.label);
      const label =
        custom && custom.trim()
          ? custom
          : pick(page.title_de, page.title) ?? page.title;
      return { id: r.id, href: `/${page.slug}`, label };
    });
}

export function splitNavbarItems(items: LocalizedMenuItem[]): {
  inline: LocalizedMenuItem[];
  overflow: LocalizedMenuItem[];
} {
  if (items.length <= NAVBAR_MAX_INLINE) return { inline: items, overflow: [] };
  return {
    inline: items.slice(0, NAVBAR_MAX_INLINE),
    overflow: items.slice(NAVBAR_MAX_INLINE),
  };
}
