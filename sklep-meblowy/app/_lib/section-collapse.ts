// Persystencja stanu zwinięcia sekcji edytora produktu w localStorage.
// Czyste funkcje (bez React) — testowalne w node env z mockiem localStorage.
// Klucz per sekcja (nie per produkt) → zwinięcie trzyma się przy kolejnych
// produktach. Wartość "1" = zwinięte, cokolwiek innego / brak = rozwinięte.

export const COLLAPSE_KEY_PREFIX = "admin.produkt.sekcja.";

export function readCollapsed(storageKey: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(COLLAPSE_KEY_PREFIX + storageKey) === "1";
  } catch {
    // storage niedostępny (tryb prywatny / wyłączony) → domyślnie rozwinięte
    return false;
  }
}

export function writeCollapsed(storageKey: string, collapsed: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(COLLAPSE_KEY_PREFIX + storageKey, collapsed ? "1" : "0");
  } catch {
    // storage niedostępny — ignorujemy (preferencja widoku, nie dane)
  }
}
