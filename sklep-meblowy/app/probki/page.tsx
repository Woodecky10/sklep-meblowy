import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getSampleQuotaLeft } from "@/app/_lib/samples";
import { normalizeEmailKey } from "@/app/_lib/sample-pricing";
import { toSampleFabrics, toSampleGroups } from "@/app/_lib/sample-catalog";
import type { Address, Profile } from "@/app/_lib/types";
import SampleForm from "./SampleForm";

// Zamawianie próbek tkanin (spec 2026-08-01). Strona jest PL-only: /de jest
// zamrożone flagą DE_ENABLED (app/_lib/i18n.ts), więc getLocale() i tak zawsze
// zwraca "pl" — teksty są wpisane wprost, bez słownika i bez gałęzi EUR.
export const metadata: Metadata = {
  title: "Zamów próbki tkanin",
  description: "Pierwsze 3 próbki gratis, dostawa zawsze darmowa.",
  alternates: { canonical: "/probki" },
};

// `?tkanina=` może przyjść jako tablica (`?tkanina=a&tkanina=b`) — bierzemy
// pierwszą wartość, żeby do adresu powrotu nie trafiło „a,b".
function firstParam(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export default async function SamplesPage({
  searchParams,
}: {
  searchParams: Promise<{ tkanina?: string | string[] }>;
}) {
  const tkanina = firstParam((await searchParams).tkanina);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // BRAMKA LOGOWANIA. Darmowa pula jest liczona per (znormalizowany) e-mail,
  // więc bez tożsamości byłaby nieograniczona. `next` niesie preselekcję
  // tkaniny — bez niego klient wraca z logowania na pustą listę i trzeba mu
  // od nowa tłumaczyć, co miał wybrane. To miejsce, gdzie gubi się leady.
  if (!user?.email) {
    const back = tkanina ? `/probki?tkanina=${encodeURIComponent(tkanina)}` : "/probki";
    redirect(`/logowanie?next=${encodeURIComponent(back)}`);
  }

  // Adres do prefillu: profil klienta, a gdy pusty — ostatnie zamówienie mebli.
  // Profil czytamy klientem SESJI (RLS przepuszcza własny wiersz), zamówienia
  // klientem administracyjnym — tak samo jak getUserOrders, z ownership
  // wymuszonym filtrem po user.id z sesji.
  const admin = await createAdminClient();
  const [fabrics, groups, quotaLeft, profileRes, lastOrderRes] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    getSampleQuotaLeft(normalizeEmailKey(user.email)),
    supabase.from("profiles").select("full_name, address").eq("id", user.id).maybeSingle(),
    admin
      .from("orders")
      .select("shipping_address")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const profile = (profileRes.data ?? null) as Pick<Profile, "full_name" | "address"> | null;
  const lastAddress =
    ((lastOrderRes.data ?? null) as { shipping_address: Address | null } | null)
      ?.shipping_address ?? null;
  // Profil ma pierwszeństwo, ale pole po polu: profil z samym imieniem nie może
  // skasować adresu, który klient podał przy ostatnim zamówieniu.
  const address = profile?.address ?? null;
  const pick = (key: keyof Address): string =>
    String(address?.[key] ?? lastAddress?.[key] ?? "");

  return (
    <SampleForm
      fabrics={toSampleFabrics(fabrics)}
      groups={toSampleGroups(groups)}
      quotaLeft={quotaLeft}
      preselectedSlug={tkanina}
      defaultName={profile?.full_name ?? lastAddress?.fullname ?? ""}
      defaultStreet={pick("street")}
      defaultPostalCode={pick("postal_code")}
      defaultCity={pick("city")}
      defaultPhone={pick("phone")}
    />
  );
}
