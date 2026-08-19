import "server-only";

import { render } from "@react-email/components";
import { getReviewForMail } from "../reviews-admin";
import { getMailBranding } from "./branding-server";
import { sendMail } from "./send";
import { AdminNewReview } from "./templates/AdminNewReview";

// ⚠️ KONTRAKT: ta funkcja NIE rzuca. Wołają ją obie ścieżki zapisu opinii przez
// after() — wyjątek oznaczałby, że klient widzi błąd przy opinii, która została
// zapisana i JEST już na stronie. Gwarancja to najwyżej-raz, jak w notify-order.
export async function notifyAdminNewReview(reviewId: string): Promise<void> {
  try {
    const adminTo = process.env.MAIL_ADMIN_TO;
    // Bez adresu właścicielki nie ma do kogo pisać — i nie ma po co czytać bazy.
    if (!adminTo) {
      console.info("[mail] brak MAIL_ADMIN_TO — pomijam powiadomienie o opinii");
      return;
    }
    const opinia = await getReviewForMail(reviewId);
    if (!opinia) return;
    const branding = await getMailBranding();
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const html = await render(
      AdminNewReview({ opinia, branding, panelUrl: `${base}/admin/opinie` })
    );
    await sendMail({
      to: adminTo,
      subject: `Nowa opinia: ${opinia.rating}/5 — ${opinia.product_name ?? "produkt"}`,
      html,
    });
  } catch (err) {
    console.error("[mail] powiadomienie o nowej opinii nieudane:", err);
  }
}
