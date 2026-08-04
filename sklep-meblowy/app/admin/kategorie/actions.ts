"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, createClient } from "@/app/_lib/supabase/server";
import { isAdmin, requireAdmin } from "@/app/_lib/admin";
import { getAllCategories, invalidateCategoriesCache } from "@/app/_lib/categories";
import { allowedParents } from "@/app/_lib/category-tree";
import { pluralForm } from "@/app/_lib/plural";

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

// ============================================================
// CATEGORIES — węzły drzewa (od migracji 68 nie ma osobnych grup)
// ============================================================

// Puste pole „Rodzic" w formularzu = węzeł najwyższego poziomu (pozycja paska).
function parseParentId(input: unknown): string | null {
  const s = typeof input === "string" ? input.trim() : "";
  return s === "" ? null : s;
}

// Wiadomość dla FK 23503 na parent_id — współdzielona z createCategory, gdzie
// walidacja "czy rodzic istnieje" nie ma sensu robić z wyprzedzeniem (formularz
// nie ma jeszcze id nowego węzła), więc jedyną linią obrony jest złapanie kodu
// błędu Postgresa PO insercie.
const PARENT_NOT_FOUND_ERROR = "Wybrana kategoria-rodzic już nie istnieje — odśwież stronę.";

// Walidacja rodzica PRZED zapisem — trigger w bazie też to złapie, ale rzuci
// surowym błędem Postgresa. Admin ma dostać zdanie po polsku.
async function validateParent(
  id: string | null,
  parentId: string | null
): Promise<string | null> {
  if (!parentId) return null;
  if (id && parentId === id) return "Kategoria nie może być swoim własnym rodzicem";

  // Rozdzielone PRZED sprawdzeniem "czy to potomek": "rodzic w ogóle nie
  // istnieje" (druga zakładka usunęła go w tle) i "rodzic istnieje, ale jest
  // tobą/twoim potomkiem" to dwie różne sytuacje i dwa różne komunikaty —
  // pomieszanie ich wysyła admina szukać cyklu, którego nie ma.
  const nodes = await getAllCategories();
  if (!nodes.some((n) => n.id === parentId)) return PARENT_NOT_FOUND_ERROR;

  if (!id) return null; // nowy węzeł nie ma jeszcze potomków

  const allowed = new Set(allowedParents(nodes, id).map((p) => p.id));
  if (!allowed.has(parentId)) {
    return "Nie można przenieść kategorii pod jej własną podkategorię — najpierw przenieś podkategorię";
  }
  return null;
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa kategorii jest za krótka" };

  const slugInput = sanitizeLabel(formData.get("slug"));
  const slug = slugInput ? toSlug(slugInput) : toSlug(label);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować sluga" };

  const parentId = parseParentId(formData.get("parent_id"));
  const labelDe = sanitizeOptionalLabel(formData.get("label_de"));
  const sortOrder = parseInteger(formData.get("sort_order"));
  const crossSellCategories = formData
    .getAll("cross_sell_categories")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const supabase = await createAdminClient();
  const { error } = await supabase.from("categories").insert({
    slug,
    label,
    label_de: labelDe,
    parent_id: parentId,
    cross_sell_categories: crossSellCategories,
    sort_order: sortOrder,
  } as never);

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `Kategoria o slug "${slug}" już istnieje` };
    // FK parent_id: rodzic zniknął między wyrenderowaniem formularza a
    // zapisem (np. druga zakładka panelu usunęła go w tle). Bez tego admin
    // dostaje surowy błąd Postgresa ("insert or update on table categories
    // violates foreign key constraint...").
    if (error.code === "23503") return { ok: false, error: PARENT_NOT_FOUND_ERROR };
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

  const parentId = parseParentId(formData.get("parent_id"));
  const parentError = await validateParent(id, parentId);
  if (parentError) return { ok: false, error: parentError };

  const labelDe = sanitizeOptionalLabel(formData.get("label_de"));
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
      parent_id: parentId,
      cross_sell_categories: crossSellCategories,
      sort_order: sortOrder,
      active,
    } as never)
    .eq("id", id);

  if (error) {
    // validateParent już sprawdził istnienie rodzica przed tym zapytaniem, ale
    // między odczytem i update jest okno na wyścig (druga zakładka usuwa
    // rodzica w tym samym momencie) — bez tego admin dostałby surowy błąd FK.
    if (error.code === "23503") return { ok: false, error: PARENT_NOT_FOUND_ERROR };
    return { ok: false, error: error.message };
  }

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Kategoria zaktualizowana" };
}

export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id kategorii" };

  const supabase = await createAdminClient();
  const { data: cat } = await supabase
    .from("categories")
    .select("slug, label")
    .eq("id", id)
    .single();

  if (!cat) return { ok: false, error: "Kategoria nie znaleziona" };
  const { slug, label } = cat as { slug: string; label: string };

  // Dzieci PRZED produktami: kategoria-rodzic zwykle nie ma własnych produktów,
  // więc bez tego warunku komunikat brzmiałby „można usunąć", a baza odrzuciłaby
  // zapis przez FK parent_id (on delete restrict) surowym błędem.
  const { count: childCount } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);

  const children = childCount ?? 0;
  if (children > 0) {
    return {
      ok: false,
      error: `Nie można usunąć kategorii "${label}" — ma ${children} ${pluralForm(children, {
        one: "podkategorię",
        few: "podkategorie",
        many: "podkategorii",
      })}. Najpierw przenieś je pod inną kategorię (pole „Rodzic") albo usuń.`,
    };
  }

  // FK products.category → categories.slug też by to wyłapał, ale damy czytelny
  // komunikat zamiast błędu DB.
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category", slug);

  const products = count ?? 0;
  if (products > 0) {
    return {
      ok: false,
      error: `Nie można usunąć kategorii "${label}" — ma ${products} ${pluralForm(products, {
        one: "produkt",
        few: "produkty",
        many: "produktów",
      })}. Najpierw zmień kategorię tych produktów lub je usuń.`,
    };
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: `Kategoria "${label}" usunięta` };
}

// Kolejność wśród RODZEŃSTWA. `parentId === null` = najwyższy poziom.
// Wzorem reorderCollections: odrzucamy całe żądanie, gdy którekolwiek id jest
// puste — reorder_categories przenumerowuje dokładnie to, co dostanie, więc
// samo `.filter(Boolean)` przestawiłoby podzbiór i zameldowało sukces.
export async function reorderCategories(
  parentId: string | null,
  ids: string[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }
  if (ids.some((id) => !id)) {
    return { ok: false, error: "Lista kolejności zawiera puste id — nic nie zapisano" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_categories", {
    p_parent: parentId,
    p_ids: ids,
  });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Kolejność zapisana" };
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
