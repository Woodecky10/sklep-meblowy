// Reużywalna logika sync produktów BaseLinker → Supabase.
// Wywoływana z:
//  - /api/baselinker/sync-products (cron / external trigger po sekrecie)
//  - server action `syncProductsAction` w admin panelu (po requireAdmin)

import { createAdminClient } from "./supabase/server";
import {
  BaseLinkerError,
  getInventories,
  getInventoryProductsList,
  getInventoryProductsData,
  type BLInventoryProduct,
  type BLVariant,
} from "./baselinker";
import { getCategoryByBaselinkerId } from "./categories";
import type {
  Product,
  ProductDimensions,
  ProductVariants,
  ProductVariant,
  ProductVariantOverrides,
} from "./types";

// Klucz do dopasowania wariantów — wartości opcji posortowane po nazwie,
// żeby kolejność nie miała znaczenia: {Kolor:"róż", Rozmiar:"M"} == {Rozmiar:"M", Kolor:"róż"}
function variantKey(values: Record<string, string>): string {
  return Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join("|");
}

// Merge nowych wariantów (z BL) ze starymi (z DB) — zachowuje ręczne edycje
// admina (per-variant images, overrides nazw). BL jest źródłem prawdy dla
// nazw/cen/stocku, admin dla images i overrides.
export function mergeVariantsPreserveAdminEdits(
  fresh: ProductVariants,
  existing: ProductVariants
): ProductVariants {
  const existingByKey = new Map<string, ProductVariant>();
  for (const c of existing.combinations) {
    existingByKey.set(variantKey(c.values), c);
  }

  const merged: ProductVariant[] = fresh.combinations.map((c) => {
    const old = existingByKey.get(variantKey(c.values));
    if (old?.images && old.images.length > 0) {
      return { ...c, images: old.images };
    }
    return c;
  });

  // Overrides zachowujemy w całości — to świadoma zmiana admina.
  const overrides: ProductVariantOverrides | undefined = existing.overrides
    ? { ...existing.overrides }
    : undefined;

  return {
    options: fresh.options,
    combinations: merged,
    ...(overrides ? { overrides } : {}),
  };
}

export type SyncSkippedProduct = {
  id: string;
  name: string;
  reason: string;
};

// Pojedynczy produkt który został dodany/zaktualizowany — id z BL + nazwa
// (dla podglądu w admin panelu).
export type SyncedProduct = {
  id: string;
  name: string;
};

// Statystyki uzupełnienia sekcji opisu (description + 4 extras) dla
// jednego magazynu. Pokazuje koleżance ile produktów ma wypełnione kolejne
// sekcje — żeby wiedziała co dopisać w BL bez ręcznego sprawdzania per produkt.
export type SyncSectionsCoverage = {
  // Sumaryczna liczba produktów po sync (zmapowanych = ok)
  total: number;
  // Ile produktów ma WYPEŁNIONĄ daną sekcję
  with_opis: number; // description (główny opis)
  with_material: number; // description_extra1
  with_pielegnacja: number; // description_extra2
  with_wymiary: number; // description_extra3
  with_faq: number; // description_extra4
};

export type SyncInventoryResult = {
  inventory_id: number;
  inventory_name: string;
  total_in_bl: number;
  inserted: number;
  updated: number;
  // Listy nazw dodanych i zaktualizowanych produktów (do podglądu w panelu).
  // Stare logi z DB nie miały tych pól — UI musi traktować undefined jak [].
  inserted_products?: SyncedProduct[];
  updated_products?: SyncedProduct[];
  skipped: SyncSkippedProduct[];
  // Statystyki uzupełnienia sekcji opisu (description + extras). Pomaga
  // koleżance widzieć ile produktów ma wypełnione kolejne sekcje BL.
  // Niekompatybilne wstecz — stare logi nie mają tego pola.
  sections_coverage?: SyncSectionsCoverage;
};

export type SyncTotals = {
  total_in_bl: number;
  inserted: number;
  updated: number;
  skipped_count: number;
};

export type SyncOutcome =
  | { ok: true; results: SyncInventoryResult[]; totals: SyncTotals; warning?: string }
  | { ok: false; error: string; where?: "BaseLinker API" | "internal"; code?: string };

// ============================================================
// Mappery: BL inventory product → schema products (Supabase)
// ============================================================

function pickFirstImage(images: BLInventoryProduct["images"]): string[] {
  if (!images) return [];
  const values = Object.values(images).filter(
    (v): v is string => typeof v === "string" && v.length > 0
  );
  return values;
}

