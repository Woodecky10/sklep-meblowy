// Warstwa odczytu zestawów (wzorzec collections.ts): definicje z unstable_cache
// (tag "bundles"), składniki-produkty dociągane per wywołanie i lokalizowane.
// Zestaw jest WIDOCZNY tylko gdy: is_active ORAZ wszystkie składniki istnieją
// i są aktywne ORAZ składników >= 2 — inaczej znika z frontu (self-healing po
// usunięciu/ukryciu produktu).

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeProduct, localizeBundle } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import type { Bundle, BundleWithComponents, Product } from "./types";

export const BUNDLES_CACHE_TAG = "bundles";

type BundleRow = Bundle & { bundle_items: { product_id: string; position: number }[] };

const fetchAllBundles = unstable_cache(
  async (): Promise<BundleRow[]> => {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("bundles")
      .select("*, bundle_items(product_id, position)")
      .order("created_at", { ascending: false });
    return (data ?? []) as BundleRow[];
  },
  ["bundles-all"],
  { tags: [BUNDLES_CACHE_TAG], revalidate: 300 }
);

const getAllBundlesRaw = cache(fetchAllBundles);

// Dociąga aktywne produkty-składniki i odfiltrowuje niekompletne zestawy.
async function buildWithComponents(
  rows: BundleRow[],
  locale: Locale
): Promise<BundleWithComponents[]> {
  if (rows.length === 0) return [];
  const productIds = Array.from(
    new Set(rows.flatMap((r) => r.bundle_items.map((i) => i.product_id)))
  );
  if (productIds.length === 0) return [];
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds)
    .eq("is_active", true);
  const byId = new Map(
    ((data ?? []) as Product[]).map((p) => [p.id, localizeProduct(p, locale)])
  );
  const out: BundleWithComponents[] = [];
  for (const r of rows) {
    const ordered = [...r.bundle_items].sort((a, b) => a.position - b.position);
    const components = ordered
      .map((i) => byId.get(i.product_id))
      .filter((p): p is Product => !!p);
    // Komplet = każdy wpis składu ma aktywny produkt i jest ich >= 2.
    if (components.length < 2 || components.length !== ordered.length) continue;
    const { bundle_items: _drop, ...bundle } = r;
    out.push({ ...localizeBundle(bundle, locale), components });
  }
  return out;
}

// Aktywne, kompletne zestawy zawierające produkt — do boxu na karcie produktu.
export async function getBundlesForProduct(
  productId: string,
  locale: Locale = DEFAULT_LOCALE,
  limit = 3
): Promise<BundleWithComponents[]> {
  const all = await getAllBundlesRaw();
  const rows = all.filter(
    (b) => b.is_active && b.bundle_items.some((i) => i.product_id === productId)
  );
  return (await buildWithComponents(rows, locale)).slice(0, limit);
}

// Pojedynczy zestaw do strony /zestaw/[slug]. Null gdy brak/nieaktywny/niekompletny.
export async function getBundleBySlug(
  slug: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<BundleWithComponents | null> {
  const all = await getAllBundlesRaw();
  const row = all.find((b) => b.slug === slug && b.is_active);
  if (!row) return null;
  const built = await buildWithComponents([row], locale);
  return built[0] ?? null;
}

// Slugi widocznych zestawów — do sitemapy.
export async function getActiveBundleSlugs(): Promise<string[]> {
  const all = await getAllBundlesRaw();
  const active = all.filter((b) => b.is_active);
  const built = await buildWithComponents(active, DEFAULT_LOCALE);
  return built.map((b) => b.slug);
}

// Panel admina: wszystkie zestawy (też nieaktywne/niekompletne) + skład.
// Bez cache — admin ma widzieć świeży stan.
export async function getAllBundlesAdmin(): Promise<(Bundle & { product_ids: string[] })[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("bundles")
    .select("*, bundle_items(product_id, position)")
    .order("created_at", { ascending: false });
  return ((data ?? []) as BundleRow[]).map((r) => {
    const { bundle_items, ...bundle } = r;
    return {
      ...bundle,
      product_ids: [...bundle_items]
        .sort((a, b) => a.position - b.position)
        .map((i) => i.product_id),
    };
  });
}

export function invalidateBundlesCache() {
  revalidateTag(BUNDLES_CACHE_TAG, "max");
}
