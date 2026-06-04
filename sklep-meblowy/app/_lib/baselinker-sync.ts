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

// Statystyki uzupełnienia sekcji opisu dla jednego magazynu. Pokazuje
// koleżance ile produktów ma wypełnione kolejne sekcje sklepu — żeby
// wiedziała co dopisać w BL bez ręcznego sprawdzania per produkt.
//
// Mapowanie pól BL → sekcje sklepu zob. DESCRIPTION_SECTION_LABELS.
export type SyncSectionsCoverage = {
  // Sumaryczna liczba produktów po sync (zmapowanych = ok)
  total: number;
  // Ile produktów ma wypełnioną sekcję "Opis"
  // (description + description_extra1 + description_extra2 — przynajmniej jedno)
  with_opis: number;
  // Ile produktów ma wypełnioną sekcję "Wymiary i materiały"
  // (description_extra3 + description_extra4 — przynajmniej jedno)
  with_wymiary_materialy: number;
  // Ile produktów ma sekcję "Informacje dla klienta" (heurystycznie
  // wykryta w dowolnym extra_field zaczynającym się od tej frazy)
  with_informacje: number;
};

// Statystyki sync wariantów — admin widzi ile produktów po sync ma warianty
// z BL i jak były sparsowane (strukturalne "Kolor: X, Rozmiar: Y" vs fallback
// "Wariant: <pełna nazwa>"). Jeśli z 10 wariantowych produktów 9 wpada w
// fallback, koleżanka powinna w BL zmienić nazwy wariantów na format
// "Kolor: Beżowy, Strona: Lewa".
export type SyncVariantsCoverage = {
  // Suma produktów po sync (zmapowanych = ok)
  total: number;
  // Ile produktów ma jakiekolwiek warianty z BL po sync
  with_variants: number;
  // Z tego: ile sparsowano jako STRUKTURALNE (parseNamedAttrs success)
  structured: number;
  // Z tego: ile wpadło w FALLBACK (jedna opcja "Wariant" z wartościami)
  fallback: number;
  // Łączna liczba kombinacji wariantów synced (np. 3 produkty po 6 kombinacji = 18)
  total_combinations: number;
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
  // Statystyki sync wariantów — ile produktów ma warianty z BL i jak były
  // sparsowane. Niekompatybilne wstecz — stare logi nie mają tego pola.
  variants_coverage?: SyncVariantsCoverage;
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

// Hardcoded mapowanie pól BL na sekcje sklepowe (akordeony IKEA-style).
// Każda sekcja może łączyć wiele pól BL — łączymy je separatorem \n\n.
// Sekcja "Informacje dla klienta" wykrywana heurystycznie (BL nie ma
// stałego pola dla niej — koleżanka wpisuje w dowolny extra_field).
//
// Konwencja BL (jak ma być wypełniane przez koleżankę):
//   Opis (głównego)        + Opis 1 + Opis 2  → "Opis" w sklepie
//   Opis 3                  + Opis 4          → "Wymiary i materiały"
//   Dowolny extra_field zaczynający się od "Informacje dla klienta" → osobna sekcja
//
// Wcześniejsza konwencja (do PR #36) była z 5 oddzielnymi sekcjami
// (Materiał i wykonanie / Pielęgnacja / Wymiary szczegółowe / FAQ).
// Klientka zdecydowała że ją to za dużo akordeonów — uproszczenie do 3.
const DESCRIPTION_SECTION_LABELS: { fields: string[]; title: string }[] = [
  {
    fields: ["description", "description_extra1", "description_extra2"],
    title: "Opis",
  },
  {
    fields: ["description_extra3", "description_extra4"],
    title: "Wymiary i materiały",
  },
];

// Klucze które już zostały spożyte przez sekcje powyżej — żebyśmy nie
// duplikowali ich w heurystyce "Informacje dla klienta".
const CONSUMED_FIELDS = new Set(
  DESCRIPTION_SECTION_LABELS.flatMap((s) => s.fields)
);

// Frazy które rozpoznajemy jako początek sekcji "Informacje dla klienta".
// Skanujemy WSZYSTKIE text_fields (description_extra5-10, extra_field_XXXX)
// szukając pola które VALUE zaczyna się od tej frazy. Tak omijamy problem
// niespójnego nazywania pól w BL — szukamy po treści, nie po nazwie pola.
const INFO_SECTION_PATTERNS = [
  /^informacje\s+dla\s+klienta/i,
  /^uwaga\s*[:!]/i,
  /^uwagi\s+dla\s+klienta/i,
];

// Builduje sekcje opisu z pól BL text_fields wg konwencji powyżej.
// Pomija sekcje gdzie wszystkie pola są puste (nie pokazujemy pustych
// akordeonów na karcie produktu).
function extractDescriptionSections(
  textFields: BLInventoryProduct["text_fields"]
): { title: string; body: string; kind: "text" }[] {
  if (!textFields) return [];
  const fields = textFields as Record<string, string | undefined>;
  const sections: { title: string; body: string; kind: "text" }[] = [];

  for (const { fields: blFields, title } of DESCRIPTION_SECTION_LABELS) {
    const parts: string[] = [];
    for (const f of blFields) {
      const raw = fields[f];
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed.length > 0) parts.push(trimmed);
      }
    }
    if (parts.length === 0) continue;
    sections.push({ title, body: parts.join("\n\n"), kind: "text" });
  }

  // Heurystycznie wykryj "Informacje dla klienta" — przeszukaj wszystkie
  // text_fields które NIE zostały już spożyte przez sekcje powyżej.
  // Bierzemy PIERWSZE pole którego VALUE zaczyna się od pasującej frazy
  // (po stripie HTML tagów, żeby <p>Informacje dla klienta</p> się łapało).
  for (const [key, value] of Object.entries(fields)) {
    if (CONSUMED_FIELDS.has(key)) continue;
    if (typeof value !== "string") continue;
    const stripped = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length === 0) continue;
    const head = stripped.slice(0, 100);
    if (INFO_SECTION_PATTERNS.some((re) => re.test(head))) {
      sections.push({
        title: "Informacje dla klienta",
        body: value.trim(),
        kind: "text",
      });
      break;
    }
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

