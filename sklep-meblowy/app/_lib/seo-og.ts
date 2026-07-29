import { COMPANY } from "./company";
import type { Locale } from "./i18n";
import { resolveThemeTokens, type ThemeSettings } from "./theme";

// Czyste helpery Open Graph — jedno źródło bloku `openGraph` dla wszystkich stron.
//
// DLACZEGO TO ISTNIEJE (gotcha Next 16):
// Next scala metadane MIĘDZY segmentami tylko płytko, a pole `openGraph`
// NADPISUJE w całości — patrz node_modules/next/dist/lib/metadata/resolve-metadata.js
// (`case "openGraph": newResolvedMetadata.openGraph = resolveOpenGraph(...)`)
// oraz docs/.../generate-metadata.md#merging. Skutek: strona eksportująca samo
// `openGraph: { locale }` gubiła og:image i og:site_name z layoutu — home i
// /sklep szły na Facebooka BEZ obrazka. Dlatego każda strona buduje pełny blok
// przez `baseOpenGraph`, a nie dokłada pojedynczych pól.
//
// Obrazek brandowy NIE może być SVG-iem (Facebook/LinkedIn/WhatsApp go nie
// renderują) — serwuje go `app/og/route.tsx` jako PNG 1200×630.

export type OgImage = { url: string; width?: number; height?: number; alt?: string };

// Domyślny obrazek udostępnień. `url` musi zgadzać się ze ścieżką route handlera
// w app/og/route.tsx (relatywna — Next rozwiąże ją względem metadataBase).
export const OG_BRAND_IMAGE = {
  url: "/og",
  width: 1200,
  height: 630,
  alt: `${COMPANY.brandName} — meble tapicerowane na wymiar`,
} as const satisfies OgImage;

// Pełny blok openGraph dla strony. `extra.images` to zwykle zdjęcia produktu —
// gdy ich nie ma (albo są puste), degradujemy do obrazka brandowego, żeby
// udostępnienie NIGDY nie poszło bez obrazka.
export function baseOpenGraph(
  locale: Locale,
  extra?: { images?: (string | null | undefined)[] }
): {
  type: "website";
  locale: string;
  siteName: string;
  images: OgImage[];
} {
  const provided = (extra?.images ?? [])
    .filter((u): u is string => typeof u === "string" && u.trim().length > 0)
    .map((url) => ({ url }));

  return {
    type: "website",
    locale: locale === "de" ? "de_DE" : "pl_PL",
    siteName: COMPANY.brandName,
    images: provided.length > 0 ? provided : [{ ...OG_BRAND_IMAGE }],
  };
}

export type OgPalette = { background: string; accent: string; text: string };

// Kolory obrazka /og z motywu sklepu (/admin/wyglad) — nie zaszyte hexy.
// Maile robią to samo (app/_lib/mail/branding.ts), więc po zmianie palety przez
// Olę obrazek udostępnień i maile zostają spójne z resztą marki.
//
// Bierzemy tokeny `light`: navy/gold/cream to barwy MARKI (identyczne w obu
// trybach każdego presetu), a nie tła interfejsu — karta OG jest ciemna
// (granatowe tło + kremowy tekst + złoty akcent) niezależnie od trybu widza.
export function ogBrandPalette(settings: ThemeSettings): OgPalette {
  const { light } = resolveThemeTokens(settings);
  return { background: light.navy, accent: light.gold, text: light.cream };
}
