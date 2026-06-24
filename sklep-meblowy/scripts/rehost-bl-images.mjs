// scripts/rehost-bl-images.mjs
// Jednorazowa migracja: obrazy z cdn.baselinker.com -> bucket "products".
// Uruchom (z katalogu sklep-meblowy/):
//   node --env-file=.env.local scripts/rehost-bl-images.mjs           (dry-run, tylko odczyt)
//   node --env-file=.env.local scripts/rehost-bl-images.mjs --live    (upload + zapis do DB)
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const LIVE = process.argv.includes("--live");
const BL_HOST = "cdn.baselinker.com";
const BUCKET = "products";
const EXT_BY_MIME = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w env (uruchom z --env-file=.env.local)."
  );
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

const isBl = (u) => typeof u === "string" && u.includes(BL_HOST);

// Wszystkie unikalne BL-URL-e produktu: images[] + variants.combinations[].images[].
function collectBlUrls(product) {
  const urls = new Set();
  for (const u of product.images ?? []) if (isBl(u)) urls.add(u);
  for (const c of product.variants?.combinations ?? []) {
    for (const u of c.images ?? []) if (isBl(u)) urls.add(u);
  }
  return [...urls];
}

// Pobiera obraz z BL CDN i uploaduje do bucketu; zwraca nowy publiczny URL.
async function rehostOne(oldUrl) {
  const res = await fetch(oldUrl);
  if (!res.ok) throw new Error(`fetch ${res.status} dla ${oldUrl}`);
  const mime = (res.headers.get("content-type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  const ext = EXT_BY_MIME[mime];
  if (!ext) throw new Error(`nieobslugiwany content-type "${mime}" dla ${oldUrl}`);
  const buf = Buffer.from(await res.arrayBuffer());
  const path = `${Date.now()}-${randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, buf, { contentType: mime, cacheControl: "3600", upsert: false });
  if (error) throw new Error(`upload: ${error.message}`);
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

// Podmienia URL-e w images[] i variants wg mapy stary->nowy (tylko zmienione).
function applyMap(product, map) {
  const images = (product.images ?? []).map((u) => map.get(u) ?? u);
  let variants = product.variants;
  if (variants?.combinations) {
    variants = {
      ...variants,
      combinations: variants.combinations.map((c) => ({
        ...c,
        images: (c.images ?? []).map((u) => map.get(u) ?? u),
      })),
    };
  }
  return { images, variants };
}

async function main() {
  console.log(
    LIVE
      ? "=== TRYB LIVE (upload + zapis) ==="
      : "=== DRY-RUN (tylko odczyt, nic nie zapisuje) ==="
  );
  const { data: products, error } = await supabase
    .from("products")
    .select("id, name, images, variants");
  if (error) {
    console.error("select products:", error.message);
    process.exit(1);
  }

  const candidates = products.filter((p) => collectBlUrls(p).length > 0);
  let totalUrls = 0;
  let okProducts = 0;
  const failed = [];

  for (const p of candidates) {
    const blUrls = collectBlUrls(p);
    totalUrls += blUrls.length;
    console.log(`\n[${p.id}] ${p.name} — ${blUrls.length} URL(i) BL`);
    if (!LIVE) {
      for (const u of blUrls) console.log(`   migruj: ${u}`);
      continue;
    }
    try {
      const map = new Map();
      for (const u of blUrls) {
        const nu = await rehostOne(u);
        map.set(u, nu);
        console.log(`   OK: ${u}\n     -> ${nu}`);
      }
      const { images, variants } = applyMap(p, map);
      const { error: upErr } = await supabase
        .from("products")
        .update({ images, variants })
        .eq("id", p.id);
      if (upErr) throw new Error(`update: ${upErr.message}`);
      okProducts++;
    } catch (e) {
      console.error(`   x POMINIETO produkt (bez zapisu): ${e.message}`);
      failed.push({ id: p.id, name: p.name, error: e.message });
    }
  }

  console.log(`\n=== Podsumowanie ===`);
  console.log(
    `Kandydaci (produkty z obrazami BL): ${candidates.length}, URL-e BL: ${totalUrls}`
  );
  if (LIVE) {
    console.log(`Zmigrowane produkty: ${okProducts}`);
    if (failed.length) {
      console.log(`NIEUDANE (${failed.length}) — wymagaja recznej uwagi:`);
      for (const f of failed) console.log(`  - ${f.id} ${f.name}: ${f.error}`);
      process.exitCode = 1;
    }
  } else {
    console.log("To byl dry-run — nic nie zapisano. Uruchom z --live, by wykonac.");
  }
}

main().catch((e) => {
  console.error("Blad krytyczny:", e);
  process.exit(1);
});
