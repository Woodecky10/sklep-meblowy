import type { Locale } from "./i18n";

// Globalny słownik "info o wariancie": klucz = para (nazwa opcji, wartość).
// Czyste helpery (bez importów serwerowych) — używane też client-side w VariantSelector.

export type VariantInfoRow = {
  option_name: string;
  value: string;
  info: string | null;
  info_de: string | null;
};

export type VariantInfoEntry = { info: string; info_de: string | null };

// Limit długości krótkiej informacji (tooltip).
export const VARIANT_INFO_MAX_LEN = 200;

// Stabilny klucz pary opcja+wartość. Separator NUL ( ) nie występuje w
// nazwach opcji ani wartościach — brak kolizji.
export function variantInfoKey(optionName: string, value: string): string {
  return `${optionName} ${value}`;
}

// Buduje mapę klucz → {info, info_de} z wierszy DB. Pomija wpisy bez treści PL
// (info puste/whitespace). Przycina białe znaki; puste info_de → null.
export function buildVariantInfoMap(rows: VariantInfoRow[]): Record<string, VariantInfoEntry> {
  const out: Record<string, VariantInfoEntry> = {};
  for (const r of rows) {
    const info = (r.info ?? "").trim();
    if (!info) continue;
    const de = (r.info_de ?? "").trim();
    out[variantInfoKey(r.option_name, r.value)] = { info, info_de: de || null };
  }
  return out;
}

// Zlokalizowany tekst (DE→fallback PL). Brak wpisu → null.
export function variantInfoText(entry: VariantInfoEntry | undefined, locale: Locale): string | null {
  if (!entry) return null;
  if (locale === "de") return entry.info_de ?? entry.info;
  return entry.info;
}

// Normalizuje surowe wpisy z edytora: trim + limit długości; niepuste → upsert,
// puste (po trim) → delete. info_de puste → null.
export function normalizeVariantInfoInput(
  raw: { option_name: string; value: string; info: string; info_de: string }[]
): { upserts: VariantInfoRow[]; deletes: { option_name: string; value: string }[] } {
  const upserts: VariantInfoRow[] = [];
  const deletes: { option_name: string; value: string }[] = [];
  for (const r of raw) {
    const info = (r.info ?? "").trim().slice(0, VARIANT_INFO_MAX_LEN);
    const de = (r.info_de ?? "").trim().slice(0, VARIANT_INFO_MAX_LEN);
    if (info) {
      upserts.push({ option_name: r.option_name, value: r.value, info, info_de: de || null });
    } else {
      deletes.push({ option_name: r.option_name, value: r.value });
    }
  }
  return { upserts, deletes };
}
