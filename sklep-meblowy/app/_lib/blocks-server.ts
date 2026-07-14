// Serwerowa część systemu bloków — fetch z cache i inwalidacja.
//
// WYDZIELONE z blocks.ts: blocks.ts trzyma TYLKO czyste typy/rejestr/merge/
// lokalizację/walidację, bo importują go (wartościami) komponenty klienckie
// admina (BlocksEditor, AddBlockModal, BlockForms). Import supabase/server
// (next/headers) w module wciąganym do bundla klienta wysypuje build —
// ten sam wzorzec co i18n.ts / i18n-server.ts.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { isContentBlockType, mergeHomeBlocks, type PageBlockRow } from "./blocks";

// ── Fetch z cache ────────────────────────────────────────────────────────
export const PAGE_BLOCKS_CACHE_TAG = "page-blocks";

// Cross-request cache (wzorzec home-sections/trust-items). Wewnątrz
// unstable_cache nie wolno cookies() — createAdminClient jest bez cookies.
// Błąd/brak tabeli → null → mergeHomeBlocks zwraca defaulty (fail-open,
// sklep nigdy nie pada przez brak migracji 52).
const fetchHomeBlocks = unstable_cache(
  async (): Promise<PageBlockRow[] | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("page_blocks")
      .select("id, page_id, block_type, sort_order, visible, content")
      .is("page_id", null)
      .order("sort_order", { ascending: true });
    if (error || !data) return null;
    return data as PageBlockRow[];
  },
  ["home-blocks"],
  { tags: [PAGE_BLOCKS_CACHE_TAG], revalidate: 60 }
);

export const getHomeBlocks = cache(async (): Promise<PageBlockRow[]> =>
  mergeHomeBlocks(await fetchHomeBlocks())
);

// Admin: świeży odczyt bez cache (po mutacji router.refresh() widzi zmiany).
export async function getAllHomeBlocksAdmin(): Promise<PageBlockRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .select("id, page_id, block_type, sort_order, visible, content")
    .is("page_id", null)
    .order("sort_order", { ascending: true });
  if (error) console.error("getAllHomeBlocksAdmin:", error.message);
  return mergeHomeBlocks(error ? null : ((data ?? []) as PageBlockRow[]));
}

export function invalidatePageBlocksCache(): void {
  revalidateTag(PAGE_BLOCKS_CACHE_TAG, "max");
}

// Picker produktów dla bloku "products" w hubie admina. Dedykowany odczyt:
// tylko aktywne (ukryte i tak nie wyrenderują się na sklepie — RLS anon),
// BEZ wykluczania produktów z "Polecanych" (getAvailableProductsForFeatured
// ma inną semantykę i tu nie pasuje).
export async function getProductsForBlockPicker(): Promise<
  { id: string; name: string }[]
> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name")
    .eq("is_active", true)
    .order("name", { ascending: true });
  if (error) {
    console.error("getProductsForBlockPicker:", error.message);
    return [];
  }
  return (data ?? []) as { id: string; name: string }[];
}

// ── Bloki podstron (krok C) ──────────────────────────────────────────────
// Wspólny tag page-blocks (świadome uproszczenie vs per-page tagi ze specu:
// stron kilka, każda mutacja bloków woła invalidatePageBlocksCache()).
// Podstrony nie mają bloków systemowych — bez merge'u z defaultami; nieznane
// typy odpadają tutaj (fail-open, jak mergeHomeBlocks dla home).
const fetchPageBlocks = unstable_cache(
  async (pageId: string): Promise<PageBlockRow[]> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("page_blocks")
      .select("id, page_id, block_type, sort_order, visible, content")
      .eq("page_id", pageId)
      .order("sort_order", { ascending: true });
    if (error || !data) return [];
    return (data as PageBlockRow[]).filter((b) => isContentBlockType(b.block_type));
  },
  ["page-blocks-by-page"],
  { tags: [PAGE_BLOCKS_CACHE_TAG], revalidate: 60 }
);

export const getPageBlocks = cache(fetchPageBlocks);

export async function getPageBlocksAdmin(pageId: string): Promise<PageBlockRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("page_blocks")
    .select("id, page_id, block_type, sort_order, visible, content")
    .eq("page_id", pageId)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("getPageBlocksAdmin:", error.message);
    return [];
  }
  return ((data ?? []) as PageBlockRow[]).filter((b) =>
    isContentBlockType(b.block_type)
  );
}
