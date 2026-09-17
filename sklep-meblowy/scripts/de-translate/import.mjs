// Krok 4: zapis tłumaczeń DE do bazy. DOMYŚLNIE DRY-RUN — bez --apply nic nie
// dotyka Supabase (poza SELECT-ami).
//
//   npx tsx scripts/de-translate/import.mjs [--apply] [--only=products,misc,blocks]
//                                           [--force] [--force-products]
//                                           [--ids=<uuid,uuid>] [--sample=3]
//
//   --apply           faktycznie zapisuje (bez tego tylko raport)
//   --only            ogranicza zakres: products | misc | blocks (po przecinku)
//   --force           nadpisuje także niepuste `_de` we wszystkich tabelach
//   --force-products  jak --force, ale TYLKO dla produktów
//   --ids             ogranicza produkty do podanych id
//   --sample=N        w dry-run wypisuje pełny złożony JSON N pierwszych produktów
//
// ŚWIEŻE DANE: skrypt NIE ufa work/pl/*.json (ktoś mógł w międzyczasie edytować
// treść w adminie) — pobiera wiersze z bazy w chwili uruchomienia i liczy klucze
// tłumaczeń z AKTUALNYCH tekstów PL. Tekst zmieniony po eksporcie = brak klucza
// = produkt pominięty z raportem, zamiast cichego zapisania nieaktualnego DE.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  loadEnvLocal,
  unitKey,
  lookupTranslation,
  assembleDeSections,
  missingProductKeys,
  mergeBlockContentDe,
} from "./lib.mjs";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const FORCE = args.includes("--force");
const FORCE_PRODUCTS = FORCE || args.includes("--force-products");
const strArg = (name) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
};
const ONLY = (strArg("only") ?? "products,misc,blocks")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const IDS = strArg("ids")
  ? new Set(
      strArg("ids")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    )
  : null;
const SAMPLE = Number(strArg("sample") ?? 0) || 0;

const str = (v) => (typeof v === "string" ? v : "");
const nonEmpty = (v) => str(v).trim().length > 0;

const WORK = new URL("./work/", import.meta.url);
let translations;
try {
  translations = JSON.parse(readFileSync(new URL("./de/translations.json", WORK), "utf8"));
} catch {
  console.log("\nBrak work/de/translations.json — nie ma czego importować.");
  console.log("Uruchom: export.mjs → batch.mjs → (tłumaczenie) → validate.mjs --merge\n");
  process.exit(0);
}
const tr = (kind, text) => (nonEmpty(text) ? lookupTranslation(translations, unitKey(kind, text)) : undefined);

const env = { ...loadEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("✖ Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w .env.local");
  process.exit(1);
}
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

async function selectAll(table, columns) {
  const { data, error } = await db.from(table).select(columns);
  if (error) {
    console.error(`✖ ${table}: ${error.message}`);
    process.exit(1);
  }
  return data ?? [];
}

async function applyUpdate(table, idCol, id, patch) {
  if (!APPLY) return true;
  const { error } = await db.from(table).update(patch).eq(idCol, id);
  if (error) {
    console.error(`  ✖ ${table}[${id}]: ${error.message}`);
    return false;
  }
  return true;
}

console.log(`\nImport DE — tryb: ${APPLY ? "APPLY (ZAPIS DO PRODUKCJI)" : "DRY-RUN (nic nie zapisuję)"}`);
console.log(`zakres: ${ONLY.join(", ")}${FORCE ? " | --force" : FORCE_PRODUCTS ? " | --force-products" : ""}${IDS ? ` | ids: ${IDS.size}` : ""}`);
console.log(`tłumaczeń w słowniku: ${Object.keys(translations).length}`);

const verify = []; // [{ co, przed, po }]

