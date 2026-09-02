import { render } from "@react-email/components";
import { getOrderById, getProfilesByIds } from "../orders";
import type { OrderStatus } from "../types";
import { getMailBranding } from "./branding-server";
import { mailLocale } from "./locale";
import { sendMail } from "./send";
import { mayNotifyCustomer, shouldNotifyCustomer, wasOrderPaid } from "./status-notify";
import { OrderConfirmation } from "./templates/OrderConfirmation";
import { AdminNewOrder } from "./templates/AdminNewOrder";
import { OrderShipped } from "./templates/OrderShipped";
import { OrderCancelled } from "./templates/OrderCancelled";
import {
  ExternalOrderAccepted,
  EXTERNAL_ORDER_ACCEPTED_SUBJECT,
} from "./templates/ExternalOrderAccepted";

// Adres klienta: gość ma guest_email, zalogowany — email z profiles.
async function customerEmailOf(order: {
  guest_email: string | null;
  user_id: string | null;
}): Promise<string | null> {
  if (order.guest_email) return order.guest_email;
  if (!order.user_id) return null;
  const profiles = await getProfilesByIds([order.user_id]);
  return profiles[order.user_id]?.email ?? null;
}

// Maile po złożeniu zamówienia: potwierdzenie do klienta + powiadomienie do
// właścicielki. NIGDY nie rzuca — wołane z notyfikacji P24 /api/p24/status
// (500 = ponowienie notyfikacji) i z /api/checkout (wyjątek = zepsuty zakup).
// Gwarancja to NAJWYŻEJ-RAZ, nie dokładnie-raz: skoro funkcja połyka każdy
// błąd, a endpoint mimo to zwraca 200 (CAS już "spalony" przez markOrderPaid),
// przejściowa awaria w środku (odczyt DB, render, Resend) po prostu gubi
// mail — bez retry. Świadomy kompromis: „nie zepsuj zakupu" jest ważniejsze
// niż dostarczenie powiadomienia.
// Idempotencja NIE jest tu pilnowana: wołaj tylko z miejsc chronionych CAS-em
// (markOrderPaid dla online, jednorazowe utworzenie zamówienia dla COD).
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const items = order.items ?? [];
    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const prefix = locale === "de" ? "/de" : "";

    const to = await customerEmailOf(order);
    if (to) {
      const html = await render(
        OrderConfirmation({
          order,
          items,
          branding,
          locale,
          orderUrl: `${base}${prefix}/konto/zamowienia/${order.id}`,
          hasAccount: order.user_id !== null,
        })
      );
      await sendMail({
        to,
        subject:
          locale === "de"
            ? `Bestellung #${order.order_number} angenommen`
            : `Zamówienie #${order.order_number} przyjęte`,
        html,
      });
    } else {
      console.error(`[mail] zamówienie ${orderId} bez adresu e-mail — pomijam`);
    }

    const adminTo = process.env.MAIL_ADMIN_TO;
    if (adminTo) {
      const html = await render(
        AdminNewOrder({
          order,
          items,
          branding,
          customerEmail: to ?? "brak",
          adminUrl: `${base}/admin/zamowienia/${order.id}`,
        })
      );
      await sendMail({
        to: adminTo,
        subject: `Nowe zamówienie #${order.order_number}`,
        html,
      });
    }
  } catch (err) {
    console.error("[mail] notifyOrderPlaced nieudane:", err);
  }
}

// Mail po zmianie statusu. `previousStatus` służy tylko do rozpoznania, czy
// anulowane zamówienie było wcześniej opłacone — po CAS-ie status w bazie to
// już "cancelled". Nigdy nie rzuca.
export async function notifyStatusChange(
  orderId: string,
  status: OrderStatus,
  previousStatus: OrderStatus
): Promise<void> {
  // Tani filtr bez bazy; właściwa decyzja wymaga `order.source`, więc zapada
  // dopiero po odczycie zamówienia.
  if (!mayNotifyCustomer(status)) return;
  try {
    const order = await getOrderById(orderId);
    if (!shouldNotifyCustomer(status, order.source)) return;
    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const prefix = locale === "de" ? "/de" : "";
    const to = order.guest_email ?? (await customerEmailOf(order));
    if (!to) {
      console.error(`[mail] zamówienie ${orderId} bez adresu e-mail — pomijam`);
      return;
    }
    const orderUrl = `${base}${prefix}/konto/zamowienia/${order.id}`;

    if (status === "shipped") {
      const html = await render(
        OrderShipped({ order, branding, locale, orderUrl, hasAccount: order.user_id !== null })
      );
      await sendMail({
        to,
        subject:
          locale === "de"
            ? `Bestellung #${order.order_number} ist unterwegs`
            : `Zamówienie #${order.order_number} jest w drodze`,
        html,
      });
      return;
    }

    // processing przechodzi przez shouldNotifyCustomer TYLKO dla zamówień
    // zewnętrznych — klient z marketplace dostaje tu jedyne od nas
    // potwierdzenie przyjęcia (spec 2026-09-02).
    if (status === "processing") {
      const html = await render(
        ExternalOrderAccepted({ order, branding, shopUrl: base })
      );
      await sendMail({ to, subject: EXTERNAL_ORDER_ACCEPTED_SUBJECT, html });
      return;
    }

    // cancelled — jedyny pozostały status z shouldNotifyCustomer
    const wasPaid = wasOrderPaid(order.payment_method, previousStatus, order.source);
    const html = await render(
      OrderCancelled({ order, branding, locale, wasPaid })
    );
    await sendMail({
      to,
      subject:
        locale === "de"
          ? `Bestellung #${order.order_number} wurde storniert`
          : `Zamówienie #${order.order_number} zostało anulowane`,
      html,
    });
  } catch (err) {
    console.error("[mail] notifyStatusChange nieudane:", err);
  }
}
