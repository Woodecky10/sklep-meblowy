import { createAdminClient } from "./supabase/server";
import { escapeIlike } from "./search-filter";

// Po potwierdzeniu emaila (lub OAuth) — podepnij wcześniejsze zamówienia gościa
// o tym samym adresie email do nowo zweryfikowanego użytkownika.
export async function linkGuestOrders(userId: string, email: string) {
  if (!email) return 0;
  const normalized = email.trim().toLowerCase();

  const supabase = await createAdminClient();
  // ilike — case-insensitive (legacy zamówienia mogły mieć różny casing emaila).
  // Escape wildcardów ILIKE: bez tego `jan_kowalski@x.com` (_ = dowolny znak)
  // dopasowałby też `janXkowalski@x.com` i podpiął CUDZE zamówienie gościa
  // pod konto (wyciek danych — audyt 2026-06-11 MEDIUM).
  const { data, error } = await supabase
    .from("orders")
    .update({ user_id: userId, guest_email: null } as never)
    .is("user_id", null)
    .ilike("guest_email", escapeIlike(normalized))
    .select("id");

  if (error) {
    console.error("linkGuestOrders error:", error);
    return 0;
  }
  return data?.length ?? 0;
}
