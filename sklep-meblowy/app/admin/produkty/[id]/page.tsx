import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getProduct } from "@/app/_lib/products";
import { getAllCategories } from "@/app/_lib/categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import ProductEditor from "./ProductEditor";
import type { ProductDeFields } from "./TranslationEditor";

export const metadata = { title: "Edycja produktu — Admin" };

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [product, categories, de] = await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
  ]);
  if (!product) notFound();

  return <ProductEditor product={product} categories={categories} de={de} />;
}

// Surowe pola _de produktu — POTRZEBNE niezlokalizowane (getProduct/localizeProduct
// podmienia name/description na DE wg locale, więc nie da się z nich odczytać
// override'ów do edycji). Dedykowany admin select przez service role.
async function getProductDe(id: string): Promise<ProductDeFields> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select(
      "name_de, description_de, color_de, material_de, description_sections_de, needs_translation, translated_at"
    )
    .eq("id", id)
    .maybeSingle();

  const row = (data ?? null) as {
    name_de: string | null;
    description_de: string | null;
    color_de: string | null;
    material_de: string | null;
    description_sections_de: unknown;
    needs_translation: boolean | null;
    translated_at: string | null;
  } | null;

  return {
    name_de: row?.name_de ?? "",
    description_de: row?.description_de ?? "",
    color_de: row?.color_de ?? null,
    material_de: row?.material_de ?? null,
    description_sections_de: row?.description_sections_de ?? null,
    // Brak migracji 29 → kolumna może nie istnieć; traktuj nulla jako "oczekuje".
    needs_translation: row?.needs_translation ?? true,
    translated_at: row?.translated_at ?? null,
  };
}