// ── produkty ──────────────────────────────────────────────────────────────
let productRows = [];
if (ONLY.includes("products")) {
  productRows = await selectAll("products", "id, name, name_de, description_sections, description_sections_de");
  const hasCompleteDe = (r) =>
    nonEmpty(r.name_de) && Array.isArray(r.description_sections_de) && r.description_sections_de.length > 0;

  const scope = productRows
    .filter((r) => (IDS ? IDS.has(r.id) : true))
    .filter((r) => FORCE_PRODUCTS || !hasCompleteDe(r));

  const ready = [];
  const skipped = [];
  for (const r of scope) {
    const missing = missingProductKeys(r, translations);
    if (missing.length > 0) {
      skipped.push({ id: r.id, name: str(r.name), missing });
      continue;
    }
    ready.push({
      id: r.id,
      name: str(r.name),
      patch: {
        name_de: tr("product_name", str(r.name)) ?? "",
        description_sections_de: assembleDeSections(r.description_sections, translations),
      },
    });
  }

  console.log(`\nPRODUKTY: w bazie ${productRows.length}, w zakresie ${scope.length}, gotowych do zapisu ${ready.length}, pominiętych (niekomplet) ${skipped.length}`);
  if (skipped.length > 0) {
    const show = skipped.slice(0, 10);
    for (const s of show) {
      const kinds = s.missing.map((m) => `${m.kind}:${m.key}`).slice(0, 4).join(", ");
      console.log(`  - ${s.name || s.id}: brak ${s.missing.length} tłum. (${kinds}${s.missing.length > 4 ? ", …" : ""})`);
    }
    if (skipped.length > show.length) console.log(`  … i ${skipped.length - show.length} więcej (pełna lista: użyj --sample lub sprawdź ręcznie)`);
  }

  if (!APPLY && SAMPLE > 0) {
    console.log(`\nPODGLĄD ${Math.min(SAMPLE, ready.length)} pierwszych produktów:`);
    for (const p of ready.slice(0, SAMPLE)) {
      console.log(`--- ${p.name} (${p.id}) ---`);
      console.log(JSON.stringify(p.patch, null, 2));
    }
  }

  const before = {
    name_de: productRows.filter((r) => nonEmpty(r.name_de)).length,
    sections_de: productRows.filter(
      (r) => Array.isArray(r.description_sections_de) && r.description_sections_de.length > 0
    ).length,
  };
  let written = 0;
  if (APPLY) {
    for (const p of ready) {
      if (await applyUpdate("products", "id", p.id, p.patch)) written += 1;
    }
    console.log(`  zapisano ${written}/${ready.length} produktów`);
    const after = await selectAll("products", "id, name_de, description_sections_de");
    verify.push({
      co: "products.name_de",
      przed: before.name_de,
      po: after.filter((r) => nonEmpty(r.name_de)).length,
    });
    verify.push({
      co: "products.description_sections_de",
      przed: before.sections_de,
      po: after.filter((r) => Array.isArray(r.description_sections_de) && r.description_sections_de.length > 0)
        .length,
    });
  }
}

// ── pozostałe tabele z kolumnami _de ──────────────────────────────────────
// [tabela, kolumna-klucz, [[kolumnaPL, kolumnaDE, kind], …]]
const MISC_TABLES = [
  ["categories", "id", [["label", "label_de", "category_label"]]],
  [
    "collections",
    "id",
    [
      ["label", "label_de", "collection_label"],
      ["description", "description_de", "collection_description"],
    ],
  ],
  ["bundles", "id", [["name", "name_de", "bundle_name"]]],
  [
    "fabrics",
    "id",
    [
      ["description", "description_de", "fabric_description"],
      ["short_info", "short_info_de", "fabric_short_info"],
    ],
  ],
  ["fabric_property_defs", "id", [["label", "label_de", "fabric_property_label"]]],
  ["variant_info", "id", [["info", "info_de", "variant_info"]]],
  [
    "home_slides",
    "id",
    [
      ["title", "title_de", "slide_title"],
      ["subtitle", "subtitle_de", "slide_subtitle"],
      ["eyebrow", "eyebrow_de", "slide_eyebrow"],
      ["highlighted_word", "highlighted_word_de", "slide_highlight"],
      ["cta_primary_label", "cta_primary_label_de", "slide_cta"],
      ["cta_secondary_label", "cta_secondary_label_de", "slide_cta"],
      ["image_alt", "image_alt_de", "slide_alt"],
    ],
  ],
  [
    "home_tiles",
    "id",
    [
      ["label", "label_de", "tile_label"],
      ["description", "description_de", "tile_description"],
      ["image_alt", "image_alt_de", "tile_alt"],
    ],
  ],
  ["site_texts", "key", [["value", "value_de", "site_text"]]],
  [
    "pages",
    "id",
    [
      ["title", "title_de", "page_title"],
      ["seo_description", "seo_description_de", "page_seo"],
    ],
  ],
];

