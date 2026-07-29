// Plain-text opisu produktu — jedno źródło dla meta description, JSON-LD Product
// i feedu do Google Merchant Center.
//
// DLACZEGO OSOBNY MODUŁ: logika żyła prywatnie w app/produkt/[id]/page.tsx.
// Feed produktowy potrzebuje DOKŁADNIE tego samego tekstu — rozjazd opisu między
// kartą produktu a ofertą w Google Shopping to błąd zgłaszany w panelu Merchant.
//
// Uwaga: `extractShortDescription` z product-html.ts robi coś INNEGO (pierwszy
// akapit jako podpis pod ceną, z wielokropkiem) i celowo nie dokłada spacji na
// granicach bloków. Tutaj chodzi o pełny, czytelny tekst dla robotów.

// Sekcje opisu w takim kształcie, w jakim trzymamy je w JSONB `description_sections`.
// Luźny typ (zamiast importu z types.ts) — feed czyta surowe kolumny z Supabase.
// Index signature: sekcje niosą też `title`, `url` itd., a tutaj czytamy tylko
// te cztery pola — nie chcemy dublować pełnego typu z types.ts.
type DescriptionSection = {
  kind?: string;
  body?: string | null;
  admin_body?: string | null;
  hidden?: boolean;
  [key: string]: unknown;
};

export type ProductTextSource = {
  description?: string | null;
  description_sections?: DescriptionSection[] | null;
};

// Tagi blokowe zamieniamy na spację PRZED usunięciem znaczników — inaczej
// "</p><li>" zniknęłoby bez śladu i wyrazy z dwóch bloków skleiłyby się
// ("skóraMiękka").
const BLOCK_BOUNDARY = /<\/?(p|li|ul|ol|h[1-6]|div|tr|td|th|table|section|br)\b[^>]*>/gi;

export function stripHtmlToText(html: string): string {
  return html
    .replace(BLOCK_BOUNDARY, " ")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

// Pełny opis jako plain text. Priorytet: pole `description`; gdy puste (tak jest
// dla produktów dodawanych po wyłączeniu syncu opisów) — składamy z widocznych
// sekcji tekstowych, bo one są wtedy jedynym źródłem treści.
//
// Akapity rozdzielamy podwójnym enterem: zwijanie białych znaków dzieje się
// WEWNĄTRZ sekcji, więc separator sekcji przeżywa.
export function productPlainText(product: ProductTextSource): string {
  const direct = product.description?.trim();
  if (direct && direct.length > 0) return stripHtmlToText(direct);

  return (product.description_sections ?? [])
    .filter((s) => s.kind === "text" && s.hidden !== true)
    .map((s) => stripHtmlToText((s.admin_body ?? s.body ?? "").trim()))
    .filter((text) => text.length > 0)
    .join("\n\n");
}
