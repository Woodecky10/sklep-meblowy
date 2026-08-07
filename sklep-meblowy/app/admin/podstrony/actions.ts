"use server";

// Akcje CRUD podstron (krok C). Wzorce z app/admin/strona-glowna/actions.ts.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { slugifyTitle, validatePageSlug } from "@/app/_lib/pages";
import { invalidatePagesCache } from "@/app/_lib/pages-server";
import { invalidatePageBlocksCache } from "@/app/_lib/blocks-server";
import { isMenuLocation, validateMenuHref, MENU_HREF_MAX } from "@/app/_lib/menu";
import { invalidateMenuCache } from "@/app/_lib/menu-server";
import type { ActionResult } from "@/app/_lib/types";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function sanitize(input: unknown, max = 300): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

// Strona /<slug> renderuje się dynamicznie per request (headers/locale), ale
// unstable_cache trzyma dane 60 s — tagi czyszczą oba źródła; ścieżki dla
// pewności (PL + DE). Kasowanie/zmiana sluga: rewalidujemy też starą ścieżkę.
function revalidatePages(slugs: (string | null | undefined)[]): void {
  invalidatePagesCache();
  invalidatePageBlocksCache();
  for (const slug of slugs) {
    if (!slug) continue;
    revalidatePath(`/${slug}`);
    revalidatePath(`/de/${slug}`);
  }
  revalidatePath("/admin/podstrony");
}

// Menu żyje w Navbarze/stopce na KAŻDEJ stronie → rewalidacja layoutu
// (wzorzec revalidateHome ze strony głównej).
function revalidateMenu(): void {
  invalidateMenuCache();
  revalidatePath("/", "layout");
  revalidatePath("/admin/podstrony");
}

export async function createPage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const title = sanitize(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Tytuł jest wymagany" };
  const requested = sanitize(formData.get("slug"), 100);
  const slug = requested || slugifyTitle(title);
  const valid = validatePageSlug(slug);
  if (!valid.ok) return { ok: false, error: valid.error };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .insert({ slug, title } as never)
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Strona o takim adresie już istnieje" };
    }
    return { ok: false, error: error.message };
  }
  revalidatePages([slug]);
  return {
    ok: true,
    message: "Utworzono stronę (szkic) — uzupełnij treść i opublikuj",
    data: { id: (data as { id: string }).id },
  };
}

export async function updatePageMeta(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono strony" };
  const title = sanitize(formData.get("title"), 200);
  if (!title) return { ok: false, error: "Tytuł jest wymagany" };
  const slug = sanitize(formData.get("slug"), 100);
  const prevSlug = sanitize(formData.get("prev_slug"), 100);
  const valid = validatePageSlug(slug);
  if (!valid.ok) return { ok: false, error: valid.error };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .update({
      title,
      title_de: emptyToNull(sanitize(formData.get("title_de"), 200)),
      slug,
      seo_description: emptyToNull(sanitize(formData.get("seo_description"), 300)),
      seo_description_de: emptyToNull(
        sanitize(formData.get("seo_description_de"), 300)
      ),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .select("id");
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "Strona o takim adresie już istnieje" };
    }
    return { ok: false, error: error.message };
  }
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono strony" };
  revalidatePages([slug, prevSlug !== slug ? prevSlug : null]);
  return { ok: true, message: "Zapisano ustawienia strony" };
}