if (ONLY.includes("misc")) {
  console.log("\nPOZOSTAŁE TABELE:");
  for (const [table, idCol, pairs] of MISC_TABLES) {
    const cols = [idCol, ...pairs.flatMap(([pl, de]) => [pl, de])];
    const rows = await selectAll(table, Array.from(new Set(cols)).join(", "));
    const before = new Map(pairs.map(([, de]) => [de, rows.filter((r) => nonEmpty(r[de])).length]));

    const updates = [];
    for (const r of rows) {
      const patch = {};
      for (const [plCol, deCol, kind] of pairs) {
        if (!nonEmpty(r[plCol])) continue;
        if (!FORCE && nonEmpty(r[deCol])) continue;
        const de = tr(kind, str(r[plCol]));
        if (!nonEmpty(de)) continue;
        patch[deCol] = de;
      }
      if (Object.keys(patch).length > 0) updates.push({ id: r[idCol], patch });
    }

    let written = 0;
    if (APPLY) {
      for (const u of updates) {
        if (await applyUpdate(table, idCol, u.id, u.patch)) written += 1;
      }
    }
    const fields = updates.reduce((s, u) => s + Object.keys(u.patch).length, 0);
    console.log(
      `  ${table.padEnd(22)} wierszy ${String(rows.length).padStart(4)}  do aktualizacji ${String(updates.length).padStart(4)} (${fields} pól)${APPLY ? `  zapisano ${written}` : ""}`
    );

    if (APPLY) {
      const after = await selectAll(table, Array.from(new Set(cols)).join(", "));
      for (const [, deCol] of pairs) {
        verify.push({
          co: `${table}.${deCol}`,
          przed: before.get(deCol) ?? 0,
          po: after.filter((r) => nonEmpty(r[deCol])).length,
        });
      }
    }
  }
}

// ── page_blocks (JSONB read-modify-write) ────────────────────────────────
const BLOCK_FIELDS = [
  ["heading", "block_heading"],
  ["subheading", "block_subheading"],
  ["body", "block_body"],
  ["cta_label", "block_cta"],
];
const ITEM_FIELDS = [
  ["question", "faq_question"],
  ["answer", "faq_answer"],
  ["quote", "review_quote"],
];

function countBlockDe(rows) {
  let n = 0;
  for (const r of rows) {
    const c = r.content ?? {};
    for (const [f] of BLOCK_FIELDS) if (nonEmpty(c[`${f}_de`])) n += 1;
    for (const it of Array.isArray(c.items) ? c.items : []) {
      for (const [f] of ITEM_FIELDS) if (nonEmpty(it?.[`${f}_de`])) n += 1;
    }
  }
  return n;
}

if (ONLY.includes("blocks")) {
  const rows = await selectAll("page_blocks", "id, page_id, block_type, content");
  const before = countBlockDe(rows);
  const updates = [];
  for (const r of rows) {
    const c = r.content ?? {};
    const de = {};
    for (const [field, kind] of BLOCK_FIELDS) {
      const v = tr(kind, str(c[field]));
      if (nonEmpty(v)) de[field] = v;
    }
    if (Array.isArray(c.items)) {
      de.items = c.items.map((it) => {
        const d = {};
        for (const [field, kind] of ITEM_FIELDS) {
          const v = tr(kind, str(it?.[field]));
          if (nonEmpty(v)) d[field] = v;
        }
        return d;
      });
    }
    const merged = mergeBlockContentDe(c, de, { force: FORCE });
    if (JSON.stringify(merged) !== JSON.stringify(c)) updates.push({ id: r.id, content: merged });
  }

  let written = 0;
  if (APPLY) {
    for (const u of updates) {
      if (await applyUpdate("page_blocks", "id", u.id, { content: u.content })) written += 1;
    }
  }
  console.log(
    `\nBLOKI STRON: wierszy ${rows.length}, do aktualizacji ${updates.length}${APPLY ? `, zapisano ${written}` : ""}`
  );
  if (APPLY) {
    const after = await selectAll("page_blocks", "id, content");
    verify.push({ co: "page_blocks.content.*_de (pól)", przed: before, po: countBlockDe(after) });
  }
}

// ── tabela weryfikacyjna ──────────────────────────────────────────────────
if (APPLY && verify.length > 0) {
  console.log("\nWERYFIKACJA (wypełnione `_de`):");
  console.log(`  ${"tabela.kolumna".padEnd(36)} przed    po`);
  for (const v of verify) {
    console.log(`  ${v.co.padEnd(36)} ${String(v.przed).padStart(5)} ${String(v.po).padStart(5)}`);
  }
}
if (!APPLY) console.log("\nDRY-RUN — nic nie zapisano. Dodaj --apply, żeby wykonać zapis.");
console.log("");
