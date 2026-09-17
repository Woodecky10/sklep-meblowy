// Krok 3: walidacja tłumaczeń oddanych przez agentów.
//
//   npx tsx scripts/de-translate/validate.mjs [--merge] [--force]
//
// Czyta work/batches/*.json (zadania) i work/out/<ta sama nazwa>.json (wyniki,
// format { "<key>": "<tekst DE>" }). Wypisuje raport na stdout i zapisuje go do
// work/validate-report.json. Kod wyjścia 1 gdy są ERRORY.
//
//   --merge  po walidacji scala wszystkie wyniki do work/de/translations.json
//            (tylko gdy 0 błędów — albo z --force, świadomie).
//   --force  pozwala scalić mimo błędów.
//
// Brak katalogu work/out/ nie jest awarią — skrypt raportuje „brak wyników"
// i kończy się zerem (partie po prostu jeszcze nie wróciły od agentów).
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateUnit } from "./lib.mjs";

const args = process.argv.slice(2);
const MERGE = args.includes("--merge");
const FORCE = args.includes("--force");

const WORK = new URL("./work/", import.meta.url);
const BATCHES = new URL("./batches/", WORK);
const OUT = new URL("./out/", WORK);

function listJson(dirUrl) {
  try {
    return readdirSync(fileURLToPath(dirUrl))
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .sort();
  } catch {
    return null; // katalog nie istnieje
  }
}

const batchFiles = listJson(BATCHES);
if (batchFiles === null || batchFiles.length === 0) {
  console.error("✖ Brak work/batches/*.json — uruchom najpierw batch.mjs");
  process.exit(1);
}

const outFiles = listJson(OUT);
const outSet = new Set(outFiles ?? []);

function readJson(dirUrl, file) {
  return JSON.parse(readFileSync(new URL(`./${file}`, dirUrl), "utf8"));
}

// Najpierw zbieramy WSZYSTKIE wyniki do jednej mapy — wyróżnione słowo slajdu
// bywa w innej partii niż jego tytuł, więc walidacja musi widzieć całość.
const allDe = new Map();
const duplicates = [];
for (const file of outFiles ?? []) {
  let obj;
  try {
    obj = readJson(OUT, file);
  } catch (e) {
    console.error(`✖ work/out/${file}: nie da się sparsować JSON-a — ${e.message}`);
    process.exit(1);
  }
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) {
    console.error(`✖ work/out/${file}: oczekiwano obiektu { "<key>": "<tekst DE>" }`);
    process.exit(1);
  }
  for (const [key, value] of Object.entries(obj)) {
    if (allDe.has(key) && allDe.get(key) !== value) duplicates.push({ key, file });
    allDe.set(key, value);
  }
}

const report = {
  generated_at: new Date().toISOString(),
  batches: [],
  totals: { units: 0, checked: 0, errors: 0, warnings: 0, pending_batches: 0 },
};

