"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateFabricsCache } from "@/app/_lib/fabrics";
import { invalidateFacetsCache } from "@/app/_lib/products";

export type ActionResult =
  | { ok: true; message?: string; data?: unknown }
  | { ok: false; error: string };

function sanitize(input: unknown, max = 200): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

function emptyToNull(v: string): string | null {
  return v === "" ? null : v;
}

function parseSort(input: unknown): number {
  const n = typeof input === "string" ? Number(input) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

// Wiersze koloru z JSON (`[{code, image}]`) → uporządkowane kody + mapa zdjęć.
// Kody: trim, dedupe, zachowana kolejność. image tylko gdy to URL http(s).
function parseColorRows(input: unknown): {
  colors: string[];
  color_images: Record<string, string>;
} {
  const colors: string[] = [];
  const color_images: Record<string, string> = {};
  if (typeof input !== "string") return { colors, color_images };
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return { colors, color_images };
  }
  if (!Array.isArray(rows)) return { colors, color_images };
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r || typeof r !== "object") continue;
    const rec = r as { code?: unknown; image?: unknown };
    const code = typeof rec.code === "string" ? rec.code.trim().slice(0, 60) : "";
    if (!code || seen.has(code)) continue;
    seen.add(code);
    colors.push(code);
    const image = typeof rec.image === "string" ? rec.image.trim() : "";
    if (/^https?:\/\//.test(image)) color_images[code] = image;
  }
  return { colors, color_images };
}

// Dopłata: pusta/NaN/ujemna → 0; inaczej liczba z 2 miejscami.
function parsePrice(input: unknown): number {
  if (typeof input !== "string" || input.trim() === "") return 0;
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100) / 100;
}

export async function createFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));
  const { colors, color_images } = parseColorRows(formData.get("colors_json"));
  const price = parsePrice(formData.get("price"));
  const category = emptyToNull(sanitize(formData.get("category"), 100));

  const supabase = await createAdminClient();
  const { error, data } = await supabase
    .from("fabrics")
    .insert({ name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: `Tkanina "${name}" dodana`, data };
}

export async function updateFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };
  const name = sanitize(formData.get("name"));
  if (!name) return { ok: false, error: "Nazwa tkaniny jest wymagana" };
  const nameDe = emptyToNull(sanitize(formData.get("name_de")));
  const sortOrder = parseSort(formData.get("sort_order"));
  const { colors, color_images } = parseColorRows(formData.get("colors_json"));
  const price = parsePrice(formData.get("price"));
  const category = emptyToNull(sanitize(formData.get("category"), 100));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabrics")
    .update({ name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category } as never)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: "Tkanina zapisana" };
}

// Usunięcie z katalogu NIE rusza produktów, które już mają tę tkaninę w wariancie
// (wartość zostaje zapisana w products.variants). Znika tylko z listy do wyboru
// i z mapy DE (jej wartość zacznie renderować się jako PL).
export async function deleteFabric(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = sanitize(formData.get("id"));
  if (!id) return { ok: false, error: "Brak id" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("fabrics").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateFabricsCache();
  invalidateFacetsCache();
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: "Tkanina usunięta" };
}
