import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { createAdminClient } from "./supabase/server";

// Zdjęcie kafelka udostępnień (og:image) wskazane w /admin/wyglad.
//
// DLACZEGO OSOBNY MODUŁ, A NIE POLE W theme-settings.ts:
// zdjęcie nie jest częścią motywu. Wspólny tag "theme" kazałby przerysowywać
// obrazek przy każdej zmianie koloru, a zmianę zdjęcia mieszałby z paletą.
// Osobny tag = obie rzeczy unieważniają się niezależnie.
//
// Wewnątrz unstable_cache nie wolno używać cookies() → czysty klient anon
// (store_settings ma publiczny odczyt RLS — tak samo czyta kurs EUR).

export const OG_IMAGE_CACHE_TAG = "og-image";

function normalize(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

const fetchOgImageUrl = unstable_cache(
  async (): Promise<string | null> => {
    const supabase = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const { data, error } = await supabase
      .from("store_settings")
      .select("og_image_url")
      .eq("id", true)
      .single();
    // Rzucamy zamiast zwracać null, żeby cache NIE zapamiętał „brak zdjęcia"
    // na 300 s po jednym błędzie odczytu — fallback jest per wywołanie niżej.
    if (error) throw error;
    return normalize((data as { og_image_url: string | null }).og_image_url);
  },
  ["og-image-url"],
  { tags: [OG_IMAGE_CACHE_TAG], revalidate: 300 }
);

// Brak zdjęcia NIE jest błędem — route/og ma wtedy własną ścieżkę awaryjną
// (pierwszy slajd hero, potem karta brandowa).
export async function getOgImageUrl(): Promise<string | null> {
  try {
    return await fetchOgImageUrl();
  } catch (err) {
    console.error("[og-image-settings] getOgImageUrl failed, no photo", err);
    return null;
  }
}

// Admin: świeży odczyt bez cache (formularz po zapisie ma widzieć stan z DB).
export async function getOgImageUrlUncached(): Promise<string | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("store_settings")
    .select("og_image_url")
    .eq("id", true)
    .maybeSingle();
  if (error) {
    console.error("[og-image-settings] getOgImageUrlUncached failed", error);
    return null;
  }
  return normalize((data as { og_image_url: string | null } | null)?.og_image_url);
}

export function invalidateOgImageCache() {
  revalidateTag(OG_IMAGE_CACHE_TAG, "max");
}
