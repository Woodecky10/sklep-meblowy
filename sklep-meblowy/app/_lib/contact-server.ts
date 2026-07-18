import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { COMPANY } from "./company";
import { pickContact, type ContactInfo } from "./contact";

export const CONTACT_CACHE_TAG = "contact";

// Kontakt zmienia się WYŁĄCZNIE w /admin/strona-glowna (tam revalidateTag).
// Wewnątrz unstable_cache nie wolno cookies() → bare anon client
// (store_settings ma publiczny odczyt RLS). Rzucamy przy błędzie, żeby cache
// nie zapamiętał awaryjnej wartości — fallback jest per wywołanie niżej.
const fetchContact = unstable_cache(
  async (): Promise<{ contact_phone: string | null; contact_email: string | null }> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("contact_phone, contact_email")
      .eq("id", true)
      .single();
    if (error) throw error;
    return data as { contact_phone: string | null; contact_email: string | null };
  },
  ["contact-info"],
  { tags: [CONTACT_CACHE_TAG], revalidate: 300 }
);

// Telefon/email do wyświetlenia klientowi. Override z DB lub fallback COMPANY.
// Fallback per wywołanie (nie zamraża błędu na 300 s).
export async function getContactInfo(): Promise<ContactInfo> {
  try {
    const raw = await fetchContact();
    return {
      phone: pickContact(raw.contact_phone, COMPANY.phone),
      email: pickContact(raw.contact_email, COMPANY.email) ?? COMPANY.email,
    };
  } catch (err) {
    console.error("[contact-server] getContactInfo failed, using COMPANY", err);
    return { phone: COMPANY.phone, email: COMPANY.email };
  }
}

export function invalidateContactCache() {
  revalidateTag(CONTACT_CACHE_TAG, "max");
}
