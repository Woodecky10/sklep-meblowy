# Przehostowanie obrazów z CDN BaseLinkera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (INLINE — ten plan mutuje dane produkcyjne i ma checkpointy ludzkie; NIE delegować kroków run do subagentów). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Przenieść obrazy 15 produktów z `*.cdn.baselinker.com` do własnego bucketu Supabase `products`, podmienić URL-e w bazie, i usunąć hosty BL z `next.config.ts` — zanim konto BaseLinker zostanie zamknięte.

**Architecture:** Jednorazowy skrypt ESM `scripts/rehost-bl-images.mjs` (Node 24, `@supabase/supabase-js`, globalny `fetch`, service-role z `.env.local`). Dry-run domyślnie, `--live` zapisuje. Idempotentny (rusza tylko URL-e `cdn.baselinker.com`), per-produkt fail-safe. Po migracji — usunięcie hostów z `next.config.ts`.

**Tech Stack:** Node v24, `@supabase/supabase-js` ^2.103, `node --env-file=.env.local` (bez tsx/dotenv — brak nowych zależności).

**Spec:** `docs/superpowers/specs/2026-06-24-rehost-bl-images-design.md`

## Global Constraints

- **Skrypt to ESM `.mjs`** uruchamiany `node --env-file=.env.local scripts/rehost-bl-images.mjs` (Node ≥20.6 — mamy v24). Bez nowych zależności (`@supabase/supabase-js` już jest; `fetch`/`crypto` natywne).
- **Rusza WYŁĄCZNIE URL-e zawierające `cdn.baselinker.com`** — inne hosty (Unsplash itp.) nietknięte. Idempotentny (re-run po sukcesie = 0 zmian).
- **Per-produkt fail-safe:** błąd fetchu/uploadu któregokolwiek URL-a danego produktu → produkt POMIJANY bez zapisu (nie zostawiamy wiersza z mieszanką starych/nowych URL-i); logowany do listy nieudanych. Reszta leci dalej.
- **Dry-run najpierw, zawsze.** `--live` tylko za wyraźnym OK właściciela. Live odpala właściciel albo Claude za wyraźnym OK.
- **Bucket `products`**, ścieżka `${Date.now()}-${randomUUID()}.${ext}` (jak `uploadProductImage` w `app/admin/produkty/actions.ts`).
- **Obrazy w `products.images[]` ORAZ `products.variants.combinations[].images[]`** — oba muszą być podmienione.
- **PILNE:** wykonać przed zamknięciem konta BL (póki CDN BL serwuje obrazy).
- Branch `chore/rehost-bl-images` (z main, spec scommitowany). Push/PR osobno, za zgodą (konto Woodecky10).

## File Structure

- **Create** `scripts/rehost-bl-images.mjs` — cała logika migracji (dry-run/live).
- **Modify** `next.config.ts` — usunięcie hostów `*.cdn.baselinker.com` + komentarza z `remotePatterns` (po udanej migracji).

---

### Task 1: Skrypt migracyjny `scripts/rehost-bl-images.mjs`

**Files:**
- Create: `scripts/rehost-bl-images.mjs`

**Interfaces:**
- Consumes: env `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (z `.env.local`); tabela `products` (kolumny `id,name,images,variants`); bucket `products`.
- Produces: skrypt CLI; tryb dry-run (domyślny, tylko odczyt) i `--live` (upload + update).

- [ ] **Step 1: Utwórz katalog i skrypt**

```js
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
  console.error("Brak NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY w env (uruchom z --env-file=.env.local).");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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
  const mime = (res.headers.get("content-type") || "").split(";")[0].trim().toLowerCase();
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
  console.log(LIVE ? "=== TRYB LIVE (upload + zapis) ===" : "=== DRY-RUN (tylko odczyt, nic nie zapisuje) ===");
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
      const { error: upErr } = await supabase.from("products").update({ images, variants }).eq("id", p.id);
      if (upErr) throw new Error(`update: ${upErr.message}`);
      okProducts++;
    } catch (e) {
      console.error(`   x POMINIETO produkt (bez zapisu): ${e.message}`);
      failed.push({ id: p.id, name: p.name, error: e.message });
    }
  }

  console.log(`\n=== Podsumowanie ===`);
  console.log(`Kandydaci (produkty z obrazami BL): ${candidates.length}, URL-e BL: ${totalUrls}`);
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
```

- [ ] **Step 2: Sanity — składnia + bramki projektu**

Run (z `sklep-meblowy/`): `node --check scripts/rehost-bl-images.mjs` → bez błędów.
Run: `npm run lint` → 0. Jeśli eslint zaczyna lintować `scripts/` i zgłasza błędy (np. `no-console`, env globals), dodaj `scripts/` do `ignores` w `eslint.config.*` (jednorazowy skrypt nie podlega regułom appki).
Run: `npx tsc --noEmit` → 0 (skrypt `.mjs` jest poza `tsconfig` include — nie powinien wpływać; potwierdź).

- [ ] **Step 3: Commit**

```bash
git add scripts/rehost-bl-images.mjs
git commit -m "chore(bl): skrypt jednorazowej migracji obrazow BL CDN -> storage (dry-run/live)"
```
(Jeśli był potrzebny `ignores` w eslint config — dodaj ten plik do commita.)

---

### Task 2: Dry-run + przegląd (CHECKPOINT)

**Files:** brak zmian. Krok operacyjny (tylko odczyt z produkcji).

- [ ] **Step 1: Uruchom dry-run**

Run (z `sklep-meblowy/`): `node --env-file=.env.local scripts/rehost-bl-images.mjs`
Expected: lista produktów (powinno być ~15, zgodnie z wcześniejszym SQL-em) + dla każdego liczba i lista URL-i `cdn.baselinker.com`. Podsumowanie: „Kandydaci: N, URL-e BL: M". Nic nie zapisane.

- [ ] **Step 2: Przegląd**

Sprawdź: liczba kandydatów ≈ 15 (zgodna z SQL-em); URL-e to faktycznie `cdn.baselinker.com`; brak nieoczekiwanych produktów. **To bramka — przed Task 3 wymagane wyraźne OK właściciela na `--live`.**

---

### Task 3: Live run + weryfikacja (za wyraźnym OK)

**Files:** brak zmian w repo. Migracja danych produkcyjnych (storage + tabela `products`).

- [ ] **Step 1: Uruchom live (po OK)**

Run: `node --env-file=.env.local scripts/rehost-bl-images.mjs --live`
Expected: dla każdego produktu logi `OK: <stary> -> <nowy>`; podsumowanie „Zmigrowane produkty: N". Jeśli sekcja „NIEUDANE" niepusta — zanotuj te produkty (exit code 1); zaadresuj ręcznie (np. ponowny run — idempotentny — albo ręczny upload w adminie).

- [ ] **Step 2: Kontrolny SQL (Supabase)**

```sql
select count(*) from public.products
where images::text ilike '%cdn.baselinker.com%'
   or variants::text ilike '%cdn.baselinker.com%';