function getFeature(
  features: BLInventoryProduct["features"],
  name: string
): string | null {
  if (!features) return null;
  const target = name.toLowerCase().trim();

  // Format 1 (aktualny BL): Record<string, string> — {"Kolor": "Brązowy"}
  if (!Array.isArray(features)) {
    for (const [k, v] of Object.entries(features)) {
      if (typeof v === "string" && k.toLowerCase().trim() === target) {
        return v;
      }
    }
    return null;
  }

  // Format 2 (legacy): array {name, value}[]
  const f = features.find(
    (x) => x.name?.toLowerCase().trim() === target
  );
  return f?.value ?? null;
}

// Blacklist cech specyficznych dla Allegro (które admin musi wypełnić w BL
// dla aukcji ale nie mają sensu w sklepie). Filtrowane case-insensitive.
// Powód: koleżanka prowadzi sprzedaż na Allegro przez BL, więc te cechy
// regularnie pojawiają się w BL features i bez filtra leciałyby na Mollien.pl.
const ALLEGRO_JUNK_KEYS = new Set(
  [
    "stan",
    "faktura",
    "faktura vat",
    "numer aukcji",
    "numer oferty",
    "czas wysyłki",
    "czas wysylki",
    "forma płatności",
    "forma platnosci",
    "sprzedawca",
    "kraj pochodzenia produktu",
    "gwarancja sprzedawcy",
  ].map((s) => s.toLowerCase())
);

function isAllegroJunkKey(key: string): boolean {
  return ALLEGRO_JUNK_KEYS.has(key.toLowerCase().trim());
}

// Zbiera WSZYSTKIE cechy z BL jako array {key, value} — zachowuje kolejność
// którą admin ustawił w BL. Filtruje puste wartości + allegro-junk (Stan,
// Faktura VAT, Numer aukcji, etc. — te które koleżanka wypełnia dla
// publikacji na Allegro a nie mają sensu w sklepie).
function extractAllFeatures(
  features: BLInventoryProduct["features"]
): { key: string; value: string }[] {
  if (!features) return [];

  // Format 1 (aktualny BL): Record<string, string>
  if (!Array.isArray(features)) {
    const out: { key: string; value: string }[] = [];
    for (const [k, v] of Object.entries(features)) {
      if (
        typeof k === "string" &&
        k.trim().length > 0 &&
        typeof v === "string" &&
        v.trim().length > 0 &&
        !isAllegroJunkKey(k)
      ) {
        out.push({ key: k.trim(), value: v.trim() });
      }
    }
    return out;
  }

  // Format 2 (legacy): array {name, value}[]
  return features
    .filter(
      (f) =>
        typeof f.name === "string" &&
        f.name.trim().length > 0 &&
        typeof f.value === "string" &&
        f.value.trim().length > 0 &&
        !isAllegroJunkKey(f.name)
    )
    .map((f) => ({ key: f.name.trim(), value: f.value.trim() }));
}

// Hardcoded labelki sekcji opisu — mapowanie 5 pól BL na akordeony IKEA-style.
// Konwencja stała dla wszystkich produktów. Koleżanka uczy się raz: która
// informacja idzie w które pole BL.
const DESCRIPTION_SECTION_LABELS: { field: string; title: string }[] = [
  { field: "description", title: "Opis" },
  { field: "description_extra1", title: "Materiał i wykonanie" },
  { field: "description_extra2", title: "Pielęgnacja i czyszczenie" },
  { field: "description_extra3", title: "Wymiary szczegółowe" },
  { field: "description_extra4", title: "Najczęstsze pytania (FAQ)" },
];

// Builduje sekcje opisu z 5 pól BL text_fields. Pomija sekcje gdzie BL
// nie ma treści — żeby na karcie produktu nie pokazywać pustych akordeonów.
function extractDescriptionSections(
  textFields: BLInventoryProduct["text_fields"]
): { title: string; body: string; kind: "text" }[] {
  if (!textFields) return [];
  const sections: { title: string; body: string; kind: "text" }[] = [];
  for (const { field, title } of DESCRIPTION_SECTION_LABELS) {
    const raw = (textFields as Record<string, string | undefined>)[field];
    if (typeof raw !== "string") continue;
    const trimmed = raw.trim();
    if (trimmed.length === 0) continue;
    sections.push({ title, body: trimmed, kind: "text" });
  }
  return sections;
}

