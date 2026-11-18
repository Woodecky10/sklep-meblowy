// Reguły raportowania zdarzeń, które należą do SKLEPU, a nie do konkretnego
// dostawcy analityki. Moduł CZYSTY (bez server-only).
//
// Powód istnienia: pixel Meta (app/_lib/meta-pixel.ts) i GA4
// (app/_lib/ga-ecommerce.ts) opisują ten sam lejek w dwóch formatach, ale
// odpowiedź na pytania „czy to już sprzedaż?", „w jakiej walucie?" i „ile
// miejsc po przecinku?" musi być JEDNA. Druga kopia shouldTrackPurchase
// rozjechałaby się przy pierwszej zmianie i dwa raporty pokazałyby dwie różne
// liczby sprzedaży — bez żadnego błędu w logach.

// Kwoty w groszach po stronie Meta i Google nie istnieją — wszystko idzie
// w jednostkach głównych waluty. Zaokrąglenie broni przed
// 33.329999999999995 w JSON-ie.
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// W bazie waluta leży małymi literami ("pln"), oba systemy oczekują
// ISO-4217 ("PLN").
export function toIsoCurrency(currency: string): string {
  return currency.toUpperCase();
}

// Waluta zdarzeń przedzakupowych (obejrzenie, koszyk, wejście w checkout).
//
// Ceny w bazie i w koszyku są ZAWSZE w PLN — EUR powstaje dopiero przy
// wyświetlaniu i przy rejestracji płatności (app/_lib/money.ts). Zakup jest
// inny: tam bierzemy walutę zapisaną w zamówieniu, bo ta jest już przeliczona.
export const CATALOG_CURRENCY = "PLN";

/**
 * Czy zamówienie w tym stanie ma się policzyć jako sprzedaż.
 *
 * ⚠️ NIE używać tu `status !== "pending"` (tak wygląda warunek nagłówka na
 * stronie podziękowania) — ten warunek przepuszcza „cancelled", więc anulowane
 * zamówienie liczyłoby się jako sprzedaż w Menedżerze reklam i w GA4.
 *
 * Online: dopiero potwierdzona notyfikacja z P24 przestawia status z „pending",
 * więc czekamy — inaczej każda porzucona i nieudana płatność zawyżałaby wynik
 * kampanii. Pobranie: zamówienie jest przyjęte do realizacji z chwilą złożenia,
 * pieniądze przyjdą od kuriera, więc liczy się od razu mimo statusu „pending".
 */
export function shouldTrackPurchase(
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled",
  paymentMethod: "online" | "cod"
): boolean {
  if (status === "cancelled") return false;
  if (paymentMethod === "cod") return true;
  return status !== "pending";
}

/**
 * Czy strona podziękowania ma jeszcze czekać na rozstrzygnięcie płatności.
 *
 * Klient wraca z P24 (urlReturn) często ZANIM dojdzie notyfikacja, która
 * przestawia status z „pending". Bez ponownego sprawdzenia strona nie wysłałaby
 * zakupu do GA4 ani Meta nigdy — zamówienie opłacone, a w raportach go nie ma.
 * Pobranie nie czeka na nic: liczy się od razu (patrz shouldTrackPurchase).
 */
export function shouldAwaitPayment(
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled",
  paymentMethod: "online" | "cod"
): boolean {
  return paymentMethod === "online" && status === "pending";
}

// Odstępy kolejnych sprawdzeń statusu na stronie podziękowania. Gęsto na
// początku (notyfikacja P24 zwykle przychodzi w kilka sekund), potem rzadziej;
// razem 2 minuty i koniec — porzucona płatność nie może odpytywać bez końca.
export const PAYMENT_RECHECK_DELAYS_MS = [
  2000, 3000, 5000, 5000, 10000, 15000, 20000, 30000, 30000,
] as const;
