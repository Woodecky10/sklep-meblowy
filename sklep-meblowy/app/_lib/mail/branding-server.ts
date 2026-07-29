import { createAdminClient } from "../supabase/server";
import { brandingFromRaw, type MailBranding, type ThemeRow } from "./branding";

// Odczyt motywu z bazy — tego samego źródła, z którego kolory bierze strona,
// żeby mail nie rozjechał się po zmianie motywu w /admin/wyglad.
// Błąd odczytu nie może zablokować maila: lepiej wysłać w domyślnej palecie.
export async function getMailBranding(): Promise<MailBranding> {
  try {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("store_settings")
      .select("theme_preset, theme_overrides, font_pair")
      .eq("id", true)
      .maybeSingle();
    return brandingFromRaw((data as ThemeRow | null) ?? null);
  } catch (err) {
    console.error("[mail] odczyt motywu nieudany, używam domyślnego:", err);
    return brandingFromRaw(null);
  }
}
