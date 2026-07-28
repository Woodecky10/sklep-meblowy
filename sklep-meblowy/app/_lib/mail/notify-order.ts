import { render } from "@react-email/components";
import { getOrderById, getProfilesByIds } from "../orders";
import { getMailBranding } from "./branding-server";
import { mailLocale } from "./locale";
import { sendMail } from "./send";
import { OrderConfirmation } from "./templates/OrderConfirmation";
import { AdminNewOrder } from "./templates/AdminNewOrder";

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
// właścicielki. NIGDY nie rzuca — wołane z webhooka Stripe (500 = ponowienie
// eventu) i z /api/checkout (wyjątek = zepsuty zakup).
// Idempotencja NIE jest tu pilnowana: wołaj tylko z miejsc chronionych CAS-em
// (markOrderPaid dla online, jednorazowe utworzenie zamówienia dla COD).
export async function notifyOrderPlaced(orderId: string): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const items = order.items ?? [];
    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? `https://www.mollien.pl`;
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