// Wynik parsowania wariantów — zawiera oryginalny ProductVariants + meta
// info o tym jak zostały sparsowane (do telemetrii / variants_coverage).
type ParsedVariants =
  | { kind: "structured"; variants: ProductVariants }
  | { kind: "fallback"; variants: ProductVariants }
  | { kind: "none" };

// Mapper: BL variants (Record<string, BLVariant>) → ProductVariants.
// Zwraca {kind: "none"} gdy BL nie ma wariantów lub dane są niepoprawne.
//
// Strategia 2-etapowa:
// 1) Jeśli WSZYSTKIE nazwy wariantów mają format "Nazwa: Wartość[, Nazwa2:
//    Wartość2]" z tymi samymi kluczami — używamy strukturalnych opcji
//    (np. Kolor + Strona). Najczystszy wynik.
// 2) Inaczej fallback: jedna opcja "Wariant" z wartościami uzyskanymi
//    przez strip wspólnego prefixu (np. "Sofa - Lewa" → "Lewa").
//    Wariantowanie działa, ale UI pokazuje brzydsze nazwy.
function parseVariantsFromBl(
  blVariants: Record<string, BLVariant> | undefined,
  defaultPriceGroup: number,
  mainPrice: number
): ParsedVariants {
  if (!blVariants) return { kind: "none" };
  const entries = Object.entries(blVariants);
  if (entries.length === 0) return { kind: "none" };

  const names = entries.map(([, v]) => (v.name ?? "").trim());
  if (names.some((n) => !n)) return { kind: "none" };

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

  // Dedup wielu BL-wariantów z TYM SAMYM values map do jednej kombinacji.
  // Sumujemy stocki (suma magazynów == łączna dostępność tej kombinacji),
  // price_modifier bierzemy z pierwszego (zakładamy że dla danego SKU
  // koleżanka ustawia spójną cenę, anomalie są błędem konfiguracji w BL).
  // Klucz dedup: variantKey(values) — order-independent.
  function dedupCombinations(combos: ProductVariant[]): ProductVariant[] {
    const byKey = new Map<string, ProductVariant>();
    for (const c of combos) {
      const k = variantKey(c.values);
      const prev = byKey.get(k);
      if (prev) {
        byKey.set(k, {
          ...prev,
          stock: prev.stock + c.stock,
        });
      } else {
        byKey.set(k, c);
      }
    }
    return Array.from(byKey.values());
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
      const rawCombinations: ProductVariant[] = entries.map(([, v], idx) => ({
        values: parsed[idx] as Record<string, string>,
        stock: variantStock(v),
        price_modifier: priceModifier(v),
      }));
      // BL może mieć 2 warianty parsowane do tego samego {Kolor:"X", Strona:"Y"}
      // — dedup żeby findVariant() na karcie produktu działał deterministycznie.
      return {
        kind: "structured",
        variants: { options, combinations: dedupCombinations(rawCombinations) },
      };
    }
  }

  // ===== Etap 2: fallback — strip wspólnego prefixu, opcja "Wariant" =====
  const prefix = commonPrefix(names);
  const useStripped = prefix.length >= PREFIX_THRESHOLD;
  const rawValues = useStripped
    ? names.map((n) => n.slice(prefix.length).trim())
    : names.map((n) => n.trim());

  const optionName = "Wariant";
  // Najpierw budujemy raw kombinacje (jedna per BL variant), potem dedup
  // łączy te z tym samym values mapem sumując stocki. Wartości opcji w UI
  // dropdown wyciągamy z deduplikowanych combos (zachowuje kolejność).
  const rawCombinations: ProductVariant[] = entries
    .map(([, v], idx) => {
      const rv = rawValues[idx];
      if (!rv) return null;
      return {
        values: { [optionName]: rv },
        stock: variantStock(v),
        price_modifier: priceModifier(v),
      } as ProductVariant;
    })
    .filter((c): c is ProductVariant => c !== null);

  if (rawCombinations.length === 0) return { kind: "none" };

  const combinations = dedupCombinations(rawCombinations);
  const valuesUnique = combinations.map((c) => c.values[optionName]);

  return {
    kind: "fallback",
    variants: {
      options: [{ name: optionName, values: valuesUnique }],
      combinations,
    },
  };
}

