// Rozmiar do dopłat za tkaninę — czysta logika rozstrzygania, które dopłaty
// grup cenowych obowiązują dla produktu (fotel ma mniejsze dopłaty niż narożnik).
// Bez Supabase i Next. Mapy rozmiaru i produktu są kluczowane KODEM grupy
// (fabric_groups.code), mapy do expandFabrics/rebuildFabricValuePrices — ID grupy.
// Brak klucza grupy = globalna dopłata grupy, nigdy 0.
import type { ProductVariants } from "./types";
import { FABRIC_OPTION_NAME } from "./variants";

export type FabricSurchargeByCode = Record<string, number>; // klucz = fabric_groups.code
export type FabricSize = {
  id: string;
  name: string;
  surcharges: FabricSurchargeByCode;
  sort_order: number;
  created_at: string;
};
export type FabricSizeSource = "own" | "product" | "category" | "none";
export type FabricSizing = {
  source: FabricSizeSource;
  size: FabricSize | null; // null dla "own" i "none"
  surcharges: FabricSurchargeByCode | null; // null dla "none"
};

// Zostawia skończone liczby >= 0 (zaokrąglone do 2 miejsc); null gdy wejście
// nie jest obiektem albo nic nie zostało.
export function parseSurchargeByCode(input: unknown): FabricSurchargeByCode | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const out: FabricSurchargeByCode = {};
  for (const [code, value] of Object.entries(input as Record<string, unknown>)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value < 0) continue;
    out[code] = Math.round(value * 100) / 100;
  }
  return Object.keys(out).length > 0 ? out : null;
}

// Kolejność: własne dopłaty produktu → rozmiar produktu → rozmiar kategorii
// głównej → brak. Usunięty (nieznany) rozmiar na produkcie spada niżej.
export function resolveFabricSizing(
  product: { category: string; fabric_size_id?: string | null; fabric_surcharges?: unknown },
  categories: { slug: string; defaultFabricSizeId?: string | null }[],
  sizes: FabricSize[]
): FabricSizing {
  const own = parseSurchargeByCode(product.fabric_surcharges);
  if (own) return { source: "own", size: null, surcharges: own };

  const byId = (id: string | null | undefined) =>
    id ? sizes.find((s) => s.id === id) ?? null : null;

  const productSize = byId(product.fabric_size_id);
  if (productSize) return { source: "product", size: productSize, surcharges: productSize.surcharges };

  const category = categories.find((c) => c.slug === product.category);
  const categorySize = byId(category?.defaultFabricSizeId);
  if (categorySize) return { source: "category", size: categorySize, surcharges: categorySize.surcharges };

  return { source: "none", size: null, surcharges: null };
}

// Dopłaty grup po id grupy: z mapy kodowej, a brak klucza = globalna dopłata.
export function effectiveGroupSurcharges(
  groups: { id: string; code: string; surcharge: number }[],
  byCode: FabricSurchargeByCode | null
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of groups) {
    const own = byCode?.[g.code];
    out[g.id] = typeof own === "number" ? own : g.surcharge;
  }
  return out;
}

// Kopie grup z podmienioną dopłatą (bez mutacji wejścia).
export function withGroupSurcharges<G extends { id: string; surcharge: number }>(
  groups: G[],
  byGroupId: Record<string, number>
): G[] {
  return groups.map((g) => (g.id in byGroupId ? { ...g, surcharge: byGroupId[g.id] } : { ...g }));
}

// Produkt z opcją „Tkanina" bez żadnego źródła dopłat wymaga wyboru rozmiaru.
export function needsFabricSize(variants: ProductVariants | null, sizing: FabricSizing): boolean {
  if (sizing.source !== "none") return false;
  return !!variants?.options.some((o) => o.name === FABRIC_OPTION_NAME);
}

// Parser formularza panelu rozmiarów: nazwa (trim, maks. 60 znaków), kolejność
// i po jednej kwocie na grupę (pole surcharge_<kod>; puste = 0, przecinek ok).
export function fabricSizeFromForm(
  formData: FormData,
  groupCodes: string[]
):
  | { ok: true; name: string; sort_order: number; surcharges: FabricSurchargeByCode }
  | { ok: false; error: string } {
  const rawName = formData.get("name");
  const name = typeof rawName === "string" ? rawName.trim().slice(0, 60) : "";
  if (!name) return { ok: false, error: "Nazwa rozmiaru jest wymagana" };

  const rawSort = formData.get("sort_order");
  const sortNum = typeof rawSort === "string" ? Number(rawSort) : NaN;
  const sort_order = Number.isFinite(sortNum) ? Math.trunc(sortNum) : 0;

  const surcharges: FabricSurchargeByCode = {};
  for (const code of groupCodes) {
    const raw = formData.get(`surcharge_${code}`);
    const text = typeof raw === "string" ? raw.trim().replace(",", ".") : "";
    if (text === "") {
      surcharges[code] = 0;
      continue;
    }
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "Dopłata musi być liczbą nieujemną" };
    }
    surcharges[code] = Math.round(n * 100) / 100;
  }
  return { ok: true, name, sort_order, surcharges };
}

// Pole rozmiaru w formularzu: undefined = formularz bez pola (kolumny nie
// ruszamy), null = brak albo id, którego już nie ma na liście.
export function fabricSizeIdFromForm(
  formData: FormData,
  field: string,
  sizes: { id: string }[]
): string | null | undefined {
  if (!formData.has(field)) return undefined;
  const raw = formData.get(field);
  const id = typeof raw === "string" ? raw.trim() : "";
  if (id === "") return null;
  return sizes.some((s) => s.id === id) ? id : null;
}
