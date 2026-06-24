// Czysta logika cen Omnibus — bez zależności server-only (testowalne bez Supabase).
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

// Cena efektywna = promocyjna jeśli ustawiona i ŚCIŚLE niższa od regularnej.
export function effectivePrice(
  regular: number,
  salePrice: number | null | undefined
): number {
  return salePrice != null && salePrice < regular ? salePrice : regular;
}

export function isOnSale(
  regular: number,
  salePrice: number | null | undefined
): boolean {
  return salePrice != null && salePrice < regular;
}

export type PriceHistoryRow = { effective_price: number; recorded_at: string };

// Najniższa cena efektywna z 30 dni PRZED wprowadzeniem bieżącej obniżki.
// t0 = recorded_at najnowszego wiersza (DANE, nie zegar → deterministyczne).
// Referencja = MIN po cenach w [t0-30d, t0) + cena obowiązująca na początku okna.
// Brak wcześniejszej historii → null (wołający użyje ceny regularnej).
export function computeOmnibus(history: PriceHistoryRow[]): number | null {
  if (history.length === 0) return null;
  const sorted = [...history].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );
  const t0 = new Date(sorted[sorted.length - 1].recorded_at).getTime();
  const windowStart = t0 - THIRTY_DAYS_MS;
  const prior = sorted.slice(0, -1);
  if (prior.length === 0) return null;
  const inWindow = prior.filter(
    (r) => new Date(r.recorded_at).getTime() >= windowStart
  );
  const beforeWindow = prior.filter(
    (r) => new Date(r.recorded_at).getTime() < windowStart
  );
  const candidates = inWindow.map((r) => r.effective_price);
  if (beforeWindow.length > 0) {
    candidates.push(beforeWindow[beforeWindow.length - 1].effective_price);
  }
  return candidates.length ? Math.min(...candidates) : null;
}