// Sekcja opisu (uniwersalny typ pomocniczy dla merge logic)
type AnySection =
  | { kind: "text"; title: string; body: string }
  | {
      kind: "image";
      image_url: string;
      image_alt: string;
      caption?: string;
    };

// Merge nowych text sekcji z BL ze starymi z DB — zachowuje image sekcje
// dodane przez admina w ich pozycjach (między text sekcjami). BL jest źródłem
// prawdy dla treści tekstowej, admin dla obrazów.
//
// Strategia: dla każdej istniejącej sekcji w DB:
// - jeśli image → zachowaj
// - jeśli text → znajdź matching w nowych BL (po title), użyj nowego body
//   (jeśli BL już nie ma takiej sekcji → drop)
// Następnie dopisz na końcu te BL sekcje które nie miały odpowiednika w DB.
export function mergeSectionsPreserveAdminImages(
  fresh: AnySection[],
  existing: AnySection[]
): AnySection[] {
  if (existing.length === 0) return fresh;

  const freshByTitle = new Map<string, AnySection>();
  for (const s of fresh) {
    if (s.kind === "text") freshByTitle.set(s.title, s);
  }

  const matchedTitles = new Set<string>();
  const merged: AnySection[] = [];

  for (const s of existing) {
    if (s.kind === "image") {
      merged.push(s); // zachowaj obraz admina
    } else {
      // text — sprawdź czy BL nadal ma sekcję o tym samym title
      const updated = freshByTitle.get(s.title);
      if (updated && updated.kind === "text") {
        merged.push(updated);
        matchedTitles.add(s.title);
      }
      // jeśli BL już nie ma → drop (admin nie ma kontroli nad text content)
    }
  }

  // Dopisz na końcu nowe text sekcje z BL których nie było w DB
  for (const s of fresh) {
    if (s.kind === "text" && !matchedTitles.has(s.title)) {
      merged.push(s);
    }
  }

  return merged;
}

function buildDimensions(bl: BLInventoryProduct): ProductDimensions | null {
  const w = Number(bl.width ?? 0);
  const h = Number(bl.height ?? 0);
  // BL używa `length` jako głębokość mebla — nasz schema ma `depth`
  const d = Number(bl.length ?? 0);
  if (!w && !h && !d) return null;
  return { width: w, depth: d, height: h };
}

function defaultPrice(bl: BLInventoryProduct, defaultPriceGroup: number): number {
  if (!bl.prices) return 0;
  const direct = bl.prices[String(defaultPriceGroup)];
  if (typeof direct === "number" && direct > 0) return direct;
  // fallback: pierwsza dodatnia cena z dowolnej grupy
  const any = Object.values(bl.prices).find(
    (v) => typeof v === "number" && v > 0
  );
  return typeof any === "number" ? any : 0;
}

type ProductInsert = Omit<Product, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

// Longest common prefix (case-sensitive) — pomocnicze do parsera wariantów.
function commonPrefix(strings: string[]): string {
  if (strings.length === 0) return "";
  let p = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].startsWith(p)) {
      p = p.slice(0, -1);
      if (!p) return "";
    }
  }
  return p;
}

// Najmniejszy próg długości prefixu żeby uznać że "warto stripować".
// Krótsze prefixy → fallback: pełne nazwy jako wartości.
const PREFIX_THRESHOLD = 5;

