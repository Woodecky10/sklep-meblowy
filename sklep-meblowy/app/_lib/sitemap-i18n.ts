import { localizePath } from "./i18n";

// Czyste helpery hreflang/alternates dla SEO i18n PL/DE.
//
// DESIGN: DE jest publikowane w SEO TYLKO gdy strona ma treść DE (`hasDe`).
// Strony nieprzetłumaczone: brak alternaty `de` (żeby Google.de nie indeksował
// pół-polskich stron). `x-default` zawsze wskazuje na URL PL (kanon źródłowy).

export type HreflangMap = { languages: Record<string, string> };

// Mapa hreflang z RELATYWNYMI ścieżkami — dla `generateMetadata.alternates`.
// Next rozwiązuje je względem `metadataBase` (ustawionego w app/layout.tsx).
//
//   alternatesFor("/produkt/abc", { hasDe: true })
//     → { languages: { pl: "/produkt/abc", de: "/de/produkt/abc", "x-default": "/produkt/abc" } }
//   alternatesFor("/produkt/abc", { hasDe: false })
//     → { languages: { pl: "/produkt/abc", "x-default": "/produkt/abc" } }  (brak de)
export function alternatesFor(
  plPath: string,
  opts: { hasDe: boolean }
): HreflangMap {
  const languages: Record<string, string> = {
    pl: plPath,
    ...(opts.hasDe ? { de: localizePath(plPath, "de") } : {}),
    "x-default": plPath,
  };
  return { languages };
}

// Mapa hreflang z ABSOLUTNYMI URL-ami (BASE + ścieżka) — dla wpisów
// `MetadataRoute.Sitemap.alternates`. W sitemapie Next NIE rozwiązuje URL-i
// względem metadataBase (inaczej niż w generateMetadata), więc muszą być pełne
// — patrz node_modules/next/dist/docs/.../metadata/sitemap.md (przykład localized).
//
// DRY: reużywa `alternatesFor` jako jedynego źródła kształtu mapy languages,
// jedynie prefiksując każdą wartość BASE-em.
export function sitemapAlternates(
  plPath: string,
  opts: { hasDe: boolean },
  base: string
): HreflangMap {
  const { languages } = alternatesFor(plPath, opts);
  const absolute: Record<string, string> = {};
  for (const [key, path] of Object.entries(languages)) {
    absolute[key] = `${base}${path}`;
  }
  return { languages: absolute };
}
