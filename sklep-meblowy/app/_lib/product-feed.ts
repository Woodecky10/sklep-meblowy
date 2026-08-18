import { COMPANY } from "./company";
import { localizePath, type Locale } from "./i18n";

// Feed produktowy w formacie Google Merchant Center (RSS 2.0 + przestrzeń g:).
// Merchant Center czyta go z URL-a (app/feed.xml/route.ts) i na jego podstawie
// wystawia meble w bezpłatnych listach produktowych oraz kampaniach Shopping.
//
// Specyfikacja pól: https://support.google.com/merchants/answer/7052112
// Świadome decyzje:
// - `identifier_exists: no` — meble robione na zamówienie nie mają GTIN/EAN/MPN.
//   Bez tego pola Merchant odrzuca oferty jako "brakujący identyfikator".
// - `google_product_category` WYSYŁAMY od 2026-08-18. Wcześniej było pomijane
//   („Google kategoryzuje automatycznie"), ale katalog zgłosił ostrzeżenie dla
//   wszystkich 353 ofert, że brak tego pola ogranicza widoczność. Zasada z tamtej
//   decyzji zostaje: zgadnięty błędny identyfikator szkodzi bardziej niż brak —
//   dlatego identyfikatory są ODCZYTANE z oficjalnej taksonomii Google i żyją
//   w `gpc.ts`, a kategoria bez mapowania NIE dostaje pola zamiast dostać byle co.
//   Obok idzie dalej własne `product_type` (etykieta ze sklepu) — Google używa
//   obu do różnych rzeczy i jedno nie zastępuje drugiego.
// - dostawa NIE jest w feedzie — konfiguruje się ją raz w panelu Merchant Center
//   (stawki per kraj), zamiast powtarzać przy każdej ofercie.
// - `availability: in_stock` — produkcja na zamówienie, zawsze dostępne (spójnie
//   z JSON-LD na karcie produktu).

// Limity Merchant Center dla pól tekstowych.
const TITLE_MAX = 150;
const DESCRIPTION_MAX = 5000;
// image_link to zdjęcie główne; pozostałe idą jako additional_image_link (max 10).
const ADDITIONAL_IMAGES_MAX = 10;

export type FeedCurrency = "PLN" | "EUR";

export type FeedProduct = {
  id: string;
  name: string;
  // Opis MUSI być już plain textem (bez HTML) — patrz stripHtml w karcie produktu.
  description: string;
  price: number;
  salePrice?: number | null;
  images?: string[] | null;
  categoryLabel?: string | null;
  // Identyfikator Google Product Category — wyliczany przez resolveGpc z gpc.ts
  // (tam mapa i uzasadnienie). null/undefined = pole świadomie pominięte.
  googleProductCategory?: number | null;
  // size_group ze sklepu = item_group_id w feedzie: Google grupuje rozmiary
  // tego samego modelu w jedną ofertę z wariantami zamiast dublować wyniki.
  sizeGroup?: string | null;
};

export type SkipReason = "brak-zdjecia" | "brak-ceny" | "brak-nazwy";

// Cena w formacie wymaganym przez Merchant: kropka dziesiętna, dwa miejsca,
// spacja, kod waluty ISO. Bez separatora tysięcy.
export function formatFeedPrice(amount: number, currency: FeedCurrency): string {
  return `${amount.toFixed(2)} ${currency}`;
}

// Odsiewa oferty, które Merchant i tak odrzuciłby. Zwraca też listę pominiętych
// z powodem — route loguje ją, żeby braki w danych były widoczne u nas, a nie
// dopiero jako błędy w panelu Google.
export function selectFeedItems(products: FeedProduct[]): {
  included: FeedProduct[];
  skipped: { id: string; reason: SkipReason }[];
} {
  const included: FeedProduct[] = [];
  const skipped: { id: string; reason: SkipReason }[] = [];

  for (const p of products) {
    if (p.name.trim().length === 0) {
      skipped.push({ id: p.id, reason: "brak-nazwy" });
      continue;
    }
    if (!(p.price > 0)) {
      skipped.push({ id: p.id, reason: "brak-ceny" });
      continue;
    }
    const firstImage = (p.images ?? []).find(
      (u) => typeof u === "string" && u.trim().length > 0
    );
    if (!firstImage) {
      skipped.push({ id: p.id, reason: "brak-zdjecia" });
      continue;
    }
    included.push(p);
  }

  return { included, skipped };
}

