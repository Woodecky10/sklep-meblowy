// Produkty dla bloku "products" (sekcja produktowa z admina).
// Klient anon (createClient) — RLS is_active odfiltrowuje ukryte produkty.
// Bez cache: strona i tak renderuje się per request (cookies/wishlist),
// a źródła (kolekcja/kategoria/ręczny wybór) zmieniają się w adminie.

import { createClient } from "./supabase/server";
import { localizeProduct } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Product } from "./types";
import type { LocalizedProductsContent } from "./blocks";

export async function getBlockProducts(
  content: LocalizedProductsContent,
  locale: Locale = DEFAULT_LOCALE
): Promise<Product[]> {
  const supabase = await createClient();

  if (content.source === "manual") {
    if (content.product_ids.length === 0) return [];
    const { data } = await supabase
      .from("products")
      .select("*")
      .in("id", content.product_ids);
    const byId = new Map(((data ?? []) as Product[]).map((p) => [p.id, p]));
    // Kolejność = kolejność wyboru admina; usunięte/ukryte produkty odpadają.
    return content.product_ids
      .map((id) => byId.get(id))
      .filter((p): p is Product => p !== undefined)
      .map((p) => localizeProduct(p, locale));
  }

  if (content.source === "collection") {
    if (!content.collection_slug) return [];
    const { data: coll } = await supabase
      .from("collections")
      .select("id")
      .eq("slug", content.collection_slug)
      .maybeSingle();
    if (!coll) return [];
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("collection_id", (coll as { id: string }).id)
      .order("created_at", { ascending: false })
      .limit(content.limit);
    return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
  }

  // category
  if (!content.category_slug) return [];
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("category", content.category_slug)
    .order("created_at", { ascending: false })
    .limit(content.limit);
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}
