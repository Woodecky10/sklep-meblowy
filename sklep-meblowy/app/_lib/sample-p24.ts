// Parametry rejestracji transakcji P24 dla zamówienia próbek. CZYSTA funkcja,
// bez I/O i bez sesji — dokładnie ten sam zabieg co `buildP24RegisterParams`
// w app/api/checkout/route.ts: rzeczy, które kosztują pieniądze (przeliczenie
// na grosze) i tożsamość (e-mail), muszą dać się objąć testem, a akcji
// serwerowej przetestować się nie da.
//
// ⚠️ NIE eksportować tego z pliku "use server" — tam wolno wyłącznie async akcje.
import type { P24RegisterParams } from "./p24";

export function buildSampleP24Params(args: {
  orderId: string;
  // ⚠️ W ZŁOTYCH — tyle zwraca sampleOrderTotal. Przeliczenie na grosze jest
  // niżej i jest jedynym miejscem, w którym wolno je zrobić: bez niego klient
  // płaci 15 groszy zamiast 15 złotych i nikt tego nie zauważy do rozliczenia.
  amountTotal: number;
  paidCount: number;
  // ⚠️ E-MAIL Z SESJI. Nazwa parametru jest celowo jednoznaczna: do P24 (i do
  // klucza darmowej puli) nie ma prawa trafić wartość z formularza.
  sessionEmail: string;
  origin: string;
}): P24RegisterParams {
  return {
    sessionId: args.orderId,
    amount: Math.round(args.amountTotal * 100),
    // Próbki są PLN-only (/de zamrożone flagą DE_ENABLED) — brak gałęzi EUR.
    currency: "PLN",
    description: `Próbki tkanin (${args.paidCount} szt.)`,
    email: args.sessionEmail,
    country: "PL",
    language: "pl",
    urlReturn: `${args.origin}/probki/sukces?zamowienie=${args.orderId}`,
    // ⚠️ OSOBNY endpoint (Task 5). /api/p24/status zakłada sessionId == orders.id
    // i zgubiłby tę płatność, logując „zamówienie nie istnieje". Literówka tutaj
    // daje CICHĄ awarię: POST na nieistniejącą ścieżkę pod /api/ zwraca w tym
    // frameworku 200 z HTML-em, więc P24 uzna notyfikację za dostarczoną i nie ponowi.
    urlStatus: `${args.origin}/api/p24/probki-status`,
  };
}
