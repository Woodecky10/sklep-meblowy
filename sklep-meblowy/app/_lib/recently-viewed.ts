// Ostatnio oglądane produkty — lekki snapshot trzymany w localStorage
// (analogicznie do snapshotów koszyka w CartContext). Tu mieszka tylko czysta
// logika listy; odczyt/zapis localStorage i render są w komponencie klienckim.

export type RecentlyViewedItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  category: string;
};

// Ile produktów trzymamy/pokazujemy.
export const RECENTLY_VIEWED_MAX = 8;

// localStorage key (prefiks spójny z CartContext: "mollien-...").
export const RECENTLY_VIEWED_LS_KEY = "mollien-recently-viewed";

// Dokłada produkt na początek listy. Jeśli już jest (po id) — usuwa starą
// pozycję i wstawia świeży snapshot na początek (bez duplikatu, z aktualną
// ceną/nazwą). Przycina do `max`. Czysta funkcja — nie mutuje wejścia.
export function addRecentlyViewed(
  list: RecentlyViewedItem[],
  item: RecentlyViewedItem,
  max: number = RECENTLY_VIEWED_MAX
): RecentlyViewedItem[] {
  const withoutDup = list.filter((p) => p.id !== item.id);
  return [item, ...withoutDup].slice(0, max);
}
