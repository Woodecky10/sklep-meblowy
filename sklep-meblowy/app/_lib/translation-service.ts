import { createAdminClient } from "./supabase/server";
import { translateTexts } from "./translate";
import { translateProductFields, type TranslateFn } from "./translate-entities";
import { runTranslationSweep } from "./translation-sweep";

const PRODUCTS_PER_RUN = 25;

const deepl: TranslateFn = (texts, opts) => translateTexts(texts, { html: opts?.html });

export async function translateProductRow(
  product: { id: string; name: string; description: string; color: string | null; material: string | null; description_sections: unknown },
  supabase: Awaited<ReturnType<typeof createAdminClient>>
): Promise<void> {
  const de = await translateProductFields(
    {
      name: product.name,
      description: product.description,
      color: product.color,
      material: product.material,
      description_sections: product.description_sections as never,
    },
    deepl
  );
  const { error } = await supabase
    .from("products")
    .update({
      name_de: de.name_de,
      description_de: de.description_de,
      color_de: de.color_de,
      material_de: de.material_de,
      description_sections_de: de.description_sections_de,
      needs_translation: false,
      translated_at: new Date().toISOString(),
    } as never)
    .eq("id", product.id);
  if (error) throw new Error(error.message);
}

// Sweep obejmuje TYLKO produkty (one przychodzą hurtem z syncu BL). Kategorie i
// recenzje tłumaczone są inline (Task 8/13) — nie potrzebują sweepa.
export async function translatePendingProducts(limit = PRODUCTS_PER_RUN) {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, description, color, material, description_sections")
    .eq("needs_translation", true)
    .order("created_at", { ascending: true })
    .limit(limit + 1);
  if (error) throw new Error(error.message);
  const all = (data ?? []) as { id: string; name: string; description: string; color: string | null; material: string | null; description_sections: unknown }[];
  const limitReached = all.length > limit;
  const items = all.slice(0, limit);
  return runTranslationSweep(
    items,
    (p) =>
      translateProductRow(p, supabase).catch((e) => {
        console.error(`[translate] produkt ${p.id} nieprzetłumaczony:`, e);
        throw e;
      }),
    { limitReached }
  );
}