```
Expected: **0**. (Jeśli > 0 — to produkty z listy „NIEUDANE"; powtórz live run lub obsłuż ręcznie aż do 0.)

- [ ] **Step 3: Spot-check**

`npm run dev` (lub na deployu) → otwórz 2-3 z migrowanych produktów (np. narożnik VEGAS, łóżko Marbella) → obrazy ładują się z domeny Supabase (nie `cdn.baselinker.com`). Sprawdź też produkt z wariantami (galeria wariantu).

---

### Task 4: Usuń hosty BL z `next.config.ts` + bramki

Dopiero gdy kontrolny SQL = 0 (żaden produkt nie używa już CDN BL).

**Files:**
- Modify: `next.config.ts` (`remotePatterns` ~linie 8-10)

- [ ] **Step 1: Usuń hosty + komentarz**

W `next.config.ts`, w tablicy `remotePatterns`, usuń wpisy hostów BaseLinkera oraz komentarz nad nimi:
```ts
      // Legacy CDN obrazów (stare produkty z dawnego importu) — do audytu i ewentualnego usunięcia, gdy żaden produkt nie używa już tych hostów.
      { protocol: "https", hostname: "upload.cdn.baselinker.com" },
      { protocol: "https", hostname: "*.cdn.baselinker.com" },
```
(Pozostałe `remotePatterns` — Supabase storage, Unsplash itp. — zostają. Zachowaj poprawną składnię tablicy: brak wiszących przecinków/nawiasów.)

- [ ] **Step 2: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.
Run: `grep -rniI baselinker .` (poza node_modules/.git/.next, docs i historycznymi migracjami) → brak trafień w kodzie/configu aplikacji (dopuszczalne tylko docs/historia; `.env.local` gitignored).

- [ ] **Step 3: Commit**

```bash
git add next.config.ts
git commit -m "chore(bl): usun hosty *.cdn.baselinker.com z next.config (obrazy przehostowane)"
```

---

### Task 5: Domknięcie

- [ ] **Step 1: Pełne bramki**

Run (z `sklep-meblowy/`): `npx tsc --noEmit` (0) · `npm run lint` (0) · `npm test` (zielony) · `npm run build` (przechodzi).

- [ ] **Step 2: PR**

Push `chore/rehost-bl-images` + PR (konto Woodecky10, za zgodą). W opisie: migracja N produktów (obrazy BL CDN → storage), kontrolny SQL = 0, hosty BL usunięte z next.config. Skrypt `scripts/rehost-bl-images.mjs` zostaje w repo jako ślad (idempotentny, nieszkodliwy).

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:** skrypt dry-run/live (T1), obsługa `images`+`variants` (T1 `collectBlUrls`/`applyMap`), tylko `cdn.baselinker.com` (T1 `isBl`), per-produkt fail-safe (T1 try/catch + `failed`), bucket/ścieżka jak w actions.ts (T1), dry-run-najpierw + checkpoint (T2), live + kontrolny SQL=0 + spot-check (T3), usunięcie hostów next.config (T4), branch/PR (T5). Pokryte.

**Placeholder scan:** pełny kod skryptu w T1 (bez TBD), realne komendy run, dokładny SQL, konkretny edit next.config. Uwaga o eslint `ignores` jest warunkowa z konkretną akcją.

**Type consistency:** `collectBlUrls(product):string[]`, `rehostOne(oldUrl):Promise<string>`, `applyMap(product,map):{images,variants}` — spójne w T1. Env i bucket spójne z .env.local (nazwy potwierdzone) i actions.ts.

## Execution Handoff

Plan zapisany w `docs/superpowers/plans/2026-06-24-rehost-bl-images.md`. **Rekomendacja: wykonanie INLINE** (executing-plans) — kroki Task 2/3 mutują dane produkcyjne i mają checkpointy (dry-run → OK → live), nie nadają się do delegowania subagentom. Subagent-driven niewskazane dla tego planu.
