import { createClient } from "@/app/_lib/supabase/server";
import type { Profile } from "@/app/_lib/types";
import CheckoutForm from "./CheckoutForm";

export const metadata = { title: "Kasa — MeblePremium" };

export default async function CheckoutPage() {
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
    profile = (data as Profile | null) ?? null;
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Kasa
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Dane dostawy
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
