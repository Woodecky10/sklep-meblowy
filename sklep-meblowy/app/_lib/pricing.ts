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

export type PriceUnit = {
  variant_key: string | null;
  regular: number;
  sale: number | null | undefined;
};

export type PriceUpdatePlan = {
  inserts: { variant_key: string | null; effective_price: number }[];
  // tylko dla jednostek, których cena się zmieniła (null = wyczyść omnibus)
  omnibus: { variant_key: string | null; value: number | null }[];
};

// Czysto: dla każdej jednostki porównuje cenę efektywną z ostatnim wpisem
// historii; gdy się zmieniła — planuje insert i przelicza omnibus (z nowym
// wierszem jako t0). `now` przekazywane (deterministyczne testy).
export function computePriceUpdates(
  units: PriceUnit[],
  history: { variant_key: string | null; effective_price: number; recorded_at: string }[],
  now: string
): PriceUpdatePlan {
  const byKey = new Map<string | null, PriceHistoryRow[]>();
  for (const r of history) {
    const arr = byKey.get(r.variant_key) ?? [];
    arr.push({ effective_price: r.effective_price, recorded_at: r.recorded_at });
    byKey.set(r.variant_key, arr);
  }
  const inserts: PriceUpdatePlan["inserts"] = [];
  const omnibus: PriceUpdatePlan["omnibus"] = [];
  for (const u of units) {
    const eff = effectivePrice(u.regular, u.sale);
    const hist = (byKey.get(u.variant_key) ?? [])
      .slice()
      .sort((a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime());
    const latest = hist.length ? hist[hist.length - 1].effective_price : null;
    if (latest !== null && latest === eff) continue; // bez zmiany
    inserts.push({ variant_key: u.variant_key, effective_price: eff });
    const withNew = [...hist, { effective_price: eff, recorded_at: now }];
    const value = isOnSale(u.regular, u.sale)
      ? computeOmnibus(withNew) ?? u.regular
      : null;
    omnibus.push({ variant_key: u.variant_key, value });
  }
  return { inserts, omnibus };
}

// Co napisać na wstążce (albo nic). Precedencja: ręczny napis > automat z ceny >
// brak wstążki. Ręczny napis działa też bez obniżki — to świadoma decyzja
// właściciela; formularz w panelu ostrzega wtedy o Omnibusie.
export function ribbonText(
  p: { price: number; sale_price: number | null; promo_badge: string | null },
  fallback: string
): string | null {
  if (p.promo_badge) return p.promo_badge;
  return isOnSale(p.price, p.sale_price) ? fallback : null;
}

// Czy napis obiecuje obniżkę ceny. Używane WYŁĄCZNIE do ostrzeżenia w panelu:
// „Promocja" bez faktycznej ceny promocyjnej to komunikat o obniżce, a wtedy
// dyrektywa Omnibus wymaga pokazania najniższej ceny z 30 dni. Heurystyka ma
// łapać typowe napisy, nie udawać prawnika — dlatego ostrzega, a nie blokuje.
const DISCOUNT_CLAIM = /promo|sale|rabat|%|wyprzedaz|obnizk|obniz|taniej|okazj/;

export function looksLikeDiscountClaim(text: string): boolean {
  const normalized = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // zdejmuje kreski/ogonki: ż→z, ą→a, ó→o
    .replace(/ł/g, "l");             // ł NIE rozkłada się przez NFD — osobno
  return DISCOUNT_CLAIM.test(normalized);
}
