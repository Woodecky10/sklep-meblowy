import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getProduct, getSizeGroupMembersAdmin } from "@/app/_lib/products";
import { getAllCategories } from "@/app/_lib/categories";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getVariantInfoMap } from "@/app/_lib/variant-info-data";
import { createAdminClient } from "@/app/_lib/supabase/server";
import ProductEditor from "./ProductEditor";
import type { ProductDeFields } from "./TranslationEditor";
import type { ProductDescriptionSection } from "@/app/_lib/types";

export const metadata = { title: "Edycja produktu — Admin" };

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [product, categories, de, fabrics, fabricGroups, variantInfo] = await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
    getAllFabrics(),
    getFabricPriceGroups(),
    getVariantInfoMap(),
  ]);
  if (!product) notFound();

  // Panel zawsze pokazuje bieżący produkt; gdy jest w grupie — całe rodzeństwo.
  const sizeGroupMembers = product.size_group
    ? await getSizeGroupMembersAdmin(product.size_group)
    : [{ id: product.id, name: product.name, size_label: product.size_label }];

  return (
    <ProductEditor
      product={product}
      categories={categories}
      de={de}
      sizeGroupMembers={sizeGroupMembers}
      fabrics={fabrics}
      fabricGroups={fabricGroups}
      variantInfo={variantInfo}
    />
  );
}

// Surowe pola _de produktu — POTRZEBNE niezlokalizowane (getProduct/localizeProduct
// podmienia name/description na DE wg locale, więc nie da się z nich odczytać
// override'ów do edycji). Dedykowany admin select przez service role.
async function getProductDe(id: string): Promise<ProductDeFields> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select(
      "name_de, description_de, color_de, material_de, description_sections, description_sections_de, needs_translation, translated_at"
    )
    .eq("id", id)
    .maybeSingle();

  const row = (data ?? null) as {
    name_de: string | null;
    description_de: string | null;
    color_de: string | null;
    material_de: string | null;
    description_sections: ProductDescriptionSection[] | null;
    description_sections_de: ProductDescriptionSection[] | null;
    needs_translation: boolean | null;
    translated_at: string | null;
  } | null;

  return {
    name_de: row?.name_de ?? "",
    description_de: row?.description_de ?? "",
    color_de: row?.color_de ?? null,
    material_de: row?.material_de ?? null,
    // Sekcje PL = struktura źródłowa (do tłumaczenia), sekcje DE = istniejące
    // tłumaczenie (do edycji). Edytor zipuje je po indeksie (PL = prawda).
    description_sections: Array.isArray(row?.description_sections)
      ? row.description_sections
      : [],
    description_sections_de: Array.isArray(row?.description_sections_de)
      ? row.description_sections_de
      : null,
    // Brak migracji 29 → kolumna może nie istnieć; traktuj nulla jako "oczekuje".
    needs_translation: row?.needs_translation ?? true,
    translated_at: row?.translated_at ?? null,
  };
}
