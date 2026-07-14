// Filtry opcji wariantów (?opcja_<slug>=w1,w2) i wymiarów (?szer_od= itd.)
// na /sklep. Czyste funkcje (bez importów server-only), testowalne w node —
// wzorzec fabric-filter.ts. Nazwy opcji to wolne stringi admina z mieszanym
// casingiem (ROZMIAR/Rozmiar), więc grupujemy po znormalizowanej nazwie.

export const OPTION_PARAM_PREFIX = "opcja_";

// „Tkanina" ma dedykowany filtr rodzin tkanin (fabric-filter.ts) — nie
// dublujemy jej w generycznych filtrach opcji.
export const EXCLUDED_OPTION_SLUGS: Set<string> = new Set(["tkanina"]);

// "  POWIERZCHNIA   SPANIA " → "powierzchnia spania" (klucz grupowania).
export function normalizeOptionName(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

// Wyświetlana forma grupy: "ROZMIAR" → "Rozmiar".
export function displayOptionName(name: string): string {
  const n = normalizeOptionName(name);
  return n.length === 0 ? n : n[0].toUpperCase() + n.slice(1);
}

// Slug do parametru URL: bez polskich znaków, tylko [a-z0-9-].
// "STELAŻ" → "stelaz", "POWIERZCHNIA SPANIA" → "powierzchnia-spania".
// ł nie rozkłada się przez NFD (to nie litera+znak diakrytyczny) — ręcznie.
export function optionParamSlug(name: string): string {
  return normalizeOptionName(name)
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
