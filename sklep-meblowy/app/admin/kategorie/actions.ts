"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/app/_lib/supabase/server";
import { isAdmin, requireAdmin } from "@/app/_lib/admin";
import { invalidateCategoriesCache } from "@/app/_lib/categories";

// ============================================================
// Wspólne typy odpowiedzi dla wszystkich akcji admin/kategorie
// ============================================================

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

// Slug-friendly: lowercase litery, cyfry, myślnik. Polskie znaki zamieniane.
const SLUG_REPLACEMENTS: Record<string, string> = {
  ą: "a", ć: "c", ę: "e", ł: "l", ń: "n", ó: "o", ś: "s", ź: "z", ż: "z",
};

function toSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .split("")
    .map((c) => SLUG_REPLACEMENTS[c] ?? c)
    .join("")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function sanitizeLabel(input: unknown): string {
  return typeof input === "string" ? input.trim().slice(0, 200) : "";
}

// Opcjonalna etykieta DE: pusty string → null (fallback do PL przy odczycie).
function sanitizeOptionalLabel(input: unknown): string | null {
  const s = sanitizeLabel(input);
  return s === "" ? null : s;
}

function parseInteger(input: unknown, fallback = 0): number {
  if (typeof input === "string" && input.trim() !== "") {
    const n = Number(input);
    return Number.isFinite(n) ? Math.trunc(n) : fallback;
  }
  if (typeof input === "number" && Number.isFinite(input)) return Math.trunc(input);
  return fallback;
}

function parseOptionalBigInt(input: unknown): number | null {
  if (input === undefined || input === null) return null;
  if (typeof input === "string") {
    const trimmed = input.trim();
    if (trimmed === "") return null;
    const n = Number(trimmed);
    return Number.isFinite(n) && n > 0 ? Math.trunc(n) : null;
  }
  return null;
}

// ============================================================
// CATEGORY GROUPS — grupy top-level (np. Salon, Sypialnia)
// ============================================================

export async function createGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa grupy jest za krótka (min. 2 znaki)" };

  // Slug auto z label, jeśli admin nie podał własnego
  const slugInput = sanitizeLabel(formData.get("slug"));
  const slug = slugInput ? toSlug(slugInput) : toSlug(label);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować sluga z nazwy" };

  const sortOrder = parseInteger(formData.get("sort_order"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("category_groups")
    .insert({ slug, label, sort_order: sortOrder } as never);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Grupa o slug "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: `Grupa "${label}" dodana` };
}

export async function updateGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id grupy" };

  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa grupy jest za krótka" };

  const sortOrder = parseInteger(formData.get("sort_order"));
  const active = formData.get("active") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("category_groups")
    .update({ label, sort_order: sortOrder, active } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Grupa zaktualizowana" };
}

export async function deleteGroup(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id grupy" };

  const supabase = await createAdminClient();

  // Walidacja: blokujemy usunięcie grupy która ma kategorie
  const { count } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("group_id", id);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Nie można usunąć — grupa ma ${count} kategorii. Najpierw przenieś lub usuń kategorie.`,
    };
  }

  const { error } = await supabase.from("category_groups").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Grupa usunięta" };
}

// ============================================================
// CATEGORIES — pojedyncze kategorie produktów
// ============================================================

export async function createCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa kategorii jest za krótka" };

  const groupId = String(formData.get("group_id") ?? "");
  if (!groupId) return { ok: false, error: "Wybierz grupę" };

  const slugInput = sanitizeLabel(formData.get("slug"));
  const slug = slugInput ? toSlug(slugInput) : toSlug(label);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować sluga" };

  const labelDe = sanitizeOptionalLabel(formData.get("label_de"));
  const baselinkerCategoryId = parseOptionalBigInt(formData.get("baselinker_category_id"));
  const sortOrder = parseInteger(formData.get("sort_order"));
  const crossSellCategories = formData
    .getAll("cross_sell_categories")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("categories")
    .insert({
      slug,
      label,
      label_de: labelDe,
      group_id: groupId,
      baselinker_category_id: baselinkerCategoryId,
      cross_sell_categories: crossSellCategories,
      sort_order: sortOrder,
    } as never);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Kategoria o slug "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: `Kategoria "${label}" dodana` };
}

export async function updateCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id kategorii" };

  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa kategorii jest za krótka" };

  const groupId = String(formData.get("group_id") ?? "");
  if (!groupId) return { ok: false, error: "Wybierz grupę" };

  const labelDe = sanitizeOptionalLabel(formData.get("label_de"));
  const baselinkerCategoryId = parseOptionalBigInt(formData.get("baselinker_category_id"));
  const sortOrder = parseInteger(formData.get("sort_order"));
  const active = formData.get("active") === "1";
  const crossSellCategories = formData
    .getAll("cross_sell_categories")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({
      label,
      label_de: labelDe,
      group_id: groupId,
      baselinker_category_id: baselinkerCategoryId,
      cross_sell_categories: crossSellCategories,
      sort_order: sortOrder,
      active,
    } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Kategoria zaktualizowana" };
}

export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id kategorii" };

  const supabase = await createAdminClient();

  // Walidacja: blokujemy usunięcie kategorii która ma produkty
  // (FK products.category → categories.slug też by to wyłapał, ale damy
  // czytelny komunikat zamiast błędu DB)
  const { data: cat } = await supabase
    .from("categories")
    .select("slug, label")
    .eq("id", id)
    .single();

  if (!cat) return { ok: false, error: "Kategoria nie znaleziona" };

  const slug = (cat as { slug: string }).slug;
  const label = (cat as { label: string }).label;

  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category", slug);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Nie można usunąć kategorii "${label}" — ma ${count} ${
        count === 1 ? "produkt" : "produktów"
      }. Najpierw zmień kategorię tych produktów lub je usuń.`,
    };
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: `Kategoria "${label}" usunięta` };
}

// ============================================================
// Pomocnicze — sprawdzenie roli (dla form components, gdzie potrzebujemy
// `await isAdmin(user)` nie chcąc rzucić redirect)
// ============================================================

export async function getCurrentAdminEmail(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isAdmin(user)) return null;
  return user.email ?? null;
}
