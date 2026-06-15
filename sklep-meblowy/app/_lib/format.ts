import type { Locale } from "./i18n";

// Centralny formatter cen dla witryny (NIE panel admina — admin zostaje PL).
// Ceny są zawsze w PLN; zmienia się tylko grupowanie/separator dziesiętny wg
// locale (pl-PL vs de-DE). Zachowujemy dotychczasową konwencję wizualną sklepu:
// liczba + sufiks " zł" (zamiast symbolu waluty z toLocaleString currency,
// który dla DE wstawiłby "PLN" zamiast "zł"). Dzięki temu wygląd jest spójny
// w obu językach, a tylko separatory dopasowują się do locale.
//
// Przykłady:
//   formatPrice(1299, "pl")  → "1 299 zł"
//   formatPrice(1299, "de")  → "1.299 zł"
//   formatPrice(1299.5, "de") → "1.299,5 zł"
export function formatPrice(amount: number, locale: Locale): string {
  const bcp47 = locale === "de" ? "de-DE" : "pl-PL";
  return `${amount.toLocaleString(bcp47)} zł`;
}
