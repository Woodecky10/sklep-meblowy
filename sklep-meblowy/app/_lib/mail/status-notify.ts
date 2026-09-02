import type { OrderStatus, PaymentMethod } from "../types";

// Które przejścia statusu wysyłają mail do klienta. Reguła wyciągnięta
// osobno, żeby dała się przetestować bez bazy i bez Resenda.
//
// Zamówienia ZE SKLEPU (source = null). Świadomie POZA listą:
// - `processing` — ten status admin ustawia, żeby zabrać zamówienie do
//   realizacji, czyli tym samym klikiem gasi licznik nowych zamówień
//   (PR #100). Mail tutaj strzelałby do klienta przy każdym odhaczeniu.
//   Dodatkowo createOrder nadaje `processing` zamówieniom COD od razu.
// - `paid` — webhook ustawia go sekundy po zakupie; potwierdzenie zakupu
//   JEST powiadomieniem o tym statusie.
// - `delivered` — przy meblach klient kwituje odbiór u kierowcy.
const SHOP_NOTIFY_STATUSES: OrderStatus[] = ["shipped", "cancelled"];

// Zamówienia ZEWNĘTRZNE (source = „Allegro" itp., spec 2026-09-02). Tu
// `processing` MAILUJE: takie zamówienie admin wpisuje ręcznie ze statusem
// `paid` (zapłacone na marketplace) i nie przechodzi przez checkout, więc
// klient nie dostał od nas żadnego potwierdzenia. Ręczne „W realizacji" jest
// jedynym momentem, w którym dowiaduje się, że przyjęliśmy zamówienie —
// stąd mail „Dziękujemy za zamówienie" właśnie tutaj.
const EXTERNAL_NOTIFY_STATUSES: OrderStatus[] = ["processing", "shipped", "cancelled"];

export function shouldNotifyCustomer(status: OrderStatus, source: string | null): boolean {
  const list = source === null ? SHOP_NOTIFY_STATUSES : EXTERNAL_NOTIFY_STATUSES;
  return list.includes(status);
}

// Tani filtr PRZED odczytem zamówienia z bazy: `source` znamy dopiero po
// getOrderById, a nie chcemy odpytywać bazy przy każdym `delivered`. Musi być
// nadzbiorem shouldNotifyCustomer dla obu rodzajów zamówień (test pilnuje).
export function mayNotifyCustomer(status: OrderStatus): boolean {
  return EXTERNAL_NOTIFY_STATUSES.includes(status);
}

// Czy zamowienie bylo REALNIE oplacone przed anulowaniem — decyduje o tym, czy
// mail o anulowaniu wspomina zwrot srodkow. Po CAS-ie status to juz "cancelled",
// wiec plactnosc trzeba wywnioskowac z metody i POPRZEDNIEGO statusu.
//
// Zamówienie ZEWNĘTRZNE nigdy nie jest tu „opłacone": pieniądze wziął
// marketplace i on robi zwrot — mail od sklepu nie ma prawa obiecywać
// „skontaktujemy się w sprawie zwrotu środków".
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
  previousStatus: OrderStatus,
  source: string | null
): boolean {
  if (source !== null) return false;
  if (paymentMethod === "cod") return false;
  return previousStatus !== "pending";
}