for (const file of batchFiles) {
  const batch = readJson(BATCHES, file);
  const units = Array.isArray(batch.units) ? batch.units : [];
  report.totals.units += units.length;

  if (!outSet.has(file)) {
    report.batches.push({ file, status: "pending", units: units.length, issues: [] });
    report.totals.pending_batches += 1;
    continue;
  }

  const out = readJson(OUT, file);
  const issues = [];
  let errors = 0;
  let warnings = 0;

  for (const u of units) {
    const de = Object.hasOwn(out, u.key) ? out[u.key] : undefined;
    const opts = {};
    if (u.kind === "slide_highlight") {
      // Tytuł DE: świeże tłumaczenie z out (po ref.titleKey) albo — gdy tytuł
      // nie szedł do tłumaczenia — DE już zapisane w bazie (ref.titleDe).
      const fromOut = u.ref?.titleKey ? allDe.get(u.ref.titleKey) : undefined;
      opts.titleDe = typeof fromOut === "string" ? fromOut : u.ref?.titleDe;
    }
    const res = validateUnit(u, de, opts);
    report.totals.checked += 1;
    if (res.errors.length > 0 || res.warnings.length > 0) {
      issues.push({
        key: u.key,
        kind: u.kind,
        pl: u.text.length > 120 ? u.text.slice(0, 120) + "…" : u.text,
        de: typeof de === "string" ? (de.length > 120 ? de.slice(0, 120) + "…" : de) : de ?? null,
        errors: res.errors,
        warnings: res.warnings,
      });
      errors += res.errors.length;
      warnings += res.warnings.length;
    }
  }

  // Klucze, których nie ma w partii — agent coś wymyślił albo pomylił plik.
  const known = new Set(units.map((u) => u.key));
  const unknown = Object.keys(out).filter((k) => !known.has(k));
  if (unknown.length > 0) {
    issues.push({
      key: null,
      kind: null,
      errors: [],
      warnings: [`nieznane klucze w wyniku (${unknown.length}): ${unknown.slice(0, 10).join(", ")}`],
    });
    warnings += 1;
  }

  report.batches.push({ file, status: errors > 0 ? "errors" : "ok", units: units.length, errors, warnings, issues });
  report.totals.errors += errors;
  report.totals.warnings += warnings;
}

if (duplicates.length > 0) {
  report.duplicates = duplicates;
  report.totals.warnings += duplicates.length;
}

mkdirSync(WORK, { recursive: true });
writeFileSync(new URL("./validate-report.json", WORK), JSON.stringify(report, null, 2) + "\n", "utf8");

// ── wypis ─────────────────────────────────────────────────────────────────
console.log("\nWalidacja tłumaczeń DE");
if (outFiles === null) {
  console.log("  work/out/ jeszcze nie istnieje — brak wyników do sprawdzenia.");
} else if (outFiles.length === 0) {
  console.log("  work/out/ jest pusty — brak wyników do sprawdzenia.");
}
for (const b of report.batches) {
  if (b.status === "pending") {
    console.log(`  ${b.file.padEnd(16)} OCZEKUJE (${b.units} jedn., brak work/out/${b.file})`);
    continue;
  }
  const mark = b.errors > 0 ? "✖" : b.warnings > 0 ? "!" : "✓";
  console.log(`  ${mark} ${b.file.padEnd(16)} ${b.units} jedn., błędów ${b.errors}, ostrzeżeń ${b.warnings}`);
  for (const i of b.issues) {
    for (const e of i.errors) console.log(`      ✖ [${i.kind ?? "-"} ${i.key ?? ""}] ${e}`);
    for (const w of i.warnings) console.log(`      ! [${i.kind ?? "-"} ${i.key ?? ""}] ${w}`);
  }
}
for (const d of duplicates) {
  console.log(`  ! klucz ${d.key} ma RÓŻNE tłumaczenia w kilku plikach (ostatni wygrywa: ${d.file})`);
}
const t = report.totals;
console.log(
  `\nRazem: ${t.units} jednostek, sprawdzonych ${t.checked}, partii oczekujących ${t.pending_batches}, BŁĘDÓW ${t.errors}, ostrzeżeń ${t.warnings}`
);
console.log("Raport: work/validate-report.json");

// ── scalenie ──────────────────────────────────────────────────────────────
if (MERGE) {
  if (t.errors > 0 && !FORCE) {
    console.log("\n✖ Nie scalam — są błędy. Popraw wyniki albo użyj --merge --force.");
  } else if (allDe.size === 0) {
    console.log("\n✖ Nie scalam — brak jakichkolwiek wyników.");
  } else {
    const merged = {};
    for (const [k, v] of allDe) merged[k] = v;
    mkdirSync(new URL("./de/", WORK), { recursive: true });
    writeFileSync(
      new URL("./de/translations.json", WORK),
      JSON.stringify(merged, null, 2) + "\n",
      "utf8"
    );
    console.log(`\n✓ Scalone ${allDe.size} tłumaczeń → work/de/translations.json`);
  }
}
console.log("");

process.exitCode = t.errors > 0 ? 1 : 0;
