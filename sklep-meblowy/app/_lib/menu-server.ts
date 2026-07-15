// Serwerowa część menu — fetch z cache i inwalidacja (split pure/server).
// Navbar i Footer renderują się na KAŻDEJ stronie — odczyt musi być tani
// (unstable_cache, tag "menu").

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import type { MenuItemRow } from "./menu";

export const MENU_CACHE_TAG = "menu";

const MENU_SELECT =
  "id, location, page_id, label, label_de, sort_order, visible, page:pages(slug, title, title_de, published)";

const fetchMenuItems = unstable_cache(
  async (): Promise<MenuItemRow[] | null> => {
    const supabase = await createAdminClient();
    const { data, error } = await supabase
      .from("menu_items")
      .select(MENU_SELECT)
      .order("sort_order", { ascending: true });
    if (error || !data) return null;
    return data as unknown as MenuItemRow[];
  },
  ["menu-items"],
  { tags: [MENU_CACHE_TAG], revalidate: 60 }
);

export const getMenuItems = cache(fetchMenuItems);

// Admin: świeży odczyt, bez filtrów — edytor pokazuje też ukryte pozycje
// i pozycje szkiców (z oznaczeniem).
export async function getAllMenuItemsAdmin(): Promise<MenuItemRow[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("menu_items")
    .select(MENU_SELECT)
    .order("sort_order", { ascending: true });
  if (error) {
    console.error("getAllMenuItemsAdmin:", error.message);
    return [];
  }
  return (data ?? []) as unknown as MenuItemRow[];
}

export function invalidateMenuCache(): void {
  revalidateTag(MENU_CACHE_TAG, "max");
}
