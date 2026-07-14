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
import { mergeHomeBlocks, type PageBlockRow } from "./blocks";

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
