import type { OrderStatus, PaymentMethod } from "../types";

// Które przejścia statusu wysyłają AUTOMATYCZNY mail do klienta. Reguła
// wyciągnięta osobno, żeby dała się przetestować bez bazy i bez Resenda.
//
// Świadomie POZA listą:
// - `processing` — ten status admin ustawia, żeby zabrać zamówienie do
//   realizacji, czyli tym samym klikiem gasi licznik nowych zamówień
//   (PR #100). Mail tutaj strzelałby do klienta przy każdym odhaczeniu.
//   Dodatkowo createOrder nadaje `processing` zamówieniom COD od razu.
// - `paid` — webhook ustawia go sekundy po zakupie; potwierdzenie zakupu
//   JEST powiadomieniem o tym statusie.
// - `delivered` — przy meblach klient kwituje odbiór u kierowcy.
//
// Ta sama lista dla zamówień ZE SKLEPU i ZEWNĘTRZNYCH. Do 2026-09-09 zamówienia
// zewnętrzne miały tu dodatkowo `processing`: przejście na „W realizacji"
// wysyłało klientowi z marketplace maila „Dziękujemy za zamówienie" (spec
// 2026-09-02). Zgłoszenie pracownicy obsługującej panel: tego maila nie
// widziała, nie mogła zmienić jego treści i nie wiedziała, czy w ogóle poszedł.
// Decyzja właściciela: automat ZNIKA — ten mail wysyła teraz świadomym klikiem
// z karty zamówienia (akcja sendExternalOrderMail), więc żaden status nie
// wysyła go już sam. Maile „Wysłane" i „Anulowane" bez zmian, dla obu rodzajów
// zamówień.
const NOTIFY_STATUSES: OrderStatus[] = ["shipped", "cancelled"];

// Decyzja nie potrzebuje już ani bazy, ani `source` — dlatego notifyStatusChange
// pyta RAZ, jeszcze przed odczytem zamówienia (dawniej: tani filtr
// `mayNotifyCustomer` przed odczytem + `shouldNotifyCustomer(status, source)`
// po nim; obie funkcje dawały ten sam wynik od chwili, gdy `processing`
// przestało mailować).
export function shouldNotifyCustomer(status: OrderStatus): boolean {
  return NOTIFY_STATUSES.includes(status);
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
// Prawdziwościowość (`if (source)`), NIE `source !== null`: `select("*")` na
// `orders` bez kolumny `source` (okno między wdrożeniem kodu a ręczną aplikacją
// migracji 81) zwraca `undefined`, nie `null` — a `undefined !== null` jest
// prawdziwe, więc porównanie z `null` kazałoby traktować zwykłe zamówienie ze
// sklepu jak zewnętrzne (mail o anulowaniu przestałby wspominać zwrot).
export function wasOrderPaid(
  paymentMethod: PaymentMethod,
  previousStatus: OrderStatus,
  source: string | null | undefined
): boolean {
  if (source) return false;
  if (paymentMethod === "cod") return false;
  return previousStatus !== "pending";
}
