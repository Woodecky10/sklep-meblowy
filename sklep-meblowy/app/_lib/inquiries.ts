// Helpery do tabeli product_inquiries — zapytania klientów o niestandardowe
// kolory / własne warianty. Klient wypełnia modal na karcie produktu,
// admin moderuje w /admin/zapytania.

import { createAdminClient } from "./supabase/server";

export type InquiryStatus = "new" | "read" | "replied" | "closed";

export type Inquiry = {
  id: string;
  product_id: string | null;
  product_name: string;
  customer_name: string;
  customer_email: string;
  customer_phone: string | null;
  message: string;
  status: InquiryStatus;
  created_at: string;
  updated_at: string;
};

// Admin: lista wszystkich zapytań, najnowsze pierwsze
export async function getAllInquiries(): Promise<Inquiry[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("product_inquiries")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as Inquiry[];
}

// Liczba nowych zapytań (do badge w sidebar / pulpicie)
export async function getNewInquiriesCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count } = await supabase
    .from("product_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");
  return count ?? 0;
}
