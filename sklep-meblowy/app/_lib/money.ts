// Warstwa pieniędzy dla /de. Ceny w DB i w koszyku są ZAWSZE w PLN — tu liczymy
// EUR tylko do wyświetlenia i do checkoutu. Konwersja: pełne euro w górę
// (drobny bufor na ryzyko kursowe). Format EUR = grupowanie de-DE + " €".
import { formatPrice } from "./format";
import type { Locale } from "./i18n";

export function convertToEur(pln: number, rate: number): number {
  return Math.ceil(pln * rate);
}

export function formatEur(eur: number): string {
  return `${eur.toLocaleString("de-DE")} €`;
}

// Cena katalogowa (w DB zawsze PLN). /de przelicza i pokazuje EUR; / zostaje PLN.
export function formatMoney(plnAmount: number, locale: Locale, rate: number): string {
  if (locale === "de") return formatEur(convertToEur(plnAmount, rate));
  return formatPrice(plnAmount, locale);
}

// Kwota zamówienia — już zapisana w walucie pobrania, więc TYLKO formatujemy
// (bez ponownej konwersji). Formatujemy wg waluty zamówienia, nie wg locale.
export function formatOrderAmount(amount: number, currency: "pln" | "eur"): string {
  if (currency === "eur") return formatEur(amount);
  return formatPrice(amount, "pl");
}
