import { render } from "@react-email/components";
import { getOrderById, getProfilesByIds } from "../orders";
import { createInvite } from "../review-invites-server";
import { shouldRemind } from "../review-reminders";
import { generateInviteToken, hashInviteToken, reviewUrlFor } from "../review-tokens";
import { escapeIlike } from "../search-filter";
import { createAdminClient } from "../supabase/server";
import type { ReviewInvite } from "../types";
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

// Przemiatanie przypomnień — wołane z crona. Idempotentne: `reminded_at`
// ustawiane po wysłaniu sprawia, że powtórne odpalenie nic nie wysyła.
export async function sendReviewReminders(): Promise<{ wyslane: number }> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("review_invites")
    .select("*")
    .is("reminded_at", null)
    .is("used_at", null);

  const zaproszenia = (data ?? []) as ReviewInvite[];
  const teraz = new Date();
  let wyslane = 0;

  for (const invite of zaproszenia) {
    // Ciało pętli w try/catch: błąd sieci/klienta przy JEDNYM zaproszeniu
    // (rzadkie, ale realne w środowisku bezserwerowym) nie może przerwać
    // przetwarzania reszty partii. Idempotencja (`reminded_at`) chroni przed
    // duplikatami, więc pominięty dziś wiersz spróbuje ponownie jutro.
    try {
      // Czy dla tej pary istnieje JAKAKOLWIEK opinia — po koncie właściciela
      // zamówienia albo po adresie gościa.
      const { data: zamowienie } = await admin
        .from("orders")
        .select("user_id, currency, order_number")
        .eq("id", invite.order_id)
        .maybeSingle();
      const o = zamowienie as
        | { user_id: string | null; currency: string; order_number: number }
        | null;
      if (!o) continue;

      let zapytanie = admin
        .from("product_reviews")
        .select("id", { count: "exact", head: true })
        .eq("product_id", invite.product_id);
      zapytanie = o.user_id
        ? zapytanie.eq("user_id", o.user_id)
        // Escape wildcardów ILIKE (% _ \) — bez tego `jan_kowalski@x.com`
        // dopasowałby też `janXkowalski@x.com` i fałszywie „znalazłby" opinię
        // kogoś innego, tłumiąc należne przypomnienie (ten sam wzorzec co
        // link-guest-orders.ts, audyt 2026-06-11 MEDIUM).
        : zapytanie.ilike("guest_email", escapeIlike(invite.email));
      const { count } = await zapytanie;

      if (!shouldRemind(invite, (count ?? 0) > 0, teraz)) continue;

      const branding = await getMailBranding();
      const locale = mailLocale(o.currency);
      const base = process.env.NEXT_PUBLIC_APP_URL ?? "https://mollien.pl";
      const { data: produkt } = await admin
        .from("products")
        .select("name")
        .eq("id", invite.product_id)
        .maybeSingle();
      const productName = (produkt as { name: string } | null)?.name ?? "Twój zakup";

      // ⚠️ Jawnego tokenu NIE MA w bazie (leży tylko skrót), więc przypomnienie
      // dla gościa nie może odtworzyć starego linku. Wystawiamy NOWY token
      // i podmieniamy skrót w tym samym wierszu — stary link przestaje działać,
      // co jest pożądane: w obiegu ma być jeden ważny link.
      let nowyToken: string | null = null;
      if (!o.user_id) {
        nowyToken = generateInviteToken();
        const { error: errToken } = await admin
          .from("review_invites")
          .update({ token_hash: hashInviteToken(nowyToken) } as never)
          .eq("id", invite.id);
        if (errToken) continue;
      }
      const reviewUrl = reviewUrlFor({
        base,
        locale,
        maKonto: o.user_id !== null,
        productId: invite.product_id,
        token: nowyToken,
      });

      const html = await render(
        ReviewRequest({
          branding,
          locale,
          productName,
          reviewUrl,
          orderNumber: o.order_number,
          przypomnienie: true,
        })
      );
      const ok = await sendMail({
        to: invite.email,
        subject:
          locale === "de"
            ? `Erinnerung: Wie gefällt Ihnen ${productName}?`
            : `Przypomnienie: jak sprawdza się ${productName}?`,
        html,
      });
      // reminded_at ustawiamy nawet przy nieudanej wysyłce — inaczej trwała
      // awaria adresu oznaczałaby ponawianie w nieskończoność, raz na dobę.
      await admin
        .from("review_invites")
        .update({ reminded_at: new Date().toISOString() } as never)
        .eq("id", invite.id);
      if (ok) wyslane++;
    } catch (err) {
      // Bez adresu e-mail ani tokenu w logu — sam identyfikator zaproszenia
      // wystarcza do zdiagnozowania, którego wiersza dotyczyła awaria.
      console.error(`[mail] sendReviewReminders — błąd przy zaproszeniu ${invite.id}:`, err);
    }
  }

  return { wyslane };
}
