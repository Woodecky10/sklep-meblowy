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

// Lista startowa sugestii nazw parametrów (edytor produktu) — kanoniczna
// pisownia: przy dedupe wygrywa z pisownią spotkaną w bazie.
export const SEED_FEATURE_KEYS: string[] = [
  "Głębokość siedziska",
  "Grubość boczka",
  "Materac wbudowany",
  "Pojemnik na pościel",
  "Powierzchnia spania",
  "Szerokość dwójki",
  "Szerokość otomany",
  "Tył mebla tapicerowany",
  "Wysokość boczka",
  "Wysokość materaca",
  "Wysokość nóżek",
  "Wysokość poduszki",
  "Wysokość siedziska",
  "Wysokość skrzyni",
];

// Klucze pomijane na karcie produktu (mają dedykowane pola) — jedno źródło
// prawdy dla renderu specyfikacji (produkt/[id]/page.tsx) i filtra sugestii.
export const DEDICATED_FEATURE_KEYS: string[] = [
  "kolor",
  "materiał",
  "material",
  "wymiary",
  "konstrukcja",
  "czas realizacji",
  "gwarancja",
  "waga",
];

// Sugestie nazw parametrów dla edytora: SEED_FEATURE_KEYS ∪ klucze z surowych
// kolumn `features` (jsonb) wielu produktów. Wejście defensywne (unknown[]).
// Dedupe po trim + lowercase (pierwszy wygrywa — seed idzie pierwszy), filtr
// DEDICATED_FEATURE_KEYS, klucz nie-string/pusty/>100 zn. pomijany, wynik
// sortowany po polsku.
export function collectFeatureKeySuggestions(featuresLists: unknown[]): string[] {
  const dedicated = new Set(DEDICATED_FEATURE_KEYS.map((k) => k.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const key = raw.trim();
    if (!key || key.length > 100) return;
    const lower = key.toLowerCase();
    if (dedicated.has(lower) || seen.has(lower)) return;
    seen.add(lower);
    out.push(key);
  };
  for (const k of SEED_FEATURE_KEYS) push(k);
  for (const list of featuresLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      push((item as { key?: unknown }).key);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "pl"));
}
