import { createClient } from "@/app/_lib/supabase/server";
import type { Profile } from "@/app/_lib/types";
import ProfileForm from "./ProfileForm";

export const metadata = { title: "Profil — MeblePremium" };

export default async function AccountPage() {
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
        Dane osobowe
      </h2>
      <ProfileForm profile={profile as Profile} email={user!.email ?? ""} />
    </div>
  );
}
