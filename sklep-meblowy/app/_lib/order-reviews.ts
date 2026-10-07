// Które produkty z zamówienia klient może ocenić z panelu konta
// (/konto/zamowienia/[id], blok „Oceń zakupione produkty"). Moduł CZYSTY —
// bez bazy, żeby regułę dało się przetestować.
//
// Przycisk prowadzi na formularz opinii na karcie produktu (#opinie), więc
// lista obejmuje tylko pozycje, dla których ta karta istnieje.

import type { OrderStatus } from "@/app/_lib/types";

type ItemForReview = {
  // null = pozycja spoza katalogu (migracja 82): wniesienie mebli albo mebel
  // dogadany przy zamówieniu z Allegro/OLX — nie ma karty, nie ma czego oceniać.
  product_id: string | null;
  product?: { is_active: boolean } | null;
};

// Typ wyniku obiecuje to, co funkcja sprawdziła: jest product_id i jest produkt.
type Reviewable<T extends ItemForReview> = T & {
  product_id: string;
  product: NonNullable<T["product"]>;
};

export function productsToReview<T extends ItemForReview>(
  status: OrderStatus,
  items: T[]
): Reviewable<T>[] {
  // Dopiero po dostarczeniu — tak samo jak mail z prośbą o opinię
  // (requestReviews odpala się na przejściu na „delivered"). Baza pozwala
  // wcześniej (polityka z migracji 46), ale klient ocenia mebel, który już ma.
  if (status !== "delivered") return [];

  const seen = new Set<string>();
  const result: Reviewable<T>[] = [];
  for (const item of items) {
    // Ukryty produkt: karta odpowiada 404, przycisk prowadziłby donikąd.
    if (!item.product_id || !item.product?.is_active) continue;
    // Opinia dotyczy produktu, nie wariantu — dwa kolory tej samej sofy to
    // jeden przycisk.
    if (seen.has(item.product_id)) continue;
    seen.add(item.product_id);
    result.push(item as Reviewable<T>);
  }
  return result;
}
