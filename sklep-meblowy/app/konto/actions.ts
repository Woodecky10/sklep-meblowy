"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/app/_lib/supabase/server";
import type { Address } from "@/app/_lib/types";

export type ProfileState = { error?: string; success?: boolean } | null;

export async function updateProfile(
  _state: ProfileState,
  formData: FormData
): Promise<ProfileState> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Brak autoryzacji" };

  const full_name = String(formData.get("full_name") ?? "").trim();
  if (full_name.length < 2) return { error: "Podaj imię i nazwisko" };

  const street = String(formData.get("street") ?? "").trim();
  const city = String(formData.get("city") ?? "").trim();
  const postal_code = String(formData.get("postal_code") ?? "").trim();
  const country = String(formData.get("country") ?? "").trim();

  // Adres zapisujemy tylko jeśli wszystkie pola są wypełnione
  const address: Address | null =
    street && city && postal_code && country
      ? { street, city, postal_code, country }
      : null;

  const { error } = await supabase
    .from("profiles")
    .update({
      full_name,
      address: address as unknown as Record<string, unknown> | null,
    } as never)
    .eq("id", user.id);

  if (error) return { error: error.message };

  revalidatePath("/konto");
  return { success: true };
}
