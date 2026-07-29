import { COMPANY } from "./company";
import { localizeHref, type Locale } from "./i18n";

// Czyste buildery danych strukturalnych (schema.org) — wspólne dla całego sklepu.
//
// Product JSON-LD zostaje w app/produkt/[id]/page.tsx (zależy od cen/wariantów);
// tutaj żyją bloki globalne: Organization (kim jest sklep) i BreadcrumbList
// (ścieżka nawigacji, którą Google pokazuje w wyniku zamiast surowego URL-a).

const BASE = `https://${COMPANY.domain}`;

// Kotwica @id — inne bloki (np. Product.brand) mogą referować tę samą encję
// zamiast duplikować dane firmy.
export const ORGANIZATION_ID = `${BASE}/#organization`;

// Serializacja do wstawienia w <script type="application/ld+json">.
// Escape `<` → <: bez tego nazwa produktu zawierająca "</script>" wybiłaby
// się z bloku i wstrzyknęła skrypt (audyt 2026-06-11, LOW). JSON.parse czyta
// < z powrotem jako `<`, więc dane pozostają nienaruszone dla Google.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

// Kim jest sklep — jedna encja Organization dla całej witryny (wstawiana w
// layoucie, więc obecna na każdej stronie). Spina domenę z danymi firmy i
// wizytówką Google. `logo` musi być rastrem: Google odrzuca SVG w polu logo,
// dlatego wskazujemy /icon-512.png z public/ (stabilny URL), a nie /logo.svg.
export function buildOrganizationJsonLd(): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: COMPANY.brandName,
    legalName: COMPANY.legalName,
    url: BASE,
    logo: `${BASE}/icon-512.png`,
    email: COMPANY.email,
    ...(COMPANY.phone ? { telephone: COMPANY.phone } : {}),
    vatID: `PL${COMPANY.nip}`,
    taxID: COMPANY.nip,
    foundingDate: String(COMPANY.foundedYear),
    address: {
      "@type": "PostalAddress",
      streetAddress: COMPANY.address.street,
      postalCode: COMPANY.address.postalCode,
      addressLocality: COMPANY.address.city,
      addressCountry: "PL",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer service",
      email: COMPANY.email,
      ...(COMPANY.phone ? { telephone: COMPANY.phone } : {}),
      // Sklep obsługuje PL i DE (/de) — Google pokazuje język obsługi.
      availableLanguage: ["pl", "de"],
    },
  };
}

// Okruch nawigacji. `path` relatywny w wersji PL (jak w sitemapie) — lokalizacja
// i URL absolutny dolicza się tutaj. Ostatni okruch = bieżąca strona: bez `path`.
export type Breadcrumb = { name: string; path?: string };

// BreadcrumbList dla Google. Zwraca null gdy ścieżka jest krótsza niż 2 okruchy
// (pojedynczy element nie jest ścieżką i Google go odrzuca).
//
// `item` musi być URL-em ABSOLUTNYM. Ostatni element celowo bez `item` — to
// strona, na której klient już jest (wzorzec z dokumentacji Google).
export function buildBreadcrumbJsonLd(
  crumbs: Breadcrumb[],
  locale: Locale
): Record<string, unknown> | null {
  const named = crumbs.filter((c) => c.name.trim().length > 0);
  if (named.length < 2) return null;

  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: named.map((crumb, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: crumb.name.trim(),
      // Ostatni okruch bez `item`; pozostałe z absolutnym URL-em w bieżącym locale.
      ...(crumb.path && i < named.length - 1
        ? { item: `${BASE}${localizeHref(crumb.path, locale)}` }
        : {}),
    })),
  };
}
