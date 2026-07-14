"use server";

// Akcje CRUD podstron (krok C). Wzorce z app/admin/strona-glowna/actions.ts.

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { slugifyTitle, validatePageSlug } from "@/app/_lib/pages";
import { invalidatePagesCache } from "@/app/_lib/pages-server";
import { invalidatePageBlocksCache } from "@/app/_lib/blocks-server";
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
  return { ok: true, message: "Usunięto stronę (razem z jej sekcjami)" };
}
