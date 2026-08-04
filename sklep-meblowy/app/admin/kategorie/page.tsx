import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories, type CategoryDef } from "@/app/_lib/categories";
import { subtreeProductCounts } from "@/app/_lib/category-tree";
import { createAdminClient } from "@/app/_lib/supabase/server";
import KategorieEditor from "./KategorieEditor";

export const metadata = { title: "Kategorie — Admin" };

export default async function AdminKategoriePage() {
  await requireAdmin();

  const [nodes, ownCounts] = await Promise.all([
    getAllCategories(),
    getProductCountsByCategorySlug(),
  ]);

  // Liczniki własne i z poddrzewa liczy czysty moduł — panel dostaje gotowe
  // pary, żeby nie powtarzać tej arytmetyki w komponencie klienckim.
  const counts = Object.fromEntries(subtreeProductCounts(nodes, ownCounts));

  return <KategorieEditor nodes={nodes} counts={counts} />;
}

// Dla każdej kategorii (slug) — ile produktów ma ją przypisaną BEZPOŚREDNIO.
async function getProductCountsByCategorySlug(): Promise<Record<string, number>> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("products").select("category");
  const rows = (data ?? []) as { category: string }[];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.category] = (counts[r.category] ?? 0) + 1;
  }
  return counts;
}

export type { CategoryDef };
