// Harmonogram promocji — czysta logika okien (testowalna bez Supabase).
// Podział odpowiedzialności za cenę: `sale_price` to cena OBOWIĄZUJĄCA TERAZ i
// pisze ją wyłącznie reconciler; `sale_price_planned` + okno to PLAN z panelu.
// Dzięki temu każde miejsce czytające cenę (isOnSale, feed, checkout, JSON-LD)
// zostaje bez zmian, a historia cen zapisuje się w chwili realnego przełączenia.
import { isOnSale } from "./pricing";

export type SaleScheduleRow = {
  id: string;
  price: number;
  sale_price: number | null;
  sale_price_planned: number | null;
  sale_from: string | null;
  sale_to: string | null;
  promo_badge: string | null;
};

// Daty to dni Europe/Warsaw w formacie YYYY-MM-DD — czyli dokładnie to, co
// trzyma kolumna `date`. Porównania stringowe są poprawne, bo format jest
// leksykograficznie zgodny z chronologią.
function withinWindow(from: string | null, to: string | null, today: string): boolean {
  if (from !== null && today < from) return false;
  if (to !== null && today > to) return false;
  return true;
}

// Cena, która POWINNA obowiązywać dziś. Warunek „ściśle niższa" jest ten sam co
// w isOnSale — inaczej dałoby się zaplanować „promocję" równą cenie regularnej.
function desiredSalePrice(row: SaleScheduleRow, today: string): number | null {
  const planned = row.sale_price_planned;
  if (planned === null) return null;
  if (!isOnSale(row.price, planned)) return null;
  if (!withinWindow(row.sale_from, row.sale_to, today)) return null;
  return planned;
}

// Zwraca WYŁĄCZNIE wiersze, w których stan faktyczny różni się od pożądanego →
// funkcja jest idempotentna, a wołający nie robi zapisów bez potrzeby.
export function planSaleActivation(
  rows: SaleScheduleRow[],
  today: string
): { id: string; sale_price: number | null }[] {
  const out: { id: string; sale_price: number | null }[] = [];
  for (const r of rows) {
    const desired = desiredSalePrice(r, today);
    if (desired !== r.sale_price) out.push({ id: r.id, sale_price: desired });
  }
  return out;
}

export type SaleStatus =
  | { kind: "none" }
  | { kind: "active"; until: string | null }
  | { kind: "scheduled"; from: string }
  | { kind: "ended"; on: string }
  | { kind: "badgeOnly" };

// Stan do pokazania człowiekowi. Kolejność sprawdzeń jest istotna: cena
// obowiązująca teraz bije plan, plan bije zakończenie, a sam napis to ostatnia
// możliwość. Bez tej linijki w panelu system wygląda na zepsuty, bo sale_price
// nie jest już edytowalne ręcznie.
export function saleStatus(row: SaleScheduleRow, today: string): SaleStatus {
  if (isOnSale(row.price, row.sale_price)) {
    return { kind: "active", until: row.sale_to };
  }
  if (row.sale_price_planned !== null && isOnSale(row.price, row.sale_price_planned)) {
    if (row.sale_from !== null && today < row.sale_from) {
      return { kind: "scheduled", from: row.sale_from };
    }
    if (row.sale_to !== null && today > row.sale_to) {
      return { kind: "ended", on: row.sale_to };
    }
  }
  if (row.promo_badge) return { kind: "badgeOnly" };
  return { kind: "none" };
}

// Chip w liście produktów. „Wstążka" jest tu po to, żeby wyłapać wyciek:
// promocja z datami gaśnie sama, ale ręczny promo_badge nie ma terminu i wisi,
// dopóki ktoś go nie usunie.
export function promoChipLabel(
  row: SaleScheduleRow,
  today: string
): "Promocja" | "Zaplanowana" | "Wstążka" | null {
  const s = saleStatus(row, today);
  if (s.kind === "active") return "Promocja";
  if (s.kind === "scheduled") return "Zaplanowana";
  if (row.promo_badge) return "Wstążka";
  return null;
}

// Dzień w strefie sklepu. `sv-SE` daje YYYY-MM-DD, czyli format kolumny `date`.
// Zegar wstrzykiwany parametrem — testy muszą być deterministyczne.
export function warsawToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(now);
}
