import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories, type CategoryDef } from "@/app/_lib/categories";
import { productCountsByNode, type ProductCategoryRow } from "@/app/_lib/extra-categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getFabricSizes } from "@/app/_lib/fabric-sizes-data";
import KategorieEditor from "./KategorieEditor";

export const metadata = { title: "Kategorie" };

export default async function AdminKategoriePage() {
  await requireAdmin();

  const [nodes, products, sizes] = await Promise.all([
    getAllCategories(),
    getProductCategoryRows(),
    getFabricSizes(),
  ]);

  // Liczniki (własne, poddrzewo, tylko główna) liczy czysty moduł — panel
  // dostaje gotowe wartości, żeby nie powtarzać tej arytmetyki w komponencie
  // klienckim.
  const counts = Object.fromEntries(productCountsByNode(nodes, products));

  return <KategorieEditor
      nodes={nodes}
      counts={counts}
      sizes={sizes.map((s) => ({ id: s.id, name: s.name }))}
    />;
}

// Kategoria główna i dodatkowe każdego produktu.
async function getProductCategoryRows(): Promise<ProductCategoryRow[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("products").select("category, extra_categories");
  return (data ?? []) as ProductCategoryRow[];
}

export type { CategoryDef };
