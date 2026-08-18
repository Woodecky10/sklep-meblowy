// Wybór widoku produktów na /sklep: slider albo dzisiejsza lista.
//
// Reguła jest JEDNA i celowo nie ma wyjątków: slider dostaje wyłącznie czyste
// wejście w kolekcję (`/sklep?kolekcja=...`). Cokolwiek zawęża albo przestawia
// wynik — kategoria, fraza, cena, wymiar, facet, sortowanie, numer strony —
// oddaje sterowanie liście. Dzięki temu dotknięcie filtra samo przełącza widok
// i nie trzeba nigdzie trzymać stanu „user chciał listę".
//
// Czysty moduł, bez I/O — testowany bez bazy i bez przeglądarki.
//
// Nowa kolekcja NIE wymaga tu żadnego wpisu: warunek patrzy na kształt adresu,
// nie na listę kolekcji.

export type ShopView = "slider" | "list";

// Parametry, których obecność oznacza „user pracuje z listą".
// `widok` jest tu świadomie: to jedyne zadanie przycisku „Pokaż wszystkie jako
// listę" — dołożyć `widok=lista` do adresu. Powrotu do slidera nie robi drugi
// parametr, tylko link bez tego jednego (patrz sliderHref niżej).
const LIST_PARAMS = new Set([
  "widok",
  "kategoria",
  "sekcja",
  "q",
  "sortuj",
  "strona",
  "cena_od",
  "cena_do",
  "dostepne",
  "szer_od",
  "szer_do",
  "gl_od",
  "gl_do",
  "wys_od",
  "wys_do",
]);

// Next oddaje string[] dla powtórzonego parametru (?kolekcja=a&kolekcja=b),
// mimo że typ obiecuje string — ten sam problem co `first()` w app/sklep/page.tsx.
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

function isFilterKey(key: string): boolean {
  return (
    LIST_PARAMS.has(key) ||
    key.startsWith("opcja_") ||
    key.startsWith("cecha_")
  );
}

export function resolveShopView(
  searchParams: Record<string, string | string[] | undefined>
): ShopView {
  if (!first(searchParams.kolekcja)?.trim()) return "list";

  for (const [key, value] of Object.entries(searchParams)) {
    if (key === "kolekcja") continue;
    // Pusta wartość zostaje po wyczyszczeniu formularza filtrów (`?q=`) i nie
    // zawęża niczego — traktowanie jej jak filtra zabierałoby slider bez powodu.
    if (!first(value)?.trim()) continue;
    // Nieznanych parametrów NIE liczymy jako filtr. Pinterest, Google Ads i
    // newsletter doklejają `utm_*`, `fbclid`, `gclid` — gdyby przełączały widok,
    // płatny ruch dostawałby inny układ strony niż organiczny, po cichu.
    if (isFilterKey(key)) return "list";
  }

  return "slider";
}
