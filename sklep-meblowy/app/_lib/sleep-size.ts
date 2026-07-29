// Czysta logika doboru materaca do łóżka po rozmiarze spania — bez zależności
// server-only, żeby była testowalna bez mockowania Supabase (wzorzec jak
// size-groups.ts / pricing.ts). Server-owe pobranie kandydatów jest w
// products.ts (getSizeMatchedCrossSell).

import { effectivePrice } from "./pricing";

// Kanoniczna forma rozmiaru spania: "160x200" — małe x, bez spacji, bez "cm".
// Porównania zawsze na tej formie; do wyświetlenia formatSleepSize.
export type SleepSize = string;

// Pierwsza para "liczba x liczba" w tekście. Wymaga sąsiedztwa przez sam
// separator, więc "H3 25 cm 120x200 cm" daje 120x200, a nie 25x120.
const SIZE_RE = /(\d{2,3})\s*[x×]\s*(\d{2,3})/i;

function matchSize(raw: string | null | undefined): SleepSize | null {
  if (!raw) return null;
  const m = SIZE_RE.exec(raw);
  if (!m) return null;
  return `${Number(m[1])}x${Number(m[2])}`;
}

// Rozmiar spania produktu: size_label (znormalizowany), a gdy go nie ma albo
// jest śmieciowy — z nazwy. `dimensions` świadomie pominięte: dla łóżka to
// wymiar zewnętrzny (160x200 → dimensions 180×210), więc dopasowanie po nim
// dawałoby błędne pary.
export function sleepSizeOf(item: {
  size_label?: string | null;
  name?: string | null;
}): SleepSize | null {
  return matchSize(item.size_label) ?? matchSize(item.name);
}

// "160x200" → "160×200 cm" (typograficzny × tylko do wyświetlenia).
export function formatSleepSize(size: SleepSize): string {
  return `${size.replace(/x/i, "×")} cm`;
}

// Minimum, które musi mieć kandydat, żeby dał się dopasować i posortować.
// Generyk w pickSizeMatched pozwala wołać to na pełnym Product albo na wąskim
// wierszu z selecta (id, category, name, size_label, price, sale_price).
export type SizeCandidate = {
  id: string;
  category: string;
  name: string;
  size_label: string | null;
  price: number;
  sale_price: number | null;
};

// Kandydaci w danym rozmiarze, posortowani: kolejność kategorii z
// categoryOrder (czyli cross_sell_categories — realne materace przed
// topperami), potem cena efektywna rosnąco, na koniec nazwa dla determinizmu.
// Kategoria poza categoryOrder trafia na koniec. Nie mutuje wejścia (filter
// tworzy nową tablicę).
export function pickSizeMatched<T extends SizeCandidate>(
  candidates: T[],
  size: SleepSize,
  categoryOrder: string[]
): T[] {
  const rank = new Map(categoryOrder.map((slug, i) => [slug, i]));
  const last = categoryOrder.length;
  return candidates
    .filter((c) => sleepSizeOf(c) === size)
    .sort((a, b) => {
      const ra = rank.get(a.category) ?? last;
      const rb = rank.get(b.category) ?? last;
      if (ra !== rb) return ra - rb;
      const pa = effectivePrice(a.price, a.sale_price);
      const pb = effectivePrice(b.price, b.sale_price);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name, "pl", { numeric: true });
    });
}
