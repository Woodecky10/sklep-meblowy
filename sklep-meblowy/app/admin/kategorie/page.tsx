import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories, type CategoryDef } from "@/app/_lib/categories";
import { productCountsByNode, type ProductCategoryRow } from "@/app/_lib/extra-categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import KategorieEditor from "./KategorieEditor";

export const metadata = { title: "Kategorie" };

export default async function AdminKategoriePage() {
  await requireAdmin();

  const [nodes, products] = await Promise.all([
    getAllCategories(),
    getProductCategoryRows(),
  ]);

  // Liczniki (własne, poddrzewo, tylko główna) liczy czysty moduł — panel
  // dostaje gotowe wartości, żeby nie powtarzać tej arytmetyki w komponencie
  // klienckim.
  const counts = Object.fromEntries(productCountsByNode(nodes, products));

  return <KategorieEditor nodes={nodes} counts={counts} />;
}

// Kategoria główna i dodatkowe każdego produktu.
async function getProductCategoryRows(): Promise<ProductCategoryRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("products").select("category, extra_categories");
  return (data ?? []) as ProductCategoryRow[];
}

export type { CategoryDef };