// Escape tekstu do treści elementu XML. Kolejność ma znaczenie: `&` pierwsze,
// inaczej podwójnie escapowalibyśmy encje utworzone poniżej.
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Element XML z escapowaną treścią. Obcinanie ZAWSZE przed escapowaniem —
// inaczej limit mógłby przeciąć encję (&amp;) w połowie.
function tag(name: string, value: string, maxLength?: number): string {
  const raw = maxLength ? value.slice(0, maxLength) : value;
  return `    <${name}>${escapeXml(raw)}</${name}>`;
}

// Buduje kompletny feed. Waluta i locale muszą być spójne: feed PL → PLN i
// linki /produkt/..., feed DE → EUR i linki /de/produkt/... (Merchant Center
// wymaga osobnego feedu per kraj/język).
export function buildProductFeedXml(
  products: FeedProduct[],
  opts: { locale: Locale; currency: FeedCurrency }
): string {
  const base = `https://${COMPANY.domain}`;
  const { included } = selectFeedItems(products);

  const items = included.map((p) => {
    const allImages = (p.images ?? []).filter(
      (u) => typeof u === "string" && u.trim().length > 0
    );
    const [mainImage, ...restImages] = allImages;
    const productPath = localizePath(`/produkt/${p.id}`, opts.locale);

    const lines = [
      "  <item>",
      tag("g:id", p.id),
      tag("g:title", p.name.trim(), TITLE_MAX),
      tag("g:description", p.description.trim(), DESCRIPTION_MAX),
      tag("g:link", `${base}${productPath}`),
      tag("g:image_link", mainImage),
      ...restImages
        .slice(0, ADDITIONAL_IMAGES_MAX)
        .map((url) => tag("g:additional_image_link", url)),
      tag("g:availability", "in_stock"),
      tag("g:price", formatFeedPrice(p.price, opts.currency)),
    ];

    // sale_price tylko przy realnej obniżce — równa cena to nie promocja, a
    // Merchant zgłasza rozjazd "sale_price nie niższa od price".
    if (typeof p.salePrice === "number" && p.salePrice > 0 && p.salePrice < p.price) {
      lines.push(tag("g:sale_price", formatFeedPrice(p.salePrice, opts.currency)));
    }

    lines.push(tag("g:brand", COMPANY.brandName));
    lines.push(tag("g:condition", "new"));
    lines.push(tag("g:identifier_exists", "no"));

    // Identyfikator liczbowy, nie ścieżka tekstowa: ścieżka jest zależna od
    // języka taksonomii, a numer znaczy to samo w każdym regionie.
    if (typeof p.googleProductCategory === "number") {
      lines.push(
        tag("g:google_product_category", String(p.googleProductCategory))
      );
    }
    if (p.categoryLabel && p.categoryLabel.trim().length > 0) {
      lines.push(tag("g:product_type", p.categoryLabel.trim()));
    }
    if (p.sizeGroup && p.sizeGroup.trim().length > 0) {
      lines.push(tag("g:item_group_id", p.sizeGroup.trim()));
    }

    lines.push("  </item>");
    return lines.join("\n");
  });

  const channelTitle =
    opts.locale === "de" ? `${COMPANY.brandName} — Möbel` : `${COMPANY.brandName} — meble`;
  const channelDescription =
    opts.locale === "de"
      ? "Produktdatenfeed für Google Merchant Center"
      : "Feed produktowy dla Google Merchant Center";

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">',
    "  <channel>",
    `    <title>${escapeXml(channelTitle)}</title>`,
    `    <link>${base}</link>`,
    `    <description>${escapeXml(channelDescription)}</description>`,
    ...items,
    "  </channel>",
    "</rss>",
  ].join("\n");
}
