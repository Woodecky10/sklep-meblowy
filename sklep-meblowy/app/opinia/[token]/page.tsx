import { notFound } from "next/navigation";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { findInviteByToken } from "@/app/_lib/review-invites-server";
import { inviteState } from "@/app/_lib/review-tokens";
import GuestReviewForm from "./GuestReviewForm";

export const metadata = { title: "Wystaw opinię", robots: { index: false, follow: false } };

export default async function OpiniaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findInviteByToken(token);
  if (!invite) notFound();

  const stan = inviteState(invite, new Date());
  if (stan === "used") {
    return <Komunikat tytul="Opinia już wysłana" tresc="Dziękujemy — Twoja opinia jest już na stronie." />;
  }
  if (stan === "expired") {
    return <Komunikat tytul="Link wygasł" tresc="Ten link do wystawienia opinii stracił ważność. Jeśli nadal chcesz podzielić się wrażeniami, napisz do nas." />;
  }

  const admin = await createAdminClient();
  const [{ data: produkt }, { data: zamowienie }] = await Promise.all([
    admin.from("products").select("name, images").eq("id", invite.product_id).maybeSingle(),
    admin.from("orders").select("shipping_address").eq("id", invite.order_id).maybeSingle(),
  ]);

  const adres = (zamowienie as { shipping_address: { fullname?: string } } | null)?.shipping_address;

  return (
    <GuestReviewForm
      token={token}
      productName={(produkt as { name: string } | null)?.name ?? "Twój zakup"}
      domyslneImie={adres?.fullname ?? ""}
      domyslnyEmail={invite.email}
    />
  );
}

function Komunikat({ tytul, tresc }: { tytul: string; tresc: string }) {
  return (
    <section className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-3">{tytul}</h1>
      <p className="text-[var(--muted)]">{tresc}</p>
    </section>
  );
}
