"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateCollectionsCache } from "@/app/_lib/collections";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 500): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Slugifikacja (kebab-case PL — bez polskich diakrytyków, bez spacji)
function toSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// ============================================================
// CREATE
// ============================================================
export async function createCollection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Nazwa kolekcji jest wymagana" };

  const slugInput = sanitize(formData.get("slug"), 80);
  const slug = slugInput ? toSlug(slugInput) : toSlug(label);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować sluga" };

  const description = emptyToNull(sanitize(formData.get("description"), 1000));

  const supabase = await createAdminClient();
  const { error, data } = await supabase
    .from("collections")
    .insert({ slug, label, description } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Kolekcja "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  return { ok: true, message: `Kolekcja "${label}" utworzona`, data };
}

// ============================================================
// UPDATE — tylko label + description (slug niezmienny po utworzeniu)
// ============================================================
export async function updateCollection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const label = sanitize(formData.get("label"), 200);
  if (!label) return { ok: false, error: "Nazwa kolekcji jest wymagana" };

  const description = emptyToNull(sanitize(formData.get("description"), 1000));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("collections")
    .update({ label, description } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: "Kolekcja zapisana" };
}

// ============================================================
// DELETE
// ============================================================
// Produkty należące do kolekcji NIE są kasowane — FK ON DELETE SET NULL
// odepnie je automatycznie.
export async function deleteCollection(formData: FormData): Promise<ActionResult> {
  await requireAdmin();

  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("collections").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: "Kolekcja usunięta" };
}

// ============================================================
// setCollectionProducts — przypisz dokładnie tę listę produktów do kolekcji
// ============================================================
// 1. Wszystkie podane productIds dostają collection_id = collectionId.
// 2. Wszystkie INNE produkty obecnie należące do tej kolekcji (które nie są
//    w nowej liście) — odpinają się (collection_id = null).
// Atomowo na poziomie kolekcji.
export async function setCollectionProducts(
  collectionId: string,
  productIds: string[]
): Promise<ActionResult> {
  await requireAdmin();
  if (!collectionId) return { ok: false, error: "Brak id kolekcji" };

  const supabase = await createAdminClient();

  // Krok 1: assign wszystkie nowe
  if (productIds.length > 0) {
    const { error: e1 } = await supabase
      .from("products")
      .update({ collection_id: collectionId } as never)
      .in("id", productIds);
    if (e1) return { ok: false, error: `Przypisywanie: ${e1.message}` };
  }

  // Krok 2: unassign te które NIE są w nowej liście, ale obecnie są w tej kolekcji
  let unassignQuery = supabase
    .from("products")
    .update({ collection_id: null } as never)
    .eq("collection_id", collectionId);
  if (productIds.length > 0) {
    unassignQuery = unassignQuery.not("id", "in", `(${productIds.join(",")})`);
  }
  const { error: e2 } = await unassignQuery;
  if (e2) return { ok: false, error: `Odpinanie: ${e2.message}` };

  invalidateCollectionsCache();
  revalidatePath("/admin/kolekcje");
  revalidatePath("/sklep");
  return { ok: true, message: `Przypisano ${productIds.length} produktów` };
}
