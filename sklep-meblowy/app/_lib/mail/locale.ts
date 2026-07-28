// Język maila z waluty zamówienia. `orders` nie ma kolumny locale, ale EUR
// występuje WYŁĄCZNIE na /de (patrz sekcja EUR w ONBOARDING.md), więc waluta
// jednoznacznie wskazuje język. Dzięki temu bez migracji.
export function mailLocale(
  currency: string | null | undefined
): "pl" | "de" {
  return typeof currency === "string" && currency.toLowerCase() === "eur"
    ? "de"
    : "pl";
}
