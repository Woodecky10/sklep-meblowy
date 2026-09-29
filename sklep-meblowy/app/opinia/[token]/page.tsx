import type { Metadata } from "next";
import { cache } from "react";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { findInviteByToken } from "@/app/_lib/review-invites-server";
import { inviteState } from "@/app/_lib/review-tokens";
import GuestReviewForm from "./GuestReviewForm";

// cache(): metadata i strona pytają o to samo zaproszenie w jednym renderze.
const getInvite = cache(findInviteByToken);

const TYTUL_UZYTE = "Opinia już wysłana";
const TYTUL_WYGASLE = "Link wygasł";

// Tytuł karty = to, co strona faktycznie pokaże. Zły token → notFound() już
// tutaj, żeby karta dostała tytuł 404, a nie „Wystaw opinię" nad stroną błędu.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const invite = await getInvite(token);
  if (!invite) notFound();
  const stan = inviteState(invite, new Date());
  const title =
    stan === "used" ? TYTUL_UZYTE : stan === "expired" ? TYTUL_WYGASLE : "Wystaw opinię";
  return { title, robots: { index: false, follow: false } };
}

export default async function OpiniaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await getInvite(token);
  if (!invite) notFound();

  const stan = inviteState(invite, new Date());
  if (stan === "used") {
    return <Komunikat tytul={TYTUL_UZYTE} tresc="Dziękujemy — Twoja opinia jest już na stronie." />;
  }
  if (stan === "expired") {
    return <Komunikat tytul={TYTUL_WYGASLE} tresc="Ten link do wystawienia opinii stracił ważność. Jeśli nadal chcesz podzielić się wrażeniami, napisz do nas." />;
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
