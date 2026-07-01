import type { Order, Profile } from "./types";

export type OrderCustomer = {
  name: string | null;
  email: string | null;
  isGuest: boolean;
};

// Wyprowadzenie danych klienta do wyświetlenia w panelu.
// Zarejestrowany (user_id) → profil (email + full_name), z fallbackiem
// nazwiska do adresu dostawy. Gość → guest_email + nazwisko z adresu.
export function orderCustomerDisplay(
  order: Pick<Order, "user_id" | "guest_email" | "shipping_address">,
  profile: Pick<Profile, "email" | "full_name"> | null
): OrderCustomer {
  const addrName = order.shipping_address?.fullname ?? null;
  if (order.user_id) {
    return {
      name: profile?.full_name ?? addrName,
      email: profile?.email ?? null,
      isGuest: false,
    };
  }
  return {
    name: addrName,
    email: order.guest_email ?? null,
    isGuest: true,
  };
}

// Podsumowanie zamówionych produktów do listy zamówień. `label` to skrót
// (pierwsza nazwa + „+N”), `full` to pełna lista (do tooltipa). Produkt bez
// nazwy (teoretycznie usunięty) → fallback.
export function orderItemsSummary(
  items: { product?: { name: string } | null }[]
): { label: string; full: string } {
  const names = items.map((i) => i.product?.name?.trim() || "produkt usunięty");
  if (names.length === 0) return { label: "—", full: "—" };
  const full = names.join(", ");
  const label = names.length === 1 ? names[0] : `${names[0]} +${names.length - 1}`;
  return { label, full };
}
