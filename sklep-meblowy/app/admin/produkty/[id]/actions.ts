"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import type {
  ProductVariants,
  ProductVariantOverrides,
} from "@/app/_lib/types";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// ============================================================
// Helpers — fetch + save variants
// ============================================================

async function getProductVariants(
  productId: string
): Promise<ProductVariants | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("variants")
    .eq("id", productId)
    .single();
  if (!data) return null;
  return (data as { variants: ProductVariants | null }).variants;
}

async function saveVariants(
  productId: string,
  variants: ProductVariants
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ variants } as never)
    .eq("id", productId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Stabilny klucz wariantu po values — kolejność opcji nie ma znaczenia.
function variantKey(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join("|");
}

// ============================================================
// Update zdjęć przypisanych do wariantu
// ============================================================
// values opisuje który wariant aktualizujemy (np. {"Wariant":"róż"}).
// images: lista URL-i (z product.images) które mają być pokazywane
// gdy klient wybierze ten wariant. Pusta lista = pokazuj wszystkie (fallback).
export async function updateVariantImages(
  productId: string,
  values: Record<string, string>,
  images: string[]
): Promise<ActionResult> {
  await requireAdmin();
  const variants = await getProductVariants(productId);
  if (!variants) return { ok: false, error: "Produkt nie ma wariantów" };

  const targetKey = variantKey(values);
  const updated: ProductVariants = {
    ...variants,
    combinations: variants.combinations.map((c) =>
      variantKey(c.values) === targetKey
        ? { ...c, images: images.length > 0 ? images : undefined }
        : c
    ),
  };

  const result = await saveVariants(productId, updated);
  if (!result.ok) return result;

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  return { ok: true, message: "Zapisano zdjęcia wariantu" };
}

// ============================================================
// Override nazwy opcji ("Wariant" → "Kolor")
// ============================================================
export async function updateOptionName(
  productId: string,
  optionName: string,
  displayName: string
): Promise<ActionResult> {
  await requireAdmin();
  const variants = await getProductVariants(productId);
  if (!variants) return { ok: false, error: "Produkt nie ma wariantów" };

  const overrides: ProductVariantOverrides = {
    ...(variants.overrides ?? {}),
    option_names: {
      ...(variants.overrides?.option_names ?? {}),
    },
  };

  const trimmed = displayName.trim();
  if (!trimmed || trimmed === optionName) {
    // Czyść override gdy puste lub równe surowej nazwie
    delete overrides.option_names![optionName];
    if (Object.keys(overrides.option_names!).length === 0) {
      delete overrides.option_names;
    }
  } else {
    overrides.option_names![optionName] = trimmed;
  }

  const updated: ProductVariants = {
    ...variants,
    overrides:
      Object.keys(overrides).length > 0 ? overrides : undefined,
  };

  const result = await saveVariants(productId, updated);
  if (!result.ok) return result;

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  return { ok: true, message: "Zapisano nazwę opcji" };
}

// ============================================================
// Override label-i wartości ("01 beż drewniany stelaż" → "Beż drewniany")
// ============================================================
export async function updateValueLabel(
  productId: string,
  optionName: string,
  rawValue: string,
  displayLabel: string
): Promise<ActionResult> {
  await requireAdmin();
  const variants = await getProductVariants(productId);
  if (!variants) return { ok: false, error: "Produkt nie ma wariantów" };

  const overrides: ProductVariantOverrides = {
    ...(variants.overrides ?? {}),
    value_labels: {
      ...(variants.overrides?.value_labels ?? {}),
    },
  };

  const optionLabels = {
    ...(overrides.value_labels![optionName] ?? {}),
  };

  const trimmed = displayLabel.trim();
  if (!trimmed || trimmed === rawValue) {
    delete optionLabels[rawValue];
  } else {
    optionLabels[rawValue] = trimmed;
  }

  if (Object.keys(optionLabels).length > 0) {
    overrides.value_labels![optionName] = optionLabels;
  } else {
    delete overrides.value_labels![optionName];
  }
  if (Object.keys(overrides.value_labels!).length === 0) {
    delete overrides.value_labels;
  }

  const updated: ProductVariants = {
    ...variants,
    overrides:
      Object.keys(overrides).length > 0 ? overrides : undefined,
  };

  const result = await saveVariants(productId, updated);
  if (!result.ok) return result;

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  return { ok: true, message: "Zapisano nazwę wariantu" };
}
