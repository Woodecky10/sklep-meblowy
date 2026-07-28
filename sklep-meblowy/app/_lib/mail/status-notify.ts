import type { OrderStatus } from "../types";

// Które przejścia statusu wysyłają mail do klienta. Reguła wyciągnięta
// osobno, żeby dała się przetestować bez bazy i bez Resenda.
//
// Świadomie POZA listą:
// - `processing` — ten status admin ustawia, żeby zabrać zamówienie do
//   realizacji, czyli tym samym klikiem gasi licznik nowych zamówień
//   (PR #100). Mail tutaj strzelałby do klienta przy każdym odhaczeniu.
//   Dodatkowo createOrder nadaje `processing` zamówieniom COD od razu.
// - `paid` — webhook ustawia go sekundy po zakupie; potwierdzenie zakupu
//   JEST powiadomieniem o tym statusie.
// - `delivered` — przy meblach klient kwituje odbiór u kierowcy.
const NOTIFY_STATUSES: OrderStatus[] = ["shipped", "cancelled"];

export function shouldNotifyCustomer(status: OrderStatus): boolean {
  return NOTIFY_STATUSES.includes(status);
}
