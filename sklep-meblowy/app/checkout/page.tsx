import type { Metadata } from "next";
import { createClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import type { Profile } from "@/app/_lib/types";
import CheckoutForm from "./CheckoutForm";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const de = locale === "de";
  return { title: de ? "Kasse" : "Kasa" };
}

export default async function CheckoutPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let profile: Profile | null = null;
  if (user) {
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    profile = data as Profile | null;
  }

  const c = de
    ? { eyebrow: "Kasse", heading: "Lieferadresse" }
    : { eyebrow: "Kasa", heading: "Dane dostawy" };

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {c.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          {c.heading}
        </h1>
      </div>

      <CheckoutForm
        defaultEmail={user?.email ?? ""}
        defaultFullName={profile?.full_name ?? ""}
        defaultAddress={profile?.address ?? null}
        isLoggedIn={!!user}
      />
    </div>
  );
}
