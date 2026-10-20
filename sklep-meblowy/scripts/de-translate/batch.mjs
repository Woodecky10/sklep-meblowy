// Krok 2: podział jednostek z work/units.json na partie do rozdania agentom.
//
//   npx tsx scripts/de-translate/batch.mjs [--limit-products=25000]
//                                          [--limit-fabrics=30000]
//                                          [--limit-misc=45000]
//
// Wynik: work/batches/<grupa>-NN.json = { group, index, units: [...] }
//        work/batches/index.json      = spis wszystkich partii
//
// Katalog work/batches/ jest CZYSZCZONY na starcie — inaczej po zmianie
// eksportu zostałyby stare partie i agent tłumaczyłby nieistniejące teksty.
import { mkdirSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { packBatches } from "./lib.mjs";

const args = process.argv.slice(2);
const numArg = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  if (!hit) return def;
  const n = Number(hit.split("=")[1]);
  return Number.isFinite(n) && n > 0 ? n : def;
};

const LIMITS = {
  products: numArg("limit-products", 25000),
  fabrics: numArg("limit-fabrics", 30000),
  misc: numArg("limit-misc", 45000),
};

// Podział na grupy wg rodzaju jednostki. Grupy tłumaczy się osobno, bo mają
// inny charakter: produkty = długi HTML, tkaniny = opisy marketingowe,
// misc = krótkie etykiety UI (najbardziej wrażliwe na spójność).
const PRODUCT_KINDS = new Set(["product_name", "section_title", "section_body", "image_alt", "caption"]);
const FABRIC_KINDS = new Set(["fabric_description", "fabric_short_info"]);

const WORK = new URL("./work/", import.meta.url);
const BATCHES = new URL("./batches/", WORK);

let units;
try {
  units = JSON.parse(readFileSync(new URL("./units.json", WORK), "utf8"));
} catch {
  console.error("✖ Brak work/units.json — uruchom najpierw export.mjs");
  process.exit(1);
}

const groups = { products: [], fabrics: [], misc: [] };
for (const u of units) {
  if (PRODUCT_KINDS.has(u.kind)) groups.products.push(u);
  else if (FABRIC_KINDS.has(u.kind)) groups.fabrics.push(u);
  else groups.misc.push(u);
}

// Slajdy hero MUSZĄ wylądować w jednej partii: wyróżnione słowo jest walidowane
// przeciwko przetłumaczonemu tytułowi TEGO SAMEGO slajdu, więc rozbicie ich na
// dwóch agentów niemal gwarantuje niespójność. Wypychamy je na początek grupy.
groups.misc.sort((a, b) => {
  const sa = a.kind.startsWith("slide_") ? 0 : 1;
  const sb = b.kind.startsWith("slide_") ? 0 : 1;
  return sa - sb;
});

rmSync(BATCHES, { recursive: true, force: true });
mkdirSync(BATCHES, { recursive: true });

const index = { generated_at: new Date().toISOString(), limits: LIMITS, groups: {} };

for (const [group, list] of Object.entries(groups)) {
  const batches = packBatches(list, LIMITS[group]);
  const entries = [];
  batches.forEach((batchUnits, i) => {
    const no = String(i + 1).padStart(2, "0");
    const file = `${group}-${no}.json`;
    const payload = {
      group,
      index: i + 1,
      units: batchUnits.map((u) => {
        const out = { key: u.key, kind: u.kind };
        if (u.ctx) out.ctx = u.ctx;
        if (u.ref) out.ref = u.ref;
        out.text = u.text;
        return out;
      }),
    };
    writeFileSync(new URL(`./${file}`, BATCHES), JSON.stringify(payload, null, 2) + "\n", "utf8");
    entries.push({
      file,
      index: i + 1,
      units: batchUnits.length,
      chars: batchUnits.reduce((s, u) => s + (u.text?.length ?? 0), 0),
      out: `work/out/${file}`,
    });
  });
  index.groups[group] = { limit: LIMITS[group], units: list.length, batches: entries };
}

writeFileSync(new URL("./index.json", BATCHES), JSON.stringify(index, null, 2) + "\n", "utf8");

console.log("\nPartie (work/batches/):");
for (const [group, info] of Object.entries(index.groups)) {
  console.log(`  ${group.padEnd(10)} limit ${String(info.limit).padStart(6)} zn.  jednostek ${String(info.units).padStart(5)}  partii ${info.batches.length}`);
  for (const b of info.batches) {
    console.log(`     ${b.file.padEnd(16)} ${String(b.units).padStart(5)} jedn. ${String(b.chars).padStart(8)} zn.`);
  }
}
console.log("\nAgent zapisuje wynik do work/out/<ta sama nazwa>.json w formacie { \"<key>\": \"<tekst DE>\" }\n");
