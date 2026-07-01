"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { invalidateFabricsCache } from "@/app/_lib/fabrics";

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

// Kolory/numery: rozdzielane przecinkiem/średnikiem/nową linią, trim, dedupe.
function parseColors(input: unknown): string[] {
  if (typeof input !== "string") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input.split(/[,;\n]+/)) {
    const v = raw.trim().slice(0, 60);
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
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
  const colors = parseColors(formData.get("colors"));
  const price = parsePrice(formData.get("price"));

  const supabase = await createAdminClient();
  const { error, data } = await supabase
    .from("fabrics")
    .insert({ name, name_de: nameDe, sort_order: sortOrder, colors, price } as never)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateFabricsCache();
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
  const colors = parseColors(formData.get("colors"));
  const price = parsePrice(formData.get("price"));

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("fabrics")
    .update({ name, name_de: nameDe, sort_order: sortOrder, colors, price } as never)
    .eq("id", id);

  if (error) {
    if (error.code === "23505") return { ok: false, error: `Tkanina "${name}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateFabricsCache();
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
  revalidatePath("/admin/tkaniny");
  return { ok: true, message: "Tkanina usunięta" };
}