export async function togglePagePublished(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono strony" };
  const published = formData.get("published") === "1";
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .update({ published, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("slug");
  if (error) return { ok: false, error: error.message };
  const slug = (data as { slug: string }[] | null)?.[0]?.slug;
  if (!slug) return { ok: false, error: "Nie znaleziono strony" };
  revalidatePages([slug]);
  revalidateMenu();
  return {
    ok: true,
    message: published ? "Strona opublikowana" : "Strona cofnięta do szkicu",
  };
}

export async function deletePage(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono strony" };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("pages")
    .delete()
    .eq("id", id)
    .select("slug");
  if (error) return { ok: false, error: error.message };
  const slug = (data as { slug: string }[] | null)?.[0]?.slug;
  if (!slug) return { ok: false, error: "Nie znaleziono strony" };
  revalidatePages([slug]);
  revalidateMenu();
  return { ok: true, message: "Usunięto stronę (razem z jej sekcjami)" };
}

// ============================================================
// Pozycje menu (menu_items, migracja 54)
// ============================================================

export async function addMenuItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const location = sanitize(formData.get("location"), 20);
  if (!isMenuLocation(location)) return { ok: false, error: "Nieznana lokalizacja menu" };
  // Brak pola = stary formularz podstrony (wstecznie zgodne).
  const kind = sanitize(formData.get("kind"), 10) || "page";

  // Wspólny XOR: albo podstrona, albo adres — nigdy oba, nigdy żadne.
  let target: { page_id: string; href: null } | { page_id: null; href: string };
  let label: string | null = null;
  let labelDe: string | null = null;

  if (kind === "href") {
    const href = sanitize(formData.get("href"), MENU_HREF_MAX).toLowerCase();
    const valid = validateMenuHref(href);
    if (!valid.ok) return { ok: false, error: valid.error };
    label = sanitize(formData.get("label"), 100);
    if (!label) return { ok: false, error: "Link własny musi mieć etykietę" };
    labelDe = emptyToNull(sanitize(formData.get("label_de"), 100));
    target = { page_id: null, href };
  } else {
    const pageId = sanitize(formData.get("page_id"), 40);
    if (!UUID_RE.test(pageId)) return { ok: false, error: "Wybierz stronę" };
    target = { page_id: pageId, href: null };
  }

  const supabase = await createAdminClient();
  const { data: maxRows } = await supabase
    .from("menu_items")
    .select("sort_order")
    .eq("location", location)
    .order("sort_order", { ascending: false })
    .limit(1);
  const nextOrder =
    ((maxRows?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;

  const { error } = await supabase.from("menu_items").insert({
    location,
    ...target,
    label,
    label_de: labelDe,
    sort_order: nextOrder,
    visible: true,
  } as never);
  if (error) {
    if (error.code === "23505") {
      return {
        ok: false,
        error: kind === "href" ? "Ten link już jest w tym menu" : "Ta strona już jest w tym menu",
      };
    }
    if (error.code === "23503") return { ok: false, error: "Ta strona już nie istnieje" };
    return { ok: false, error: error.message };
  }
  revalidateMenu();
  return { ok: true, message: "Dodano do menu" };
}

export async function updateMenuItemLabel(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono pozycji menu" };
  const supabase = await createAdminClient();
  // Link własny bez etykiety byłby klikalny, ale niewidoczny. Baza odrzuci to
  // constraintem — sprawdzamy wcześniej, żeby administratorka dostała
  // komunikat po polsku zamiast surowego błędu Postgresa.
  const { data: existing } = await supabase
    .from("menu_items")
    .select("href")
    .eq("id", id)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Nie znaleziono pozycji menu" };
  const label = sanitize(formData.get("label"), 100);
  if ((existing as { href: string | null }).href !== null && !label) {
    return { ok: false, error: "Link własny musi mieć etykietę" };
  }
  const { data, error } = await supabase
    .from("menu_items")
    .update({
      label: emptyToNull(label),
      label_de: emptyToNull(sanitize(formData.get("label_de"), 100)),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono pozycji menu" };
  revalidateMenu();
  return { ok: true, message: "Zapisano etykietę" };
}

export async function toggleMenuItemVisible(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono pozycji menu" };
  const visible = formData.get("visible") === "1";
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("menu_items")
    .update({ visible, updated_at: new Date().toISOString() } as never)
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono pozycji menu" };
  revalidateMenu();
  return { ok: true, message: visible ? "Pozycja widoczna" : "Pozycja ukryta" };
}

export async function deleteMenuItem(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"), 40);
  if (!UUID_RE.test(id)) return { ok: false, error: "Nie znaleziono pozycji menu" };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("menu_items")
    .delete()
    .eq("id", id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) return { ok: false, error: "Nie znaleziono pozycji menu" };
  revalidateMenu();
  return { ok: true, message: "Usunięto pozycję menu (strona zostaje)" };
}

export async function reorderMenuItems(ids: string[]): Promise<ActionResult> {
  await requireAdmin();
  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    new Set(ids).size !== ids.length ||
    !ids.every((id) => typeof id === "string" && UUID_RE.test(id))
  ) {
    return { ok: false, error: "Nieprawidłowa kolejność menu" };
  }
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_menu_items", { p_ids: ids });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };
  revalidateMenu();
  return { ok: true, message: "Zmieniono kolejność" };
}
