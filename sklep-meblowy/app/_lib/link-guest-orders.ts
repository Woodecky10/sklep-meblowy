import { createAdminClient } from "./supabase/server";

// Po potwierdzeniu emaila (lub OAuth) — podepnij wcześniejsze zamówienia gościa
// o tym samym adresie email do nowo zweryfikowanego użytkownika.
export async function linkGuestOrders(userId: string, email: string) {
  if (!email) return 0;
  const normalized = email.trim().toLowerCase();

  const supabase = await createAdminClient();
  // ilike — case-insensitive (zamówienia mogły zostać utworzone z różnym casing emaila)
  const { data, error } = await supabase
    .from("orders")
    .update({ user_id: userId, guest_email: null } as never)
    .is("user_id", null)
    .ilike("guest_email", normalized)
    .select("id");

  if (error) {
    console.error("linkGuestOrders error:", error);
    return 0;
  }
  return data?.length ?? 0;
}
