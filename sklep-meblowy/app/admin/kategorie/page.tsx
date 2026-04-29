import { requireAdmin } from "@/app/_lib/admin";
import {
  getAllSections,
  getAllCategories,
  type Section,
  type CategoryDef,
} from "@/app/_lib/categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import KategorieEditor from "./KategorieEditor";

export const metadata = { title: "Kategorie — Admin" };

export default async function AdminKategoriePage() {
  await requireAdmin();

  const [sections, categories, productCounts] = await Promise.all([
    getAllSections(),
    getAllCategories(),
    getProductCountsByCategorySlug(),
  ]);

  return (
    <KategorieEditor
      sections={sections}
      categories={categories}
      productCounts={productCounts}
    />
  );
}

// Dla każdej kategorii (slug) — ile produktów ma ją przypisaną.
// Używane w UI żeby pokazać "(3 produkty)" przy każdej kategorii i blokować
// usunięcie kategorii z produktami.
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

export type { Section, CategoryDef };
