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
