// ⚠️ ŚWIADOME odstępstwo od reguły "mailujemy tylko przy shipped/cancelled"
// (NOTIFY_STATUSES w status-notify.ts). Tamta reguła dotyczy zamówień MEBLI
// i ich maszyny stanów. Próbki mają własną: darmowe zamówienie nie ma nawet
// potwierdzenia płatności, które mogłoby zastąpić potwierdzenie przyjęcia.
// To nie jest regres czystki mailowej.
//
// Trzy maile próbek i moment, w którym każdy wychodzi:
//   1. AdminNewSampleOrder      → właścicielka, gdy jest co pakować,
//   2. SampleOrderConfirmation  → klient, gdy zamówienie DOSZŁO DO SKUTKU
//      (darmowe: zaraz po złożeniu; płatne: dopiero po rozliczeniu notyfikacji
//      P24 — porzuconej bramki nie potwierdzamy),
//   3. SampleOrderSent          → klient, gdy koperta poszła pocztą.
//
// ⚠️ KONTRAKT CAŁEGO MODUŁU: ŻADNA z tych funkcji nie rzuca. Wołają je
// notyfikacja P24 (wyjątek = 500 = P24 ponawia = mail poszedłby wielokrotnie),
// akcja składająca zamówienie (wyjątek = klient widzi błąd zamiast paczki)
// i akcja panelu (wyjątek = właścicielka widzi „nie udało się", choć wysyłka
// jest już zapisana). Padnięty Resend nie może zabrać klientowi próbek.
// Gwarancja to NAJWYŻEJ-RAZ, nie dokładnie-raz — jak w notify-order.ts:
// przejściowa awaria w środku (odczyt bazy, render, Resend) gubi maila bez
// ponowienia. Idempotencji te funkcje NIE pilnują; wołaj je tylko z miejsc
// chronionych (zwycięzca CAS-a w markSampleOrderPaid, jednorazowe utworzenie
// zamówienia darmowego, udany zapis statusu „sent").
import "server-only";

import { render } from "@react-email/components";
import { getSampleOrderById, type SampleOrderWithItems } from "../samples";
import { getMailBranding } from "./branding-server";
import { sendMail } from "./send";
import { AdminNewSampleOrder } from "./templates/AdminNewSampleOrder";
import { SampleOrderConfirmation } from "./templates/SampleOrderConfirmation";
import { SampleOrderSent } from "./templates/SampleOrderSent";

// Ten sam fallback co w notify-order.ts — maile mają mieć jeden adres bazowy.
function baseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
}

// Wspólny odczyt snapshotu zamówienia. Każda z trzech funkcji robi go OSOBNO
// i to jest wybór, nie przeoczenie: dzięki temu każda jest samodzielna
// (nieudany mail do właścicielki nie zabiera klientowi potwierdzenia)
// i miejsce wpięcia woła jedną linijkę zamiast pobierać dane samo — a pliki
// wpięcia (akcje, trasa P24) są zamknięte na cokolwiek poza wywołaniem
// powiadomienia. Koszt to jeden `select` po kluczu głównym, po odpowiedzi.
async function loadOrder(orderId: string): Promise<SampleOrderWithItems | null> {
  const order = await getSampleOrderById(orderId);
  if (!order) {
    // getSampleOrderById połyka też błąd odczytu — dla maila obie sytuacje
    // znaczą to samo: nie ma z czego złożyć wiadomości.
    console.error(`[probki/mail] nie udało się odczytać zamówienia ${orderId} — pomijam maila`);
    return null;
  }
  return order;
}

// Powiadomienie właścicielki o zamówieniu, które jest do zrobienia.
export async function notifyAdminNewSampleOrder(orderId: string): Promise<void> {
  try {
    const adminTo = process.env.MAIL_ADMIN_TO;
    // Bez adresu właścicielki nie ma do kogo pisać — i nie ma po co czytać bazy.
    if (!adminTo) return;

    const order = await loadOrder(orderId);
    if (!order) return;

    const branding = await getMailBranding();
    const html = await render(
      AdminNewSampleOrder({
        order,
        items: order.items ?? [],
        branding,
        // Próbki nie mają strony pojedynczego zamówienia w panelu — cała obsługa
        // dzieje się na liście z grupami pracy (Task 6).
        adminUrl: `${baseUrl()}/admin/probki`,
      })
    );
    await sendMail({
      to: adminTo,
      subject: `Nowe zamówienie próbek — ${order.customer_name || order.customer_email}`,
      html,
    });
  } catch (err) {
    console.error("[probki/mail] notifyAdminNewSampleOrder nieudane:", err);
  }
}

// Potwierdzenie dla klienta. ⚠️ Dla zamówienia PŁATNEGO wolno je wysłać dopiero
// po rozliczeniu płatności — decyduje o tym miejsce wywołania
// (app/api/p24/probki-status/route.ts), nie ta funkcja.
export async function notifyCustomerSampleOrder(orderId: string): Promise<void> {
  try {
    const order = await loadOrder(orderId);
    if (!order) return;

    // ⚠️ Adres ze SNAPSHOTU zamówienia (`customer_email`), nigdy z sesji:
    // maila składa notyfikacja P24, w której żadnej sesji nie ma.
    const to = (order.customer_email ?? "").trim();
    if (!to) {
      console.error(`[probki/mail] zamówienie ${orderId} bez adresu e-mail — pomijam`);
      return;
    }

    const branding = await getMailBranding();
    const html = await render(
      SampleOrderConfirmation({
        order,
        items: order.items ?? [],
        branding,
        // Jedyna strona, na której klient zobaczy to zamówienie; sama sprawdza
        // właściciela (patrz app/probki/sukces/page.tsx).
        orderUrl: `${baseUrl()}/probki/sukces?zamowienie=${order.id}`,
      })
    );
    await sendMail({ to, subject: "Zamówienie próbek przyjęte", html });
  } catch (err) {
    console.error("[probki/mail] notifyCustomerSampleOrder nieudane:", err);
  }
}

// „Próbki wysłane" — po udanym zapisie statusu w panelu.
export async function notifyCustomerSampleSent(orderId: string): Promise<void> {
  try {
    const order = await loadOrder(orderId);
    if (!order) return;

    // Znowu snapshot, nie sesja: ten mail wychodzi dni po złożeniu zamówienia,
    // z akcji admina — sesja klienta dawno wygasła i nigdy jej tu nie było.
    const to = (order.customer_email ?? "").trim();
    if (!to) {
      console.error(`[probki/mail] zamówienie ${orderId} bez adresu e-mail — pomijam`);
      return;
    }

    const branding = await getMailBranding();
    const html = await render(
      SampleOrderSent({
        order,
        items: order.items ?? [],
        branding,
        shopUrl: `${baseUrl()}/sklep`,
      })
    );
    await sendMail({ to, subject: "Twoje próbki są w drodze", html });
  } catch (err) {
    console.error("[probki/mail] notifyCustomerSampleSent nieudane:", err);
  }
}
