// Krok 1: eksport treści PL z żywej bazy do JSON-ów w scripts/de-translate/work/.
// TYLKO ODCZYT (SELECT) — ten skrypt nigdy nic nie zapisuje do Supabase.
//
//   npx tsx scripts/de-translate/export.mjs [--force] [--force-products]
//
//   --force           eksportuj wszystko, także wiersze z już wypełnionym `_de`
//   --force-products  jak wyżej, ale TYLKO dla produktów (pozostałe tabele
//                     dalej filtrowane po pustym `_de`). Potrzebne, bo 17
//                     produktów ma stare tłumaczenia rozjechane względem
//                     aktualnych sekcji PL i idą do tłumaczenia od nowa.
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  loadEnvLocal,
  normalizeProductSections,
  unitsFromProduct,
  unitsFromMisc,
  dedupeUnits,
  visibleTextSection,
  unitKey,
} from "./lib.mjs";
import {
  VARIANT_OPTION_DE,
  VARIANT_VALUE_DE,
  FEATURE_KEY_DE,
  FEATURE_VALUE_DE,
} from "../../app/_lib/de-content-maps.ts";

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const FORCE_PRODUCTS = FORCE || args.includes("--force-products");

const WORK = new URL("./work/", import.meta.url);
const dir = (rel) => new URL(rel, WORK);

function writeJson(relPath, data) {
  const url = dir(relPath);
  mkdirSync(new URL(".", url), { recursive: true });
  writeFileSync(url, JSON.stringify(data, null, 2) + "\n", "utf8");
  return url;
}

