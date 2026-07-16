// Serwerowa część podstron — fetch z cache i inwalidacja (split pure/server
// jak blocks.ts/blocks-server.ts). pages.ts trzyma czystą logikę.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { PageRow } from "./pages";

export const PAGES_CACHE_TAG = "pages";

const PAGE_COLUMNS =
  "id, slug, title, title_de, seo_description, seo_description_de, published, updated_at";

// Argument slug wchodzi do klucza cache (unstable_cache dokłada argumenty).
// Błąd/brak tabeli → null → strona 404 (fail-open: reszta sklepu bez zmian).
const fetchPageBySlug = unstable_cache(
  async (slug: string): Promise<PageRow | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("pages")
      .select(PAGE_COLUMNS)
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return data as PageRow;
  },
  ["page-by-slug"],
  { tags: [PAGES_CACHE_TAG], revalidate: 60 }
);

export const getPageBySlug = cache(fetchPageBySlug);

// Admin: świeże odczyty bez cache (po mutacji router.refresh() widzi zmiany).
export async function getAllPagesAdmin(): Promise<PageRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .select(PAGE_COLUMNS)
    .order("title", { ascending: true });
  if (error) {
    console.error("getAllPagesAdmin:", error.message);
    return [];
  }
  return (data ?? []) as PageRow[];
}

export async function getPageAdmin(id: string): Promise<PageRow | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .select(PAGE_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return data as PageRow;
}

// Sitemapa czyta tylko opublikowane (szkice poza indeksem).
export async function getPagesForSitemap(): Promise<
  { slug: string; updated_at: string; title_de: string | null }[]
> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .select("slug, updated_at, title_de")
    .eq("published", true);
  if (error || !data) return [];
  return data as { slug: string; updated_at: string; title_de: string | null }[];
}

export function invalidatePagesCache(): void {
  revalidateTag(PAGES_CACHE_TAG, "max");
}
