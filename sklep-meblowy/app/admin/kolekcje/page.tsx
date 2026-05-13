import { requireAdmin } from "@/app/_lib/admin";
import { getAllCollections } from "@/app/_lib/collections";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import CollectionsEditor from "./CollectionsEditor";

export const metadata = { title: "Kolekcje — Admin" };

export default async function AdminCollectionsPage() {
  await requireAdmin();

  const supabase = await createAdminClient();
  const [collections, { data: productsRaw }] = await Promise.all([
    getAllCollections(),
    supabase
      .from("products")
      .select("*")
      .order("name", { ascending: true }),
  ]);

  const products = (productsRaw ?? []) as Product[];

  // Mapa: collection_id → liczba produktów (dla badge na liście)
  const counts = new Map<string, number>();
  for (const p of products) {
    if (p.collection_id) {
      counts.set(p.collection_id, (counts.get(p.collection_id) ?? 0) + 1);
    }
  }

  return (
    <CollectionsEditor
      initialCollections={collections}
      allProducts={products}
      productCounts={Object.fromEntries(counts)}
    />
  );
}