const env = { ...loadEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✖ Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function selectAll(table, columns, order) {
  const q = db.from(table).select(columns);
  if (order) q.order(order);
  const { data, error } = await q;
  if (error) {
    console.error(`✖ ${table}: ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}

const str = (v) => (typeof v === "string" ? v : "");
const nonEmpty = (v) => str(v).trim().length > 0;

// ── produkty ──────────────────────────────────────────────────────────────
const productRows = await selectAll(
  "products",
  "id, name, name_de, is_active, description_sections, description_sections_de, variants, features",
  "name"
);

const hasCompleteDe = (r) =>
  nonEmpty(r.name_de) &&
  Array.isArray(r.description_sections_de) &&
  r.description_sections_de.length > 0;

const productsInScope = productRows.filter((r) => FORCE_PRODUCTS || !hasCompleteDe(r));

const plProducts = productsInScope.map((r) => ({
  id: r.id,
  // products NIE MA kolumny slug — karta produktu żyje pod /produkt/<id>.
  slug: null,
  name: str(r.name),
  is_active: r.is_active === true,
  has_de: hasCompleteDe(r),
  sections: normalizeProductSections(r.description_sections),
}));

// ── pozostałe tabele ──────────────────────────────────────────────────────
const [
  categories,
  collections,
  bundles,
  fabrics,
  fabricPropertyDefs,
  variantInfo,
  homeSlides,
  homeTiles,
  siteTexts,
  pages,
  pageBlocks,
] = await Promise.all([
  selectAll("categories", "id, slug, label, label_de, active", "slug"),
  selectAll("collections", "id, slug, label, label_de, description, description_de", "sort_order"),
  selectAll("bundles", "id, slug, name, name_de, description, description_de", "sort_order"),
  selectAll(
    "fabrics",
    "id, slug, name, name_de, description, description_de, short_info, short_info_de",
    "sort_order"
  ),
  selectAll("fabric_property_defs", "id, code, label, label_de", "sort_order"),
  selectAll("variant_info", "id, option_name, value, info, info_de", "option_name"),
  selectAll(
    "home_slides",
    "id, sort_order, active, title, title_de, subtitle, subtitle_de, eyebrow, eyebrow_de, highlighted_word, highlighted_word_de, cta_primary_label, cta_primary_label_de, cta_secondary_label, cta_secondary_label_de, image_alt, image_alt_de",
    "sort_order"
  ),
  selectAll(
    "home_tiles",
    "id, sort_order, active, label, label_de, description, description_de, image_alt, image_alt_de",
    "sort_order"
  ),
  selectAll("site_texts", "key, value, value_de", "key"),
  selectAll("pages", "id, slug, title, title_de, seo_description, seo_description_de, published", "slug"),
  selectAll("page_blocks", "id, page_id, block_type, sort_order, visible, content", "sort_order"),
]);

// page_blocks dostają slug strony — bez niego ctx dla tłumacza jest bezużyteczny.
const pageSlugById = new Map(pages.map((p) => [p.id, p.slug]));
const pageBlocksWithSlug = pageBlocks.map((b) => ({ ...b, page_slug: pageSlugById.get(b.page_id) ?? null }));

const misc = {
  categories,
  collections,
  bundles,
  fabrics,
  fabric_property_defs: fabricPropertyDefs,
  variant_info: variantInfo,
  home_slides: homeSlides,
  home_tiles: homeTiles,
  site_texts: siteTexts,
  pages,
  page_blocks: pageBlocksWithSlug,
};

// ── mapy kodu (de-content-maps.ts) ────────────────────────────────────────
// Nie mają odpowiednika w bazie — brakujące wpisy trzeba dopisać RĘCZNIE
// w app/_lib/de-content-maps.ts. Eksportujemy tylko te, których jeszcze nie ma.
const missingFrom = (map, values) => {
  const out = [];
  const seen = new Set();
  for (const v of values) {
    const s = str(v).trim();
    if (s === "" || seen.has(s)) continue;
    seen.add(s);
    if (!Object.hasOwn(map, s)) out.push(s);
  }
  return out.sort((a, b) => a.localeCompare(b, "pl"));
};

const optionNames = [];
const optionValues = [];
for (const r of productRows) {
  const options = Array.isArray(r.variants?.options) ? r.variants.options : [];
  for (const o of options) {
    const name = str(o?.name);
    if (name !== "") optionNames.push(name);
    // Wartości opcji „Tkanina"/TKANINA to kody tkanin (MANILA 01…) — nie tłumaczymy.
    if (/tkanin/i.test(name)) continue;
    for (const v of Array.isArray(o?.values) ? o.values : []) {
      if (typeof v === "string") optionValues.push(v);
      else if (v && typeof v === "object" && typeof v.value === "string") optionValues.push(v.value);
    }
  }
}
const featureKeys = [];
const featureValues = [];
for (const r of productRows) {
  for (const f of Array.isArray(r.features) ? r.features : []) {
    if (nonEmpty(f?.key)) featureKeys.push(str(f.key));
    // Wartości zaczynające się cyfrą to wymiary/liczby — przechodzą bez zmian.
    if (nonEmpty(f?.value) && !/^\s*\d/.test(str(f.value))) featureValues.push(str(f.value));
  }
}

const maps = {
  map_variant_option: missingFrom(VARIANT_OPTION_DE, optionNames),
  map_variant_value: missingFrom(VARIANT_VALUE_DE, optionValues),
  map_feature_key: missingFrom(FEATURE_KEY_DE, featureKeys),
  map_feature_value: missingFrom(FEATURE_VALUE_DE, featureValues),
};

const MAP_CTX = {
  map_variant_option: "nazwa opcji wariantu (do mapy VARIANT_OPTION_DE) — zachowaj WIELKOŚĆ LITER oryginału",
  map_variant_value: "wartość opcji wariantu (do mapy VARIANT_VALUE_DE) — zachowaj WIELKOŚĆ LITER oryginału",
  map_feature_key: "nazwa cechy produktu (do mapy FEATURE_KEY_DE)",
  map_feature_value: "wartość cechy produktu (do mapy FEATURE_VALUE_DE)",
};

// ── jednostki ─────────────────────────────────────────────────────────────
const rawUnits = [];
for (const r of productsInScope) rawUnits.push(...unitsFromProduct(r));
rawUnits.push(...unitsFromMisc(misc, { force: FORCE }));
for (const [kind, values] of Object.entries(maps)) {
  for (const text of values) {
    rawUnits.push({ key: unitKey(kind, text), kind, text, ctx: MAP_CTX[kind] });
  }
}
const units = dedupeUnits(rawUnits);

// ── referencja: 17 produktów z gotowym DE (materiał na glosariusz) ────────
// UWAGA: pary PL↔DE mogą być PRZESUNIĘTE — PL było edytowane po tłumaczeniu,
// więc sekcja pod tym samym indeksem nie zawsze mówi o tym samym.
const existingDe = productRows
  .filter(hasCompleteDe)
  .map((r) => {
    const pl = Array.isArray(r.description_sections) ? r.description_sections : [];
    const de = Array.isArray(r.description_sections_de) ? r.description_sections_de : [];
    const sections = [];
    pl.forEach((s, i) => {
      if (s?.kind === "image") return;
      const { title, body } = visibleTextSection(s);
      const d = de[i];
      const dText = d?.kind === "text" ? d : undefined;
      sections.push({
        title,
        body,
        title_de: str(dText?.title),
        body_de: str(dText?.body),
      });
    });
    return { name: str(r.name), name_de: str(r.name_de), sections };
  });

// ── zapis ─────────────────────────────────────────────────────────────────
const files = [
  ["pl/products.json", plProducts],
  ["pl/misc.json", misc],
  ["pl/maps.json", maps],
  ["units.json", units],
  ["reference/existing_de.json", existingDe],
];
for (const [rel, data] of files) writeJson(rel, data);

// ── podsumowanie ──────────────────────────────────────────────────────────
const byKind = new Map();
for (const u of units) {
  const e = byKind.get(u.kind) ?? { n: 0, chars: 0 };
  e.n += 1;
  e.chars += str(u.text).length;
  byKind.set(u.kind, e);
}
const sorted = Array.from(byKind.entries()).sort((a, b) => b[1].chars - a[1].chars);
const totalChars = sorted.reduce((s, [, e]) => s + e.chars, 0);

console.log(`\nEksport DE — tryb: ${FORCE ? "--force (WSZYSTKO)" : FORCE_PRODUCTS ? "--force-products" : "tylko puste _de"}`);
console.log(`produkty w bazie: ${productRows.length}, z kompletem DE: ${productRows.filter(hasCompleteDe).length}, do tłumaczenia: ${productsInScope.length}`);
console.log("\njednostki per kind:");
console.log("  kind                      szt.      znaki");
for (const [kind, e] of sorted) {
  console.log(`  ${kind.padEnd(24)} ${String(e.n).padStart(5)} ${String(e.chars).padStart(10)}`);
}
console.log(`  ${"RAZEM".padEnd(24)} ${String(units.length).padStart(5)} ${String(totalChars).padStart(10)}`);
console.log("\npliki:");
for (const [rel] of files) console.log(`  work/${rel}`);
console.log("");
