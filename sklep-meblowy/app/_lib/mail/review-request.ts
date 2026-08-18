import { render } from "@react-email/components";
import { getOrderById, getProfilesByIds } from "../orders";
import { createInvite } from "../review-invites-server";
import { reviewUrlFor } from "../review-tokens";
import { createAdminClient } from "../supabase/server";
import { getMailBranding } from "./branding-server";
import { mailLocale } from "./locale";
import { sendMail } from "./send";
import { ReviewRequest } from "./templates/ReviewRequest";

// Adres klienta — ta sama zasada, co w notify-order.ts.
async function customerEmailOf(order: {
  guest_email: string | null;
  user_id: string | null;
}): Promise<string | null> {
  if (order.guest_email) return order.guest_email;
  if (!order.user_id) return null;
  const profiles = await getProfilesByIds([order.user_id]);
  return profiles[order.user_id]?.email ?? null;
}

// Prośba o opinię po oznaczeniu zamówienia jako dostarczone.
//
// ⚠️ ŚWIADOMIE NIE dopisujemy `delivered` do NOTIFY_STATUSES w status-notify.ts.
// Tamten komentarz tłumaczy, czemu `delivered` nie wysyła powiadomienia
// o statusie („przy meblach klient kwituje odbiór u kierowcy") i ta decyzja
// zostaje w mocy — to jest osobna wiadomość o innym celu. Zmieszanie ich
// zepsułoby testy semantyki statusów i zatarło przemyślaną regułę.
//
// NIGDY nie rzuca: wołane z akcji admina przez after(), więc wyjątek zamieniłby
// udaną zmianę statusu w błąd w panelu.
export async function requestReviews(orderId: string): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const to = await customerEmailOf(order);
    if (!to) {
      console.error(`[mail] zamówienie ${orderId} bez adresu — pomijam prośbę o opinię`);
      return;
    }

    const branding = await getMailBranding();
    const locale = mailLocale(order.currency);
    const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
    const maKonto = order.user_id !== null;

    // Bez duplikatów: zamówienie może mieć dwa wiersze tego samego produktu.
    const productIds = Array.from(
      new Set((order.items ?? []).map((i) => i.product_id).filter(Boolean))
    );

    const admin = await createAdminClient();

    for (const productId of productIds) {
      // Zaproszenie zakładamy ZAWSZE — także dla kont, mimo że wtedy token
      // nie trafia do maila (wariant B). Tabela pełni wtedy rolę rejestru
      // „komu i kiedy wysłano prośbę", bez którego przypomnienie po 7 dniach
      // nie miałoby skąd wziąć terminu. Liczenie go z orders.status_updated_at
      // rozjeżdża się przy każdej kolejnej zmianie statusu.
      const utworzone = await createInvite(orderId, productId, to);
      // null = zaproszenie już istniało (unique order_id+product_id).
      // Ponowne przestawienie statusu nie wysyła drugiego maila.
      if (!utworzone) continue;

      const { data: produkt } = await admin
        .from("products")
        .select("name")
        .eq("id", productId)
        .maybeSingle();
      const productName = (produkt as { name: string } | null)?.name ?? "Twój zakup";

      const reviewUrl = reviewUrlFor({
        base,
        locale,
        maKonto,
        productId,
        token: utworzone.token,
      });

      const html = await render(
        ReviewRequest({
          branding,
          locale,
          productName,
          reviewUrl,
          orderNumber: order.order_number,
          przypomnienie: false,
        })
      );
      await sendMail({
        to,
        subject:
          locale === "de"
            ? `Wie gefällt Ihnen ${productName}?`
            : `Jak sprawdza się ${productName}?`,
        html,
      });
    }
  } catch (err) {
    console.error("[mail] requestReviews nieudane:", err);
  }
}
