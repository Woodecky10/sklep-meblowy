// Wybrane produkty pokazywane w sekcji „Meble w tej tkaninie" na stronie
// tkaniny — CZYSTY parser wartości z formularza admina (hidden input
// featured_product_ids_json). Wzorzec parseColorRows z app/admin/tkaniny/
// actions.ts: zły JSON → [], tylko niepuste stringi, dedupe z zachowaniem
// kolejności pierwszego wystąpienia, twardy limit wierszy.

export const MAX_FEATURED_PRODUCTS = 20;

export function parseFeaturedProductIds(input: unknown): string[] {
  if (typeof input !== "string") return [];
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (out.length >= MAX_FEATURED_PRODUCTS) break;
    if (typeof r !== "string") continue;
    const id = r.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
