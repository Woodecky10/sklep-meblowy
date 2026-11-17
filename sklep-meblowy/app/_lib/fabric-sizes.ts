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

// Dopłaty grup KLUCZOWANE KODEM grupy dla każdego produktu (id produktu → kod
// grupy → zł). Karta produktu podaje je selektorowi tkanin, żeby nagłówek grupy
// pokazywał kwotę mebla, który akurat renderuje (produkt główny i każdy
// składnik zestawu w modalu „Kup w zestawie"). Produkt bez źródła = globalne.
export function groupSurchargesByProduct(
  products: { id: string; category: string; fabric_size_id?: string | null; fabric_surcharges?: unknown }[],
  groups: { code: string; surcharge: number }[],
  categories: { slug: string; defaultFabricSizeId?: string | null }[],
  sizes: FabricSize[]
): Record<string, Record<string, number>> {
  // effectiveGroupSurcharges kluczuje wynik polem id — podajemy kod jako id.
  const byCode = groups.map((g) => ({ id: g.code, code: g.code, surcharge: g.surcharge }));
  const out: Record<string, Record<string, number>> = {};
  for (const p of products) {
    out[p.id] = effectiveGroupSurcharges(byCode, resolveFabricSizing(p, categories, sizes).surcharges);
  }
  return out;
}

export type GroupSurchargeLabel =
  | { kind: "depends" }
  | { kind: "amount"; amount: number }
  | { kind: "none" };

// Napis kwoty grupy na /tkaniny i /tkaniny/[slug]. „Zależy od mebla" tylko gdy
// któryś rozmiar wycenia tę grupę inaczej niż jej globalna dopłata; inaczej
// kwota (dopłata grupy + korekta tkaniny), a przy zerze „bez dopłaty".
export function groupSurchargeLabel(
  group: { code: string; surcharge: number },
  sizes: { surcharges: FabricSurchargeByCode }[],
  correction = 0
): GroupSurchargeLabel {
  const depends = sizes.some((s) => {
    const v = s.surcharges[group.code];
    return typeof v === "number" && v !== group.surcharge;
  });
  if (depends) return { kind: "depends" };
  const amount = Math.round((group.surcharge + correction) * 100) / 100;
  return amount > 0 ? { kind: "amount", amount } : { kind: "none" };
}

// Produkt z opcją „Tkanina" bez żadnego źródła dopłat wymaga wyboru rozmiaru.
export function needsFabricSize(variants: ProductVariants | null, sizing: FabricSizing): boolean {
  if (sizing.source !== "none") return false;
  return !!variants?.options.some((o) => o.name === FABRIC_OPTION_NAME);
}

// Kwoty grup z pól `<prefix><kod>`. Puste albo brakujące pole POMIJA grupę —
// wtedy obowiązuje jej globalna dopłata (nigdy ciche 0; wpisane „0" zostaje 0).
// Przecinek jako separator dziesiętny; ujemna/nieliczbowa kwota = błąd.
function surchargesFromForm(
  formData: FormData,
  prefix: string,
  groupCodes: string[]
): { ok: true; surcharges: FabricSurchargeByCode } | { ok: false; error: string } {
  const surcharges: FabricSurchargeByCode = {};
  for (const code of groupCodes) {
    const raw = formData.get(`${prefix}${code}`);
    const text = typeof raw === "string" ? raw.trim().replace(",", ".") : "";
    if (text === "") continue;
    const n = Number(text);
    if (!Number.isFinite(n) || n < 0) return { ok: false, error: "Dopłata musi być liczbą nieujemną" };
    surcharges[code] = Math.round(n * 100) / 100;
  }
  return { ok: true, surcharges };
}

// Parser formularza panelu rozmiarów: nazwa (trim, maks. 60 znaków), kolejność
// i kwoty grup (pola surcharge_<kod>; puste = globalna dopłata grupy).
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

  const parsed = surchargesFromForm(formData, "surcharge_", groupCodes);
  if (!parsed.ok) return parsed;
  return { ok: true, name, sort_order, surcharges: parsed.surcharges };
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

// Pole rozmiaru na produkcie: znacznik fabric_size_present, fabric_size_id
// ("" = z kategorii, id rozmiaru, "__own" = własne dopłaty) i
// own_surcharge_<kod>. undefined = formularz bez znacznika (kolumn nie ruszamy).
// Własne dopłaty: puste/brakujące pole = globalna dopłata grupy; żadnej kwoty
// = brak własnych dopłat (null), produkt wraca do rozmiaru z kategorii.
export function productFabricSizingFromForm(
  formData: FormData,
  groupCodes: string[],
  sizes: { id: string }[]
):
  | { fabric_size_id: string | null; fabric_surcharges: FabricSurchargeByCode | null }
  | { error: string }
  | undefined {
  if (!formData.has("fabric_size_present")) return undefined;

  const raw = formData.get("fabric_size_id");
  if (typeof raw === "string" && raw.trim() === "__own") {
    const parsed = surchargesFromForm(formData, "own_surcharge_", groupCodes);
    if (!parsed.ok) return { error: parsed.error };
    const own = Object.keys(parsed.surcharges).length > 0 ? parsed.surcharges : null;
    return { fabric_size_id: null, fabric_surcharges: own };
  }

  const id = fabricSizeIdFromForm(formData, "fabric_size_id", sizes) ?? null;
  return { fabric_size_id: id, fabric_surcharges: null };
}

// Opcje selecta rozmiaru: lista + bieżące id produktu/kategorii, gdy go na
// liście nie ma (lista się nie wczytała albo jest nieaktualna). Bez tego select
// wysłałby pierwszą opcję ("") i niezwiązany zapis po cichu wyczyściłby
// rozmiar. Serwer i tak sprawdza id z bazą.
export function sizeOptionsWithCurrent(
  sizes: { id: string; name: string }[],
  currentId: string | null | undefined,
  missingLabel: string
): { id: string; name: string }[] {
  if (!currentId || sizes.some((s) => s.id === currentId)) return sizes;
  return [...sizes, { id: currentId, name: missingLabel }];
}

// Czy zapis zmienia źródło dopłat produktu (kategoria główna, rozmiar, własne
// dopłaty)? Tylko wtedy zapis podstawowych danych przelicza dopłaty — inaczej
// niezwiązany zapis zmieniałby ceny produktów, których value_prices rozjechały
// się z katalogiem. undefined (baza bez kolumny) = null; {} = brak dopłat.
export function fabricSizingChanged(
  before: { category: string; fabric_size_id?: string | null; fabric_surcharges?: unknown },
  after: { category: string; fabric_size_id?: string | null; fabric_surcharges?: unknown }
): boolean {
  if (before.category !== after.category) return true;
  if ((before.fabric_size_id ?? null) !== (after.fabric_size_id ?? null)) return true;
  const a = parseSurchargeByCode(before.fabric_surcharges);
  const b = parseSurchargeByCode(after.fabric_surcharges);
  if (!a || !b) return a !== b;
  const keys = Object.keys(a);
  return keys.length !== Object.keys(b).length || keys.some((k) => a[k] !== b[k]);
}
