import type { OrderStatus, PaymentMethod } from "../types";

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

// Czy zamowienie bylo REALNIE oplacone przed anulowaniem — decyduje o tym, czy
// mail o anulowaniu wspomina zwrot srodkow. Po CAS-ie status to juz "cancelled",
// wiec plactnosc trzeba wywnioskowac z metody i POPRZEDNIEGO statusu.
//
// Pobranie NIGDY nie jest tu "oplacone": createOrder nadaje COD status
// "processing" od razu, a "paid" pisze wylacznie markOrderPaid, ktorego COD nie
// dotyka — wiec sam warunek `previousStatus !== "pending"` bylby dla kazdego
// COD prawdziwy i mail obiecywalby zwrot gotowki, ktorej sklep nie wzial.
//
// Znane, swiadomie zaakceptowane ograniczenie: admin moze przestawic
// NIEOPLACONE zamowienie online z "pending" na "processing" (canTransition to
// dopuszcza) i anulowac je dopiero potem — wtedy wyjdzie wasPaid=true. Dokladne
// rozstrzygniecie wymagaloby oparcia sie o kolumne platnosci, ktora otwarty
// PR #48 (migracja na Przelewy24) usuwa — nie wiazemy sie z nia teraz.
export function wasOrderPaid(
  paymentMethod: PaymentMethod,
  previousStatus: OrderStatus
): boolean {
  if (paymentMethod === "cod") return false;
  return previousStatus !== "pending";
}