async function mapBlToProduct(
  blId: string,
  bl: BLInventoryProduct,
  defaultPriceGroup: number
): Promise<
  | { ok: true; product: ProductInsert; parsedVariants: ParsedVariants }
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
  // NIE strip-ujemy HTML — sanitize robi front (sanitizeProductHtml w product-html.ts).
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
    variants: null, // wypełnione niżej z parsedVariants
    baselinker_id: blId,
    // Kolekcję przypisuje admin ręcznie w /admin/kolekcje — sync nie ustawia.
    collection_id: null,
  };

  const parsedVariants = parseVariantsFromBl(bl.variants, defaultPriceGroup, price);
  if (parsedVariants.kind !== "none") {
    product.variants = parsedVariants.variants;
  }

  return { ok: true, product, parsedVariants };
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
          with_wymiary_materialy: 0,
          with_informacje: 0,
        },
        variants_coverage: {
          total: 0,
          with_variants: 0,
          structured: 0,
          fallback: 0,
          total_combinations: 0,
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
        } else if (!mapped.product.variants && existingVariants) {
          // BLOCKER FIX: BL chwilowo nie zwrócił wariantów (warianty błędnie
          // skonfigurowane w BL, BL API glitch, koleżanka wyłączyła warianty
          // w panelu), ale DB ma istniejące warianty z poprzedniego sync
          // (włącznie z adminem-uploadowanymi zdjęciami per wariant i
          // overrides nazw). Nie nadpisujemy null'em — zachowujemy stare
          // warianty + zaznaczamy w skipped log że BL stracił warianty.
          mapped.product.variants = existingVariants;
          result.skipped.push({
            id: blId,
            name: mapped.product.name,
            reason:
              "BL nie zwrócił wariantów, ale produkt miał wcześniej warianty w DB — " +
              "zachowano stare warianty z zdjęciami admina. Sprawdź w BL czy warianty " +
              "są poprawnie skonfigurowane.",
          });
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

        // Statystyki uzupełnienia sekcji opisu. Liczymy po FAKTYCZNYCH
        // sekcjach które wyciągnęliśmy z BL (mapped.product.description_sections),
        // żeby było zgodne z tym co user zobaczy na karcie produktu.
        // total inkrementujemy zawsze — to liczba "candidates" do sekcji.
        const scov = result.sections_coverage!;
        scov.total += 1;
        const sectionTitles = new Set(
          (mapped.product.description_sections ?? []).map(
            (s) => (s as { title?: string }).title ?? ""
          )
        );
        if (sectionTitles.has("Opis")) scov.with_opis += 1;
        if (sectionTitles.has("Wymiary i materiały")) scov.with_wymiary_materialy += 1;
        if (sectionTitles.has("Informacje dla klienta")) scov.with_informacje += 1;

        // Statystyki variants — informuje admina ile produktów ma warianty
        // z BL i jak były sparsowane. Po sync user widzi w panelu czy BL
        // używa czytelnego formatu nazw ("Kolor: Beżowy") czy wpada w
        // brzydkawy fallback ("Wariant: 01 beż drewniany stelaż").
        const vcov = result.variants_coverage!;
        vcov.total += 1;
        if (mapped.parsedVariants.kind === "structured") {
          vcov.with_variants += 1;
          vcov.structured += 1;
          vcov.total_combinations += mapped.parsedVariants.variants.combinations.length;
        } else if (mapped.parsedVariants.kind === "fallback") {
          vcov.with_variants += 1;
          vcov.fallback += 1;
          vcov.total_combinations += mapped.parsedVariants.variants.combinations.length;
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
