// Parametry produktu (sekcja „Specyfikacja" pod zdjęciem) — CZYSTY parser
// wierszy z formularza admina (hidden input features_json, JSON [{key,value}]).
// Wzorzec parseFeaturedProductIds: zły JSON → [], trim + limity długości,
// puste pomijane, dedupe kluczy case-insensitive (duplikat = kolizja React key
// w <dl> na karcie — pierwszy wygrywa), twardy limit wierszy.
import type { ProductFeature } from "./types";

export const MAX_FEATURES = 30;

export function parseFeatureRows(input: unknown): ProductFeature[] {
  if (typeof input !== "string") return [];
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: ProductFeature[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (out.length >= MAX_FEATURES) break;
    if (!r || typeof r !== "object") continue;
    const rec = r as { key?: unknown; value?: unknown };
    const key = typeof rec.key === "string" ? rec.key.trim().slice(0, 100) : "";
    const value = typeof rec.value === "string" ? rec.value.trim().slice(0, 300) : "";
    if (!key || !value) continue;
    const dedupeKey = key.toLowerCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    out.push({ key, value });
  }
  return out;
}
