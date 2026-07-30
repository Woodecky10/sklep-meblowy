import { createClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import type { Profile } from "@/app/_lib/types";
import ProfileForm from "./ProfileForm";

export async function generateMetadata() {
  // "Profil" jest identyczny w PL i DE (glosariusz: Profil→Profil), marka zostaje.
  await getLocale();
  return { title: "Profil" };
}

export default async function AccountPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const c = de
    ? { heading: "Persönliche Daten" }
    : { heading: "Dane osobowe" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user!.id)
    .single();

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8">
      <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
        {c.heading}
      </h2>
      <ProfileForm profile={profile as Profile} email={user!.email ?? ""} />
    </div>
  );
}