// Próbuje sparsować nazwę wariantu jako "Nazwa1: Wartość1, Nazwa2: Wartość2".
// Zwraca obiekt {Nazwa1: Wartość1, ...} albo null jeśli format nie pasuje.
// Wspiera separatory: ',' i ';'.
function parseNamedAttrs(name: string): Record<string, string> | null {
  const pairs = name.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (pairs.length === 0) return null;
  const result: Record<string, string> = {};
  for (const pair of pairs) {
    const match = pair.match(/^([^:]+?)\s*:\s*(.+)$/);
    if (!match) return null;
    const key = match[1].trim();
    const value = match[2].trim();
    if (!key || !value) return null;
    result[key] = value;
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Mapper: BL variants (Record<string, BLVariant>) → ProductVariants.
// Zwraca null gdy BL nie ma wariantów albo dane są niepoprawne.
//
// Strategia 2-etapowa:
// 1) Jeśli WSZYSTKIE nazwy wariantów mają format "Nazwa: Wartość[, Nazwa2:
//    Wartość2]" z tymi samymi kluczami — używamy strukturalnych opcji
//    (np. Kolor + Strona).
// 2) Inaczej fallback: jedna opcja "Wariant" z wartościami uzyskanymi
//    przez strip wspólnego prefixu (np. "Sofa - Lewa" → "Lewa").
function parseVariantsFromBl(
  blVariants: Record<string, BLVariant> | undefined,
  defaultPriceGroup: number,
  mainPrice: number
): ProductVariants | null {
  if (!blVariants) return null;
  const entries = Object.entries(blVariants);
  if (entries.length === 0) return null;

  const names = entries.map(([, v]) => (v.name ?? "").trim());
  if (names.some((n) => !n)) return null;

  function priceModifier(v: BLVariant): number {
    const variantPrice =
      v.prices?.[String(defaultPriceGroup)] ??
      Object.values(v.prices ?? {}).find((p) => typeof p === "number" && p > 0) ??
      mainPrice;
    return variantPrice - mainPrice;
  }
  function variantStock(v: BLVariant): number {
    return Object.values(v.stock ?? {}).reduce(
      (s, q) => s + (typeof q === "number" ? q : 0),
      0
    );
  }

  // ===== Etap 1: strukturalne "Nazwa: Wartość[, ...]" =====
  const parsed = names.map(parseNamedAttrs);
  if (parsed.every((p) => p !== null)) {
    const firstKeys = Object.keys(parsed[0] as Record<string, string>);
    const allSameKeys = parsed.every((p) => {
      const keys = Object.keys(p as Record<string, string>);
      return (
        keys.length === firstKeys.length &&
        firstKeys.every((k) => k in (p as Record<string, string>))
      );
    });
    if (allSameKeys && firstKeys.length > 0) {
      // Wartości per opcja (zachowując kolejność pierwszego wystąpienia)
      const optionValues = new Map<string, string[]>(
        firstKeys.map((k) => [k, []])
      );
      for (const p of parsed) {
        for (const k of firstKeys) {
          const v = (p as Record<string, string>)[k];
          const arr = optionValues.get(k)!;
          if (!arr.includes(v)) arr.push(v);
        }
      }
      const options = firstKeys.map((name) => ({
        name,
        values: optionValues.get(name)!,
      }));
      const combinations: ProductVariant[] = entries.map(([, v], idx) => ({
        values: parsed[idx] as Record<string, string>,
        stock: variantStock(v),
        price_modifier: priceModifier(v),
      }));
      return { options, combinations };
    }
  }

  // ===== Etap 2: fallback — strip wspólnego prefixu, opcja "Wariant" =====
  const prefix = commonPrefix(names);
  const useStripped = prefix.length >= PREFIX_THRESHOLD;
  const rawValues = useStripped
    ? names.map((n) => n.slice(prefix.length).trim())
    : names.map((n) => n.trim());

  const seen = new Set<string>();
  const valuesUnique: string[] = [];
  for (const v of rawValues) {
    if (!v || seen.has(v)) continue;
    seen.add(v);
    valuesUnique.push(v);
  }
  if (valuesUnique.length === 0) return null;

  const optionName = "Wariant";
  const combinations: ProductVariant[] = entries.map(([, v], idx) => ({
    values: { [optionName]: rawValues[idx] },
    stock: variantStock(v),
    price_modifier: priceModifier(v),
  }));
  return {
    options: [{ name: optionName, values: valuesUnique }],
    combinations,
  };
}

async function mapBlToProduct(
  blId: string,
  bl: BLInventoryProduct,
  defaultPriceGroup: number
): Promise<
  | { ok: true; product: ProductInsert }
  | { ok: false; reason: string }
> {
  const name = bl.text_fields?.name ?? "";
  if (!name.trim()) return { ok: false, reason: "brak nazwy" };

  const blCategoryId = Number(bl.category_id ?? 0);
  if (!blCategoryId) return { ok: false, reason: "brak kategorii w BL" };

  const cat = await getCategoryByBaselinkerId(blCategoryId);
  if (!cat) {
    return {
      ok: false,
      reason: `kategoria BL ${blCategoryId} nie zmapowana — dodaj mapowanie w admin panelu /admin/kategorie`,
    };
  }

  const price = defaultPrice(bl, defaultPriceGroup);
  if (!price) return { ok: false, reason: "brak ceny lub cena = 0" };

  // Sklej Opis 1-5 z BL (description + description_extra1..4) z separatorem
  // \n\n. Każde pole to osobny "Opis N" w panelu BL — koleżanka dopisuje
  // kolejne i pojawiają się jeden pod drugim na karcie produktu.
  // NIE strip-ujemy HTML — sanitize robi front (DOMPurify w product-html.ts).
  const description = [
    bl.text_fields?.description,
    bl.text_fields?.description_extra1,
    bl.text_fields?.description_extra2,
    bl.text_fields?.description_extra3,
    bl.text_fields?.description_extra4,
  ]
    .map((s) => (typeof s === "string" ? s.trim() : ""))
    .filter((s) => s.length > 0)
    .join("\n\n");

  const product: ProductInsert = {
    name: name.trim(),
    description,
    price,
    category: cat.slug,
    images: pickFirstImage(bl.images),
    stock: 0, // meble na zamówienie — nieużywane
    color: getFeature(bl.features, "Kolor"),
    material: getFeature(bl.features, "Materiał"),
    dimensions: buildDimensions(bl),
    weight: bl.weight && bl.weight > 0 ? Number(bl.weight) : null,
    construction: getFeature(bl.features, "Konstrukcja"),
    delivery_time: getFeature(bl.features, "Czas realizacji"),
    warranty: getFeature(bl.features, "Gwarancja"),
    // WSZYSTKIE cechy z BL — Allegro template parametry w pełnym zestawie.
    // Wyświetlane na karcie produktu w "Szczegóły produktu" z deduplikacją
    // względem dedykowanych kolumn (Kolor/Materiał/itd. już mają swoje miejsca).
    features: extractAllFeatures(bl.features),
    // Sekcje opisu (IKEA-style akordeony) — 5 pól BL → 5 nazwanych sekcji.
    // Karta produktu renderuje je jako rozwijalne sekcje. Stary description
    // (joined) zostaje jako legacy fallback + SEO.
    description_sections: extractDescriptionSections(bl.text_fields),
    variants: parseVariantsFromBl(bl.variants, defaultPriceGroup, price),
    baselinker_id: blId,
    // Kolekcję przypisuje admin ręcznie w /admin/kolekcje — sync nie ustawia.
    collection_id: null,
  };

  return { ok: true, product };
}

// ============================================================
// Główna funkcja sync — pull z BL → upsert do Supabase
// ============================================================

export async function syncProductsFromBaseLinker(): Promise<SyncOutcome> {
  try {
    const supabase = await createAdminClient();
    const inventories = await getInventories();

    if (inventories.length === 0) {
      return {
        ok: true,
        results: [],
        totals: { total_in_bl: 0, inserted: 0, updated: 0, skipped_count: 0 },
        warning: "Brak magazynów (Inventory) w BaseLinker",
      };
    }

    const results: SyncInventoryResult[] = [];

    for (const inv of inventories) {
      // BL paginuje listę produktów po 1000 — pobierajmy wszystkie strony
      const allIds: string[] = [];
      let page = 1;
      while (true) {
        const list = await getInventoryProductsList(inv.inventory_id, page);
        const ids = Object.keys(list.products ?? {});
        if (ids.length === 0) break;
        allIds.push(...ids);
        if (ids.length < 1000) break;
        page += 1;
      }

      const defaultPriceGroup =
        (inv as unknown as { default_price_group?: number; price_group_id?: number })
          .default_price_group ??
        (inv as unknown as { price_group_id?: number }).price_group_id ??
        0;

      // Pełne dane (chunkowane po 1000)
      const products: Record<string, BLInventoryProduct> = {};
      for (let i = 0; i < allIds.length; i += 1000) {
        const chunk = allIds.slice(i, i + 1000);
        const data = await getInventoryProductsData(inv.inventory_id, chunk);
        Object.assign(products, data.products ?? {});
      }

      const result: SyncInventoryResult = {
        inventory_id: inv.inventory_id,
        inventory_name: inv.name,
        total_in_bl: allIds.length,
        inserted: 0,
        updated: 0,
        inserted_products: [],
        updated_products: [],
        skipped: [],
        sections_coverage: {
          total: 0,
          with_opis: 0,
          with_material: 0,
          with_pielegnacja: 0,
          with_wymiary: 0,
          with_faq: 0,
        },
      };

      for (const [blId, bl] of Object.entries(products)) {
        const mapped = await mapBlToProduct(blId, bl, defaultPriceGroup);

        if (!mapped.ok) {
          result.skipped.push({
            id: blId,
            name: bl.text_fields?.name ?? "(brak nazwy)",
            reason: mapped.reason,
          });
          continue;
        }

        // Zachowaj manualne mapowania admina (zdjęcia per wariant + overrides
        // + image sekcje opisu). BL nie ma tych danych — admin ustawia je
        // w panelu /admin/produkty.
        const { data: existing } = await supabase
          .from("products")
          .select("variants, description_sections")
          .eq("baselinker_id", blId)
          .maybeSingle();

        const existingVariants = (
          existing as { variants: ProductVariants | null } | null
        )?.variants;
        if (mapped.product.variants && existingVariants) {
          mapped.product.variants = mergeVariantsPreserveAdminEdits(
            mapped.product.variants,
            existingVariants
          );
        }

        const existingSections = (
          existing as { description_sections: AnySection[] | null } | null
        )?.description_sections;
        if (existingSections && existingSections.length > 0) {
          mapped.product.description_sections = mergeSectionsPreserveAdminImages(
            mapped.product.description_sections,
            existingSections
          );
        }

        const { data, error } = await supabase
          .from("products")
          .upsert(mapped.product as never, { onConflict: "baselinker_id" })
          .select("id, created_at")
          .single();

        if (error) {
          result.skipped.push({
            id: blId,
            name: mapped.product.name,
            reason: `błąd zapisu: ${error.message}`,
          });
          continue;
        }

        // Heurystyka insert vs update — created_at "świeże" (< 5s) = insert
        const isNew =
          data && new Date(data.created_at).getTime() > Date.now() - 5000;
        const synced: SyncedProduct = { id: blId, name: mapped.product.name };
        if (isNew) {
          result.inserted += 1;
          result.inserted_products!.push(synced);
        } else {
          result.updated += 1;
          result.updated_products!.push(synced);
        }

        // Statystyki uzupełnienia sekcji opisu. Sprawdzamy text_fields (BL),
        // bo description_sections w mapped.product mogłaby być pusta jeśli
        // pole BL było puste — to ten sam wynik. text_fields jest źródłem
        // prawdy o tym co admin wpisał w BL.
        const tf = bl.text_fields as Record<string, string | undefined> | undefined;
        if (tf) {
          const cov = result.sections_coverage!;
          cov.total += 1;
          if (tf.description?.trim()) cov.with_opis += 1;
          if (tf.description_extra1?.trim()) cov.with_material += 1;
          if (tf.description_extra2?.trim()) cov.with_pielegnacja += 1;
          if (tf.description_extra3?.trim()) cov.with_wymiary += 1;
          if (tf.description_extra4?.trim()) cov.with_faq += 1;
        }
      }

      results.push(result);
    }

    const totals: SyncTotals = results.reduce(
      (acc, r) => ({
        total_in_bl: acc.total_in_bl + r.total_in_bl,
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
        skipped_count: acc.skipped_count + r.skipped.length,
      }),
      { total_in_bl: 0, inserted: 0, updated: 0, skipped_count: 0 }
    );

    return { ok: true, results, totals };
  } catch (err) {
    if (err instanceof BaseLinkerError) {
      return {
        ok: false,
        error: err.message,
        where: "BaseLinker API",
        code: err.errorCode,
      };
    }
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Nieznany błąd",
      where: "internal",
    };
  }
}

// ============================================================
// Pomocnicze: zapis logu do tabeli baselinker_sync_log
// ============================================================

export async function logSyncOutcome(
  outcome: SyncOutcome,
  durationMs: number,
  triggeredBy: string | null
): Promise<void> {
  const supabase = await createAdminClient();

  if (outcome.ok) {
    const status: "success" | "partial" =
      outcome.totals.skipped_count > 0 ? "partial" : "success";

    await supabase.from("baselinker_sync_log").insert({
      triggered_by: triggeredBy,
      duration_ms: durationMs,
      status,
      total_in_bl: outcome.totals.total_in_bl,
      inserted: outcome.totals.inserted,
      updated: outcome.totals.updated,
      skipped_count: outcome.totals.skipped_count,
      results: outcome.results as unknown as Record<string, unknown>,
      error_message: null,
    } as never);
  } else {
    await supabase.from("baselinker_sync_log").insert({
      triggered_by: triggeredBy,
      duration_ms: durationMs,
      status: "error",
      total_in_bl: 0,
      inserted: 0,
      updated: 0,
      skipped_count: 0,
      results: null,
      error_message: outcome.error,
    } as never);
  }
}
