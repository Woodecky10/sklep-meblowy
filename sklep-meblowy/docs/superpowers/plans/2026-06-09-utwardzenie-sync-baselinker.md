# Utwardzenie synchronizacji BaseLinker — Implementation Plan (rewizja 2026-06-09)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** „Chudy" sync BaseLinker (nazwa/cena/kategoria/zdjęcia/cechy — bez opisów i wariantów, które są zarządzane ręcznie w panelu) + utwardzenie: odwracalne auto-ukrywanie produktów znikłych z BL, retry odczytów, czytelna kategoryzacja błędów, ręczny toggle Ukryj/Przywróć.

**Architecture:** Podejście chirurgiczne w `syncProductsFromBaseLinker`. `mapBlToProduct` pomija `variants`/`description_sections`/`description` w budowanym obiekcie → `upsert(onConflict)` nie nadpisuje ich na UPDATE (ręczne edycje zachowane), a na INSERT lecą defaulty DB. Martwy po tej zmianie parser wariantów/sekcji + paski pokrycia w panelu są usuwane. Destrukcyjny krok ukrywania wydzielony jako czysta funkcja `planDeactivations` z bezpiecznikami. Widoczność egzekwowana w RLS (kolumna `is_active`).

**Tech Stack:** Next.js 16.2.4 (App Router, RSC), React 19.2.4, TypeScript 5, Supabase (Postgres + RLS), Vitest (nowy, env `node`), `vite-tsconfig-paths`.

---

## Pre-flight (przeczytaj raz przed startem)

- **Branch:** zostajemy na bieżącej `feat/admin-delete-and-filters`. NIE twórz worktree.
- **Spec źródłowy:** `docs/superpowers/specs/2026-06-07-utwardzenie-sync-baselinker-design.md` z callout-em **„Rewizja 2026-06-09"** (ma pierwszeństwo). Najważniejsze: opisy + warianty WYCHODZĄ z syncu (ręczne w panelu), utwardzenie ZOSTAJE.
- **Migracje stosuje ręcznie Mikołaj** w panelu Supabase (jak 12-17). Pliki SQL to artefakty — `npm run build`/`npm test` ich nie wykonują. Runtime sync/admin produkty zadziałają dopiero po zaaplikowaniu migracji 23 (Task 1) i 24 (Task 12).
- **Konwencje repo:**
  - Migracje: `NN_nazwa.sql`, idempotentne (`add column if not exists`, `drop policy if exists`), nagłówek w ramce `-- ====`. Ostatnia istniejąca = `22`; `23` i `24` wolne (numery 20, 21 nie istnieją — luka OK).
  - Wzorzec admina w RLS: **`auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`** (rola realnie w `app_metadata`; `isAdmin` w `app/_lib/admin.ts:11`).
  - Server action: plik z `"use server"`, każda funkcja zaczyna `await requireAdmin()`, mutacje przez `createAdminClient()`, na końcu `revalidatePath(...)`, zwrot `ActionResult = {ok:true,message?} | {ok:false,error}`.
- **Weryfikacja po każdym kroku:** `npm run build` (Next build + typecheck) oraz — od Tasku 3 — `npm test` (`vitest run`). `npm run lint` przed commitem grupy (po usuwaniu martwego kodu lint łapie nieużywane symbole/importy).
- **Składnia commitów:** uruchamiaj `git commit` przez **PowerShell** (domyślny shell). Jeśli przez Bash — użyj `git commit -m "subject` z prawdziwym podwójnym cudzysłowem i realnymi nowymi liniami (bash NIE rozumie PowerShellowego here-stringa `@'…'@` i wstawi błędne `@` do message).
- **Co sync DALEJ ciągnie z BL:** nazwa, cena, kategoria, zdjęcia, cechy (`color`/`material`/`dimensions`/`weight`/`construction`/`delivery_time`/`warranty`/`features`). **Co przestaje:** `variants`, `description_sections`, `description`.

---

# FAZA A — Widoczność produktu (`is_active`)

## Task 1: Migracja 23 — `is_active`/`deactivation_source` + rozdzielenie polityki SELECT

**Tło:** `products` ma dziś JEDNĄ politykę SELECT `"products: publiczny odczyt"` `to anon, authenticated using (true)` (`supabase/schema.sql:115-118`). `/admin/produkty` czyta przez `createClient()` (RLS, JWT admina) — samo zwężenie publicznej polityki do `is_active = true` ukryłoby produkty też przed adminką. Dlatego rozdzielamy: publiczna → tylko aktywne; nowa admin-SELECT → wszystko (polityki RLS są OR-owane).

**Files:**
- Create: `supabase/migrations/23_products_is_active.sql`

- [ ] **Step 1: Utwórz plik migracji**

```sql
-- ============================================================
-- Migracja 23: widoczność produktu (is_active) + auto/ręczne ukrywanie
-- ============================================================
-- Produkt usunięty z BaseLinkera ma być automatycznie i ODWRACALNIE ukrywany.
-- Admin może też ukryć/przywrócić ręcznie. Widoczność egzekwowana W RLS —
-- jeden punkt prawdy. Sync używa service_role (omija RLS), więc dalej widzi
-- i zapisuje wszystko, łącznie z ukrytymi (potrzebne do reaktywacji).
-- ============================================================

alter table public.products
  add column if not exists is_active boolean not null default true;

-- null = aktywny; 'auto' = ukryty przez sync (znikł z BL → auto-reaktywacja gdy
-- wróci); 'manual' = ukryty ręcznie przez admina (sync NIE reaktywuje).
alter table public.products
  add column if not exists deactivation_source text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'products_deactivation_source_check'
  ) then
    alter table public.products
      add constraint products_deactivation_source_check
      check (deactivation_source in ('auto','manual') or deactivation_source is null);
  end if;
end $$;

create index if not exists idx_products_inactive
  on public.products (is_active) where is_active = false;

-- ---- RLS: rozdzielenie publicznej polityki SELECT ----
-- Podmieniamy istniejącą politykę (a nie tworzymy drugiej równoległej) i
-- dokładamy osobną admin-SELECT. Polityki permissive są OR-owane:
--   anon          → publiczna → is_active = true
--   authenticated → publiczna OR admin → (is_active = true) OR (role=admin)
drop policy if exists "products: publiczny odczyt" on public.products;

create policy "products: publiczny odczyt"
  on public.products for select
  to anon, authenticated
  using (is_active = true);

create policy "products: admin odczyt wszystkich"
  on public.products for select
  to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

comment on column public.products.is_active is
  'Widoczność w sklepie. false = ukryty (RLS pomija dla publiczności; sitemap/listingi/wyszukiwarka automatycznie). Domyślnie true.';
comment on column public.products.deactivation_source is
  'Kto ukrył: null=aktywny, auto=sync (znikł z BL, auto-reaktywacja gdy wróci), manual=admin (sync respektuje, NIE reaktywuje).';
```

- [ ] **Step 2: Commit**

```powershell
git add supabase/migrations/23_products_is_active.sql
git commit -m @'
feat(sync): migracja 23 — is_active + deactivation_source + rozdzielenie RLS SELECT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Typ `Product` + domyślne `is_active` w `mapBlToProduct` + komentarz sitemap

**Tło:** `ProductInsert` (`app/_lib/baselinker-sync.ts:507`) = `Omit<Product,"id"|"created_at"> & {id?,created_at?}`. Po dodaniu wymaganych pól do `Product`, `mapBlToProduct` (konstruktor obiektu, linia 819) musi je ustawić. Defaulty (`true`/`null`) = nowy/wrócony produkt aktywny; warunkowe nadpisanie dla ręcznie ukrytych dochodzi w Tasku 9.

**Files:**
- Modify: `app/_lib/types.ts:95-121` (typ `Product`)
- Modify: `app/_lib/baselinker-sync.ts:819-845` (obiekt `product`)
- Modify: `app/sitemap.ts:48-49` (komentarz)

- [ ] **Step 1: Dodaj pola do typu `Product`**

W `app/_lib/types.ts`, w typie `Product`, przed `created_at: string;`:

```ts
  baselinker_id: string | null;
  collection_id: string | null;
  // Widoczność w sklepie (RLS). false = ukryty. deactivation_source: kto ukrył.
  is_active: boolean;
  deactivation_source: "auto" | "manual" | null;
  created_at: string;
```

- [ ] **Step 2: Ustaw defaulty w `mapBlToProduct`**

W `app/_lib/baselinker-sync.ts`, w obiekcie `const product: ProductInsert = {`, tuż przed `baselinker_id: blId,`:

```ts
    variants: null, // wypełnione niżej z parsedVariants
    // Nowy/wrócony produkt domyślnie widoczny. Warunkowe utrzymanie ręcznego
    // ukrycia (deactivation_source='manual') ustawiane w pętli sync (Task 9).
    is_active: true,
    deactivation_source: null,
    baselinker_id: blId,
```

- [ ] **Step 3: Popraw komentarz sitemap**

`app/sitemap.ts:48-49` (kod `createClient()` bez zmian — RLS teraz odfiltruje ukryte):

```ts
  // Produkty publiczne — RLS (polityka „is_active = true") automatycznie pomija
  // produkty ukryte, więc sitemap nie indeksuje znikłych z BL.
  const supabase = await createClient();
```

- [ ] **Step 4: Build + commit**

Run: `npm run build` → SUCCESS (jeśli wskaże inny konstruktor pełnego `Product` — ustaw tam pola analogicznie; spodziewany tylko `mapBlToProduct`).

```powershell
git add app/_lib/types.ts app/_lib/baselinker-sync.ts app/sitemap.ts
git commit -m @'
feat(sync): Product.is_active/deactivation_source + defaulty w mapBlToProduct

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA B — Chudy sync + sprzątanie

## Task 3: Dodaj Vitest (devDeps + config + skrypt)

**Tło:** brak runnera. Docs Next 16 (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) zaleca `vitest.config.mts` (**.mts** — `package.json` nie ma `"type":"module"`, więc `.ts` byłby CJS i `import` by padł). Testujemy czyste funkcje → env `node`, bez `jsdom`/`@testing-library`/`@vitejs/plugin-react`. `vite-tsconfig-paths` obowiązkowy (alias `@/*`). Skrypt = `vitest run` (gołe `vitest` wisi w watch).

**Files:**
- Create: `vitest.config.mts`
- Modify: `package.json` (devDependencies + scripts)

- [ ] **Step 1: Zainstaluj devDependencies**

Run: `npm install -D vitest vite-tsconfig-paths`

- [ ] **Step 2: Utwórz `vitest.config.mts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Pure-function tests only (planDeactivations/retry/resolveBlFeatures/obrazy) →
// środowisko node. vite-tsconfig-paths rozwiązuje alias @/* z tsconfig.json.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Dodaj skrypty do `package.json`**

```json
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "eslint",
    "test": "vitest run",
    "test:watch": "vitest"
  },
```

- [ ] **Step 4: Smoke test**

Utwórz tymczasowo `app/_lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runner działa", () => {
    expect(1 + 1).toBe(2);
  });
});
```
Run: `npm test` → PASS. Usuń `smoke.test.ts`.

- [ ] **Step 5: Commit**

```powershell
git rm -f app/_lib/__tests__/smoke.test.ts 2>$null; git add package.json package-lock.json vitest.config.mts
git commit -m @'
test: skonfiguruj Vitest (env node, vite-tsconfig-paths, vitest run)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: `resolveBlFeatures` + sort kluczy zdjęć (TDD) — cechy/zdjęcia zostają

**Tło:** cechy i zdjęcia DALEJ się synchronizują. Audyt na żywych danych: cechy realnie pod `bl.text_fields.features` (kod czyta top-level `bl.features`) → cisza zamiast Kolor/Materiał. Resolver to naprawia. `pickFirstImage` (200-206) nie sortuje kluczy obiektu `{1,2,3}` → niestabilna kolejność galerii. Obie funkcje zostają po „chudym syncu", więc eksportujemy je do testów.

**Files:**
- Modify: `app/_lib/baselinker.ts:96-104` (typ `text_fields.features`)
- Modify: `app/_lib/baselinker-sync.ts` (nowy `resolveBlFeatures`; `pickFirstImage` 200-206; użycie w `mapBlToProduct` 826-836; export)
- Create: `app/_lib/__tests__/sync-features-images.test.ts`

- [ ] **Step 1: Failing testy**

```ts
import { describe, it, expect } from "vitest";
import { resolveBlFeatures, pickFirstImage } from "@/app/_lib/baselinker-sync";

describe("resolveBlFeatures — tolerancja źródła", () => {
  it("czyta text_fields.features gdy obecne", () => {
    expect(
      resolveBlFeatures({ id: "1", text_fields: { features: { Kolor: "Beż" } } })
    ).toEqual({ Kolor: "Beż" });
  });
  it("fallback do top-level features", () => {
    expect(resolveBlFeatures({ id: "1", features: { Kolor: "Szary" } })).toEqual({
      Kolor: "Szary",
    });
  });
  it("preferuje text_fields.features nad top-level", () => {
    expect(
      resolveBlFeatures({
        id: "1",
        text_fields: { features: { Kolor: "Beż" } },
        features: { Kolor: "Szary" },
      })
    ).toEqual({ Kolor: "Beż" });
  });
  it("brak cech → undefined", () => {
    expect(resolveBlFeatures({ id: "1" })).toBeUndefined();
  });
});

describe("pickFirstImage — sort kluczy numerycznych", () => {
  it("obiekt {2,1,10} → kolejność numeryczna", () => {
    expect(pickFirstImage({ "2": "a.jpg", "1": "b.jpg", "10": "c.jpg" })).toEqual([
      "b.jpg",
      "a.jpg",
      "c.jpg",
    ]);
  });
  it("tablica bez zmian", () => {
    expect(pickFirstImage(["x.jpg", "y.jpg"])).toEqual(["x.jpg", "y.jpg"]);
  });
  it("filtruje puste", () => {
    expect(pickFirstImage(["a.jpg", ""])).toEqual(["a.jpg"]);
  });
});
```

Run: `npm test app/_lib/__tests__/sync-features-images.test.ts` → FAIL.

- [ ] **Step 2: Typ `text_fields.features` w `app/_lib/baselinker.ts`**

W `BLInventoryProduct.text_fields` (96-104) dodaj `features` + poszerz index signature (musi być supertypem nazwanych pól):

```ts
  text_fields?: {
    name?: string;
    description?: string;
    description_extra1?: string;
    description_extra2?: string;
    description_extra3?: string;
    description_extra4?: string;
    // Audyt 2026-06-08: BL bywa trzyma cechy pod text_fields.features.
    features?: Record<string, string> | { name: string; value: string }[];
    [k: string]: string | Record<string, string> | { name: string; value: string }[] | undefined;
  };
```

- [ ] **Step 3: `resolveBlFeatures` + export `pickFirstImage` + sort kluczy**

W `app/_lib/baselinker-sync.ts`, przy `getFeature` (~linia 207) dodaj:
```ts
// Tolerancja źródła cech: audyt pokazał, że cechy realnie siedzą pod
// text_fields.features (a kod czytał top-level bl.features). Chroni Kolor/
// Materiał/Konstrukcję/Specyfikację przed cichym wyzerowaniem.
export function resolveBlFeatures(bl: BLInventoryProduct): BLInventoryProduct["features"] {
  return (bl.text_fields?.features as BLInventoryProduct["features"]) ?? bl.features;
}
```

Zamień `pickFirstImage` (200-206) — eksport + numeryczny sort kluczy obiektu:
```ts
export function pickFirstImage(images: BLInventoryProduct["images"]): string[] {
  if (!images) return [];
  // Obiekt {1,2,3} → sortuj klucze numerycznie (stabilna kolejność galerii
  // między syncami). Tablica → bez zmian.
  const ordered = Array.isArray(images)
    ? images
    : Object.keys(images)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => images[k]);
  return ordered.filter((v): v is string => typeof v === "string" && v.length > 0);
}
```

- [ ] **Step 4: Użyj `resolveBlFeatures` w `mapBlToProduct`**

W `app/_lib/baselinker-sync.ts:819`, tuż przed `const product: ProductInsert = {`, policz cechy raz, i zamień `bl.features` → `blFeatures` w polach color/material/construction/delivery_time/warranty/features:
```ts
  const blFeatures = resolveBlFeatures(bl);
```
```ts
    color: getFeature(blFeatures, "Kolor"),
    material: getFeature(blFeatures, "Materiał"),
    dimensions: buildDimensions(bl),
    weight: bl.weight && bl.weight > 0 ? Number(bl.weight) : null,
    construction: getFeature(blFeatures, "Konstrukcja"),
    delivery_time: getFeature(blFeatures, "Czas realizacji"),
    warranty: getFeature(blFeatures, "Gwarancja"),
    features: extractAllFeatures(blFeatures),
```

- [ ] **Step 5: Pass + build + commit**

Run: `npm test app/_lib/__tests__/sync-features-images.test.ts` → PASS. Run: `npm run build` → SUCCESS.
```powershell
git add app/_lib/baselinker.ts app/_lib/baselinker-sync.ts app/_lib/__tests__/sync-features-images.test.ts
git commit -m @'
feat(sync): resolveBlFeatures (text_fields.features) + sort kluczy zdjęć (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 5: Chudy sync — `mapBlToProduct` przestaje ustawiać opisy/warianty + usuń martwy parser/merge

**Tło:** sync ma NIE nadpisywać `variants`/`description_sections`/`description`. Pomijamy je w obiekcie produktu (zawężamy typ) → `upsert` ich nie rusza (UPDATE preserve, INSERT default). Po usunięciu wpięcia w pętli, parser wariantów/sekcji i funkcje merge są martwe (grep potwierdził: używane WYŁĄCZNIE w `baselinker-sync.ts`) → usuwamy je w tym samym tasku, żeby zakończyć build+lint na zielono.

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (typ payloadu, `mapBlToProduct` 779-852, pętla 938-1039, usunięcie martwych symboli, import z `./types`)

- [ ] **Step 1: Zawęź typ payloadu syncu i odchudź `mapBlToProduct`**

Dodaj typ obok `ProductInsert` (po linii 510):
```ts
// Sync ustawia tylko te pola. variants/description_sections/description są
// zarządzane ręcznie w panelu (DescriptionSectionsEditor/VariantsEditor) —
// pominięcie ich w upsert: UPDATE nie nadpisuje (preserve), INSERT → default DB.
type SyncProductFields = Omit<
  ProductInsert,
  "variants" | "description_sections" | "description"
>;
```

W `mapBlToProduct` (779-852):
- Usuń blok składania `description` (linie 804-817).
- Zmień typ obiektu i usuń pola `description`, `description_sections`, `variants` (oraz parsowanie wariantów 847-850). Wynik:

```ts
  const blFeatures = resolveBlFeatures(bl);
  const product: SyncProductFields = {
    name: name.trim(),
    price,
    category: cat.slug,
    images: pickFirstImage(bl.images),
    stock: 0, // meble na zamówienie — nieużywane
    color: getFeature(blFeatures, "Kolor"),
    material: getFeature(blFeatures, "Materiał"),
    dimensions: buildDimensions(bl),
    weight: bl.weight && bl.weight > 0 ? Number(bl.weight) : null,
    construction: getFeature(blFeatures, "Konstrukcja"),
    delivery_time: getFeature(blFeatures, "Czas realizacji"),
    warranty: getFeature(blFeatures, "Gwarancja"),
    features: extractAllFeatures(blFeatures),
    is_active: true,
    deactivation_source: null,
    baselinker_id: blId,
    collection_id: null,
  };

  return { ok: true, product };
}
```

Zmień sygnaturę zwrotu (783-786):
```ts
): Promise<
  | { ok: true; product: SyncProductFields }
  | { ok: false; reason: string }
> {
```
(Pole `kind`/`unmappedCategoryId` dojdzie w Tasku 11/12; `parsedVariants` znika.)

- [ ] **Step 2: Odchudź pętlę sync — usuń SELECT/merge/BLOCKER/coverage**

W `syncProductsFromBaseLinker`:

Usuń z inicjalizacji `result` (911-923) pola `sections_coverage` i `variants_coverage` (zostają: inventory_id, inventory_name, total_in_bl, inserted, updated, inserted_products, updated_products, skipped).

Usuń cały blok między `continue;` (po skip mapowania, ~936) a `upsert` (~983): SELECT `existing` (938-949), merge wariantów + BLOCKER (950-971), merge sekcji (973-981). Po zmianie pętla wygląda tak (fragment od mapowania do upsertu):

```ts
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

        // Heurystyka insert vs update — created_at „świeże" (< 5s) = insert
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
      }
```

Usuń całą sekcję statystyk coverage (1010-1039: `const scov = ...` przez `vcov.total_combinations += ...`).

- [ ] **Step 3: Usuń martwy parser/merge + typy + nieużywane importy**

Usuń z `app/_lib/baselinker-sync.ts` (funkcje/stałe/typy używane wyłącznie przez wycięty parser/merge):
- `variantKey` (26-31)
- `mergeVariantsPreserveAdminEdits` (42-113)
- `commonPrefix` + `PREFIX_THRESHOLD` + `capitalizeFirst` (512-535)
- `COLOR_KEYWORDS` (554-575), `SIZE_PATTERNS` + `isColorValue` + `isSizeValue` + `detectOptionName` (577-607)
- `parseNamedAttrs` (612-626), `ParsedVariants` (630-633), `parseVariantsFromBl` (645-777)
- `DESCRIPTION_SECTION_LABELS` (309-318), `CONSUMED_FIELDS` (322-324), `INFO_SECTION_PATTERNS` (330-334), `extractDescriptionSections` (339-380)
- `AnySection` (383-…), `mergeSectionsPreserveAdminImages` (406-485)

ZOSTAW: `pickFirstImage`, `getFeature`, `ALLEGRO_JUNK_KEYS`/`isAllegroJunkKey`, `extractAllFeatures`, `resolveBlFeatures`, `buildDimensions`, `defaultPrice`.

W imporcie z `./types` (7-22) usuń nieużywane po tej zmianie: `ProductVariants`, `ProductVariant`, `ProductVariantOverrides` (zostaje `Product`, `ProductDimensions`). Zostaw import `BLVariant` tylko jeśli dalej używany — po usunięciu parsera NIE jest → usuń `BLVariant` z importu `./baselinker`.

- [ ] **Step 4: Build + lint (łapie nieużywane resztki)**

Run: `npm run build` → SUCCESS. Run: `npm run lint` → 0 błędów. Jeśli lint wskaże nieużywany symbol/import — usuń go (to resztka po parserze). Run: `npm test` → istniejące testy (Task 4) zielone.

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/baselinker-sync.ts
git commit -m @'
feat(sync): chudy sync — bez opisów/wariantów + usunięcie martwego parsera/merge

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Usuń paski pokrycia z panelu + typy coverage (estetyka)

**Tło:** sekcje/warianty nie są już synchronizowane → paski „pokrycie sekcji/wariantów" w panelu i typy `*_coverage` są nieaktualne. Usunięcie typów z `SyncInventoryResult` wymusza równoczesną zmianę panelu (czyta `inv.sections_coverage`) — robimy w jednym tasku, by build był zielony.

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (typy `SyncSectionsCoverage`/`SyncVariantsCoverage` 133-163; pola w `SyncInventoryResult` 165-183)
- Modify: `app/admin/baselinker/BaseLinkerSyncPanel.tsx` (`SectionsCoverageBar` 264-331, `VariantsCoverageBar` 337-416, użycie w `InventoryResult` 248-255)

- [ ] **Step 1: Usuń pola coverage z `SyncInventoryResult` + typy**

W `app/_lib/baselinker-sync.ts`:
- Usuń typy `SyncSectionsCoverage` (133-145) i `SyncVariantsCoverage` (152-163).
- W `SyncInventoryResult` (165-183) usuń pola `sections_coverage?` i `variants_coverage?` (+ ich komentarze).

- [ ] **Step 2: Usuń paski z panelu**

W `app/admin/baselinker/BaseLinkerSyncPanel.tsx`:
- Usuń komponenty `SectionsCoverageBar` (264-331) i `VariantsCoverageBar` (337-416).
- W `InventoryResult` usuń warunkowy render obu (linie ~248-255: bloki `{inv.sections_coverage && ...}` i `{inv.variants_coverage && ...}`).

- [ ] **Step 3: Build + lint + commit**

Run: `npm run build` → SUCCESS. Run: `npm run lint` → 0 błędów (usuń ewentualne nieużywane importy po skasowanych komponentach).
```powershell
git add app/_lib/baselinker-sync.ts app/admin/baselinker/BaseLinkerSyncPanel.tsx
git commit -m @'
refactor(admin): usuń paski pokrycia sekcji/wariantów (nieaktualne po chudym syncu)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 7: SEO/fallback opisu wyprowadzany z `description_sections`

**Tło:** plain `description` nie jest już syncowany; nowy produkt miałby pustą meta-SEO. Strona produktu (`app/produkt/[id]/page.tsx`) używa `stripHtml(product.description)` dla meta (linia 39) i JSON-LD (131). Gdy `description` puste → wyprowadzamy tekst z `description_sections` (jedno źródło = sekcje edytowane przez admina). Widok główny sekcji renderuje `ProductDescriptionSections` bez zmian.

**Files:**
- Modify: `app/produkt/[id]/page.tsx` (helper + linie 39, 131)

- [ ] **Step 1: Potwierdź kształt tekstowej sekcji opisu**

Przeczytaj typ `ProductDescriptionSection` w `app/_lib/types.ts` (~62-93) — potwierdź pola wariantu `text`: `body`, `admin_body?`, `hidden?`. (Z panelu wiadomo, że tekstowa sekcja ma `{kind:"text", title, body, admin_title?, admin_body?, hidden?, admin_custom?}`.)

- [ ] **Step 2: Dodaj helper i użyj w meta + JSON-LD**

W `app/produkt/[id]/page.tsx` (po importach, przed `generateMetadata`) dodaj:
```ts
// Plain-text opis dla SEO/JSON-LD. Po wyłączeniu sync opisów plain `description`
// bywa puste dla nowych produktów — wtedy składamy z widocznych tekstowych
// sekcji (jedyne źródło opisu, wpisywane ręcznie w panelu).
function productPlainDescription(product: Product): string {
  if (product.description && product.description.trim().length > 0) {
    return product.description;
  }
  return (product.description_sections ?? [])
    .filter((s) => s.kind === "text" && (s as { hidden?: boolean }).hidden !== true)
    .map((s) => {
      const t = s as { admin_body?: string; body?: string };
      return (t.admin_body ?? t.body ?? "").trim();
    })
    .filter((b) => b.length > 0)
    .join("\n\n");
}
```

Zamień użycia (upewnij się, że `Product` jest zaimportowany — jest, przez `getProduct`):
- Linia 39: `description: stripHtml(product.description).slice(0, 160),` → `description: stripHtml(productPlainDescription(product)).slice(0, 160),`
- Linia 131: `const plainDescription = stripHtml(product.description).slice(0, 5000);` → `const plainDescription = stripHtml(productPlainDescription(product)).slice(0, 5000);`

(Jeśli `Product` nie jest jeszcze importowany w tym pliku — dodaj `import type { Product } from "@/app/_lib/types";`.)

- [ ] **Step 3: Build + commit**

Run: `npm run build` → SUCCESS.
```powershell
git add app/produkt/[id]/page.tsx
git commit -m @'
feat(shop): meta-SEO i fallback opisu wyprowadzane z description_sections

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA C — Bezpieczne auto-ukrywanie + reaktywacja + raport

## Task 8: `planDeactivations` (TDD — pure)

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (nowa eksportowana funkcja, po typach wyniku ~195)
- Create: `app/_lib/__tests__/plan-deactivations.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { planDeactivations } from "@/app/_lib/baselinker-sync";

const db = (...ids: string[]) => ids.map((baselinker_id) => ({ baselinker_id }));
const guards = { completedFully: true, maxRatio: 0.2, maxAbsoluteFloor: 5 };

describe("planDeactivations", () => {
  it("abort gdy pobranie niekompletne", () => {
    const r = planDeactivations(db("1", "2"), new Set<string>(), {
      ...guards,
      completedFully: false,
    });
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toMatch(/niekompletne/i);
  });
  it("ukrywa produkty z DB nieobecne w seenBlIds", () => {
    const r = planDeactivations(db("1", "2", "3"), new Set(["1", "2"]), guards);
    expect(r.toDeactivate).toEqual(["3"]);
    expect(r.skippedReason).toBeNull();
  });
  it("nic do ukrycia gdy wszystkie widziane", () => {
    const r = planDeactivations(db("1", "2"), new Set(["1", "2"]), guards);
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toBeNull();
  });
  it("podłoga: 3 z 3 (poniżej floor=5) PRZECHODZI", () => {
    const r = planDeactivations(db("1", "2", "3"), new Set<string>(), guards);
    expect(r.toDeactivate).toEqual(["1", "2", "3"]);
  });
  it("próg: 25 z 100 (>20%) wstrzymuje", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i));
    const r = planDeactivations(db(...all), new Set(all.slice(25)), guards);
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toMatch(/podejrzanie dużo \(25\)/);
  });
  it("próg: 15 z 100 (<20%) PRZECHODZI", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i));
    const r = planDeactivations(db(...all), new Set(all.slice(15)), guards);
    expect(r.toDeactivate).toHaveLength(15);
  });
});
```

Run: `npm test app/_lib/__tests__/plan-deactivations.test.ts` → FAIL.

- [ ] **Step 2: Implementacja**

W `app/_lib/baselinker-sync.ts` (po `SyncOutcome`, ~195):
```ts
// ============================================================
// Bezpieczne auto-ukrywanie znikłych produktów (czysta, testowalna funkcja)
// ============================================================
export function planDeactivations(
  dbBlProducts: { baselinker_id: string }[],
  seenBlIds: Set<string>,
  guards: { completedFully: boolean; maxRatio: number; maxAbsoluteFloor: number }
): { toDeactivate: string[]; skippedReason: string | null } {
  if (!guards.completedFully) {
    return {
      toDeactivate: [],
      skippedReason:
        "pobranie z BaseLinkera było niekompletne — pominięto auto-ukrywanie dla bezpieczeństwa",
    };
  }

  const candidates = dbBlProducts
    .map((p) => p.baselinker_id)
    .filter((id) => !!id && !seenBlIds.has(id));

  if (candidates.length === 0) {
    return { toDeactivate: [], skippedReason: null };
  }

  const threshold = Math.max(
    guards.maxRatio * dbBlProducts.length,
    guards.maxAbsoluteFloor
  );
  if (candidates.length > threshold) {
    return {
      toDeactivate: [],
      skippedReason: `podejrzanie dużo (${candidates.length}) produktów do ukrycia — sprawdź BaseLinker i potwierdź ręcznie`,
    };
  }

  return { toDeactivate: candidates, skippedReason: null };
}
```

- [ ] **Step 3: Pass + build + commit**

Run: `npm test app/_lib/__tests__/plan-deactivations.test.ts` → PASS (6). Run: `npm run build` → SUCCESS.
```powershell
git add app/_lib/baselinker-sync.ts app/_lib/__tests__/plan-deactivations.test.ts
git commit -m @'
feat(sync): planDeactivations — bezpieczniki auto-ukrywania (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 9: Wpięcie ukrywania + warunkowa reaktywacja + raport `SyncOutcome`

**Tło:** operuje na ODCHUDZONEJ pętli (Task 5). SELECT istniejącego rekordu wraca, ale tylko po `is_active, deactivation_source` (do reaktywacji). Krok ukrywania = JEDEN batch po pętli wszystkich magazynów.

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (typ `SyncOutcome` 192-194 + `UnmappedCategory`; akumulatory; pętla; sekcja po pętli; return)

- [ ] **Step 1: Rozszerz `SyncOutcome` (ok:true) + dodaj `UnmappedCategory`**

`app/_lib/baselinker-sync.ts:192-194`:
```ts
export type SyncOutcome =
  | {
      ok: true;
      results: SyncInventoryResult[];
      totals: SyncTotals;
      warning?: string;
      // Raport run-level (utwardzenie). Opcjonalne — stare logi ich nie mają.
      deactivated?: SyncedProduct[];
      reactivated?: SyncedProduct[];
      hide_skipped_reason?: string | null;
      unmapped_categories?: UnmappedCategory[];
    }
  | { ok: false; error: string; where?: "BaseLinker API" | "internal"; code?: string };
```
Dodaj typ przy innych typach wyniku (~119):
```ts
export type UnmappedCategory = {
  bl_category_id: number;
  sample_product_name: string;
  count: number;
};
```

- [ ] **Step 2: Akumulatory przed pętlą magazynów**

Po `const results: SyncInventoryResult[] = [];`:
```ts
    const seenBlIds = new Set<string>(); // baselinker_id z udanych upsertów
    const reactivated: SyncedProduct[] = []; // wcześniej auto-ukryte, wróciły z BL
    // completedFully: nieudany ODCZYT BL rzuca → catch → ok:false (krok
    // ukrywania jest poza tą ścieżką), więc tu pobranie jest pełne.
    const completedFully = true;
```

- [ ] **Step 3: SELECT istniejącego + warunkowa reaktywacja (w pętli, po skip mapowania, przed upsertem)**

Wstaw między `if (!mapped.ok) {...continue;}` a `const { data, error } = await supabase.from("products").upsert(...)`:
```ts
        const { data: existing } = await supabase
          .from("products")
          .select("is_active, deactivation_source")
          .eq("baselinker_id", blId)
          .maybeSingle();
        const existingRow = existing as
          | { is_active: boolean | null; deactivation_source: "auto" | "manual" | null }
          | null;
        // manual → zostaje ukryty (respektujemy admina); auto/aktywny/nowy → aktywny.
        const wasManuallyHidden = existingRow?.deactivation_source === "manual";
        mapped.product.is_active = !wasManuallyHidden;
        mapped.product.deactivation_source = wasManuallyHidden ? "manual" : null;
        if (existingRow?.is_active === false && existingRow?.deactivation_source === "auto") {
          reactivated.push({ id: blId, name: mapped.product.name });
        }
```

- [ ] **Step 4: Zbieraj `seenBlIds` po udanym upsercie**

Po bloku `if (error) {...continue;}` (przed heurystyką insert/update):
```ts
        seenBlIds.add(blId);

```

- [ ] **Step 5: Krok ukrywania po pętli magazynów (przed `const totals`)**

```ts
    // ---- Auto-ukrywanie znikłych produktów (raz, po wszystkich magazynach) ----
    const { data: activeBlRows } = await supabase
      .from("products")
      .select("baselinker_id")
      .eq("is_active", true)
      .not("baselinker_id", "is", null);
    const dbBlProducts = ((activeBlRows ?? []) as { baselinker_id: string | null }[])
      .filter((p): p is { baselinker_id: string } => !!p.baselinker_id);

    const { toDeactivate, skippedReason } = planDeactivations(dbBlProducts, seenBlIds, {
      completedFully,
      maxRatio: 0.2,
      maxAbsoluteFloor: 5,
    });

    const deactivated: SyncedProduct[] = [];
    if (toDeactivate.length > 0) {
      const { data: deactivatedRows } = await supabase
        .from("products")
        .update({ is_active: false, deactivation_source: "auto" } as never)
        .in("baselinker_id", toDeactivate)
        .select("baselinker_id, name");
      for (const row of (deactivatedRows ?? []) as { baselinker_id: string; name: string }[]) {
        deactivated.push({ id: row.baselinker_id, name: row.name });
      }
    }
```

- [ ] **Step 6: Dołącz raport do `return { ok: true, ... }`**

```ts
    return {
      ok: true,
      results,
      totals,
      deactivated,
      reactivated,
      hide_skipped_reason: skippedReason,
      // unmapped_categories dochodzi w Tasku 12
    };
```

- [ ] **Step 7: Build + commit**

Run: `npm run build` → SUCCESS. Run: `npm test` → zielone.
```powershell
git add app/_lib/baselinker-sync.ts
git commit -m @'
feat(sync): auto-ukrywanie + warunkowa reaktywacja + raport SyncOutcome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA D — Niezawodność: retry + kategoryzacja + banner kategorii

## Task 10: Retry odczytów BL w `blRequest` (TDD)

**Tło:** `blRequest` (24-59) bez retry; HTTP !ok rzuca `Error("BaseLinker HTTP ${status}")` (status niedostępny jako pole). Wprowadzamy `BaseLinkerHttpError` (z `status`), klasyfikator `isTransientBlError` (pure), backoff, opt-in retry. Retry tylko dla odczytów; `addOrder` bez retry.

**Files:**
- Modify: `app/_lib/baselinker.ts`
- Modify: `app/_lib/baselinker-sync.ts` (stała + 3 wywołania)
- Create: `app/_lib/__tests__/baselinker-retry.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  isTransientBlError,
  retryDelayMs,
  BaseLinkerHttpError,
  BaseLinkerError,
} from "@/app/_lib/baselinker";

describe("isTransientBlError", () => {
  it("HTTP 5xx przejściowy", () => expect(isTransientBlError(new BaseLinkerHttpError(503))).toBe(true));
  it("HTTP 429 przejściowy", () => expect(isTransientBlError(new BaseLinkerHttpError(429))).toBe(true));
  it("HTTP 4xx (poza 429) trwały", () => expect(isTransientBlError(new BaseLinkerHttpError(400))).toBe(false));
  it("błąd sieci (TypeError) przejściowy", () => expect(isTransientBlError(new TypeError("fetch failed"))).toBe(true));
  it("BaseLinkerError z trwałym kodem", () =>
    expect(isTransientBlError(new BaseLinkerError("getInventories", "ERROR_AUTH_TOKEN", "x"))).toBe(false));
  it("nieznany błąd trwały (fail-safe)", () => expect(isTransientBlError(new Error("?"))).toBe(false));
});

describe("retryDelayMs — backoff 0.5/1/2 s", () => {
  it("rośnie wykładniczo", () => {
    expect(retryDelayMs(1, 500)).toBe(500);
    expect(retryDelayMs(2, 500)).toBe(1000);
    expect(retryDelayMs(3, 500)).toBe(2000);
  });
});
```

Run: `npm test app/_lib/__tests__/baselinker-retry.test.ts` → FAIL.

- [ ] **Step 2: Implementacja w `app/_lib/baselinker.ts`**

Po klasie `BaseLinkerError` (22):
```ts
export class BaseLinkerHttpError extends Error {
  constructor(public status: number) {
    super(`BaseLinker HTTP ${status}`);
    this.name = "BaseLinkerHttpError";
  }
}

// Kody błędów BL uznawane za PRZEJŚCIOWE. Rate-limit BL — kod do potwierdzenia
// na żywym koncie (spec §9); zbiór łatwy do uzupełnienia bez zmian w logice.
const TRANSIENT_BL_ERROR_CODES = new Set<string>(["ERROR_RATE_LIMIT"]);

export function isTransientBlError(err: unknown): boolean {
  if (err instanceof BaseLinkerHttpError) return err.status >= 500 || err.status === 429;
  if (err instanceof BaseLinkerError) return TRANSIENT_BL_ERROR_CODES.has(err.errorCode);
  if (err instanceof TypeError) return true; // błąd sieciowy z fetch()
  return false;
}

export function retryDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 1);
}

export type BlRetryOptions = { attempts: number; baseDelayMs: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

Wydziel jednorazowe wywołanie i opakuj retry (zamiana `blRequest` 24-59):
```ts
async function blRequestOnce<T = unknown>(
  method: string,
  parameters: Record<string, unknown> = {}
): Promise<T> {
  const token = process.env.BASELINKER_API_TOKEN;
  if (!token) {
    throw new Error("BASELINKER_API_TOKEN nie jest ustawiony w env");
  }

  const body = new URLSearchParams({
    method,
    parameters: JSON.stringify(parameters),
  });

  const res = await fetch(BL_URL, {
    method: "POST",
    headers: {
      "X-BLToken": token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new BaseLinkerHttpError(res.status);
  }

  const data = (await res.json()) as BLResponse<T>;
  if (data.status === "ERROR") {
    throw new BaseLinkerError(method, data.error_code, data.error_message);
  }

  return data as T;
}

// retry = opt-in (tylko idempotentne odczyty). Ponawia WYŁĄCZNIE przejściowe.
export async function blRequest<T = unknown>(
  method: string,
  parameters: Record<string, unknown> = {},
  retry?: BlRetryOptions
): Promise<T> {
  const attempts = retry?.attempts ?? 1;
  const baseDelayMs = retry?.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await blRequestOnce<T>(method, parameters);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isTransientBlError(err)) throw err;
      await sleep(retryDelayMs(attempt, baseDelayMs));
    }
  }
  throw lastErr;
}
```

- [ ] **Step 3: Dodaj `retry?` do trzech wrapperów odczytu**

`getInventories` (138-141):
```ts
export async function getInventories(retry?: BlRetryOptions): Promise<BLInventory[]> {
  const res = await blRequest<BLInventoryListResponse>("getInventories", {}, retry);
  return res.inventories ?? [];
}
```
`getInventoryProductsList` (152-161):
```ts
export async function getInventoryProductsList(
  inventoryId: number,
  page = 1,
  retry?: BlRetryOptions
): Promise<BLInventoryProductsListResponse> {
  return blRequest<BLInventoryProductsListResponse>(
    "getInventoryProductsList",
    { inventory_id: inventoryId, page },
    retry
  );
}
```
`getInventoryProductsData` (163-172):
```ts
export async function getInventoryProductsData(
  inventoryId: number,
  productIds: string[],
  retry?: BlRetryOptions
): Promise<BLInventoryProductsListResponse> {
  return blRequest<BLInventoryProductsListResponse>(
    "getInventoryProductsData",
    { inventory_id: inventoryId, products: productIds },
    retry
  );
}
```
(`addOrder` — bez zmian, bez retry.)

- [ ] **Step 4: Włącz retry w sync**

W `app/_lib/baselinker-sync.ts` po importach (~23):
```ts
// Retry idempotentnych odczytów BL: 3 próby, backoff 0.5s → 1s → 2s.
const BL_READ_RETRY = { attempts: 3, baseDelayMs: 500 } as const;
```
Przekaż w trzech wywołaniach: `getInventories(BL_READ_RETRY)`, `getInventoryProductsList(inv.inventory_id, page, BL_READ_RETRY)`, `getInventoryProductsData(inv.inventory_id, chunk, BL_READ_RETRY)`.

- [ ] **Step 5: Pass + build + commit**

Run: `npm test app/_lib/__tests__/baselinker-retry.test.ts` → PASS (8). Run: `npm run build` → SUCCESS.
```powershell
git add app/_lib/baselinker.ts app/_lib/baselinker-sync.ts app/_lib/__tests__/baselinker-retry.test.ts
git commit -m @'
feat(sync): retry przejściowych błędów BL dla odczytów (backoff, opt-in) — TDD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 11: Kategoryzacja błędów — `SyncSkippedProduct.kind` (owner/technical)

**Tło:** po Tasku 5 są DWA call-site'y skip: mapowanie nieudane (owner) i błąd zapisu (technical). `mapBlToProduct` zwraca `kind` + (dla niezmapowanej kategorii) `unmappedCategoryId`. `kind` opcjonalny (stare logi → UI traktuje jak owner).

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (typ `SyncSkippedProduct` 115-119; return `mapBlToProduct`; 2 push do skipped)

- [ ] **Step 1: Dodaj `kind` do `SyncSkippedProduct`**

`app/_lib/baselinker-sync.ts:115-119`:
```ts
export type SyncSkippedProduct = {
  id: string;
  name: string;
  reason: string;
  // owner = właścicielka poprawia w BL; technical = bug dla Mikołaja.
  // Opcjonalne — stare logi bez tego pola (UI domyśla owner).
  kind?: "owner" | "technical";
};
```

- [ ] **Step 2: `mapBlToProduct` zwraca `kind` + `unmappedCategoryId`**

Sygnatura zwrotu (po zmianie z Tasku 5):
```ts
): Promise<
  | { ok: true; product: SyncProductFields }
  | { ok: false; reason: string; kind: "owner" | "technical"; unmappedCategoryId?: number }
> {
```
Zaktualizuj cztery `return { ok: false, ... }`:
```ts
  if (!name.trim()) return { ok: false, reason: "brak nazwy", kind: "owner" };
```
```ts
  if (!blCategoryId) return { ok: false, reason: "brak kategorii w BL", kind: "owner" };
```
```ts
  if (!cat) {
    return {
      ok: false,
      reason: `kategoria BL ${blCategoryId} nie zmapowana — dodaj mapowanie w admin panelu /admin/kategorie`,
      kind: "owner",
      unmappedCategoryId: blCategoryId,
    };
  }
```
```ts
  if (!price) return { ok: false, reason: "brak ceny lub cena = 0", kind: "owner" };
```

- [ ] **Step 3: Ustaw `kind` w dwóch push-ach do `skipped`**

Mapowanie nieudane:
```ts
        if (!mapped.ok) {
          result.skipped.push({
            id: blId,
            name: bl.text_fields?.name ?? "(brak nazwy)",
            reason: mapped.reason,
            kind: mapped.kind,
          });
          continue;
        }
```
Błąd zapisu:
```ts
        if (error) {
          result.skipped.push({
            id: blId,
            name: mapped.product.name,
            reason: `błąd zapisu: ${error.message}`,
            kind: "technical",
          });
          continue;
        }
```

- [ ] **Step 4: Build + commit**

Run: `npm run build` → SUCCESS.
```powershell
git add app/_lib/baselinker-sync.ts
git commit -m @'
feat(sync): kategoryzacja pominiętych (owner vs technical)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 12: Agregacja `unmapped_categories` (K2) + migracja 24 + persystencja raportu

**Tło:** banner K2 musi przeżyć `window.location.reload()` (handleSync, `BaseLinkerSyncPanel.tsx:57`) → raport persystujemy do nowej kolumny `baselinker_sync_log.report` (jsonb). Agregacja = czysta funkcja.

**Files:**
- Create: `supabase/migrations/24_baselinker_sync_log_report.sql`
- Modify: `app/_lib/baselinker-sync.ts` (helper + akumulacja + return + `logSyncOutcome`)
- Modify: `app/admin/baselinker/actions.ts` (`SyncLogRow.report`)
- Create: `app/_lib/__tests__/unmapped-categories.test.ts`

- [ ] **Step 1: Migracja 24**

```sql
-- ============================================================
-- Migracja 24: raport run-level w logu sync (ukrycia/przywrócenia/kategorie)
-- ============================================================
-- Raport run-level (deactivated/reactivated/hide_skipped_reason/
-- unmapped_categories) w osobnej kolumnie jsonb, żeby panel pokazał banner
-- „produkt zniknął — brak mapowania kategorii" także po przeładowaniu strony.
-- null dla starych logów.
-- ============================================================

alter table public.baselinker_sync_log
  add column if not exists report jsonb;

comment on column public.baselinker_sync_log.report is
  'Raport run-level sync: {deactivated:[{id,name}], reactivated:[{id,name}], hide_skipped_reason:string|null, unmapped_categories:[{bl_category_id,sample_product_name,count}]}. null dla logów sprzed utwardzenia.';
```

- [ ] **Step 2: Failing test agregacji**

```ts
import { describe, it, expect } from "vitest";
import { aggregateUnmappedCategories } from "@/app/_lib/baselinker-sync";

describe("aggregateUnmappedCategories", () => {
  it("dedup po bl_category_id, count, pierwsza nazwa jako sample", () => {
    const r = aggregateUnmappedCategories([
      { bl_category_id: 10, product_name: "Sofa A" },
      { bl_category_id: 10, product_name: "Sofa B" },
      { bl_category_id: 22, product_name: "Łóżko C" },
    ]);
    expect(r).toEqual([
      { bl_category_id: 10, sample_product_name: "Sofa A", count: 2 },
      { bl_category_id: 22, sample_product_name: "Łóżko C", count: 1 },
    ]);
  });
  it("pusta lista → []", () => {
    expect(aggregateUnmappedCategories([])).toEqual([]);
  });
});
```

Run: `npm test app/_lib/__tests__/unmapped-categories.test.ts` → FAIL.

- [ ] **Step 3: Helper**

W `app/_lib/baselinker-sync.ts` (przy `planDeactivations`):
```ts
export function aggregateUnmappedCategories(
  items: { bl_category_id: number; product_name: string }[]
): UnmappedCategory[] {
  const byId = new Map<number, UnmappedCategory>();
  for (const it of items) {
    const prev = byId.get(it.bl_category_id);
    if (prev) {
      prev.count += 1;
    } else {
      byId.set(it.bl_category_id, {
        bl_category_id: it.bl_category_id,
        sample_product_name: it.product_name,
        count: 1,
      });
    }
  }
  return Array.from(byId.values());
}
```

- [ ] **Step 4: Akumuluj w pętli + zbuduj raport + return**

Przy akumulatorach (Task 9 Step 2):
```ts
    const unmappedRaw: { bl_category_id: number; product_name: string }[] = [];
```
W bloku `if (!mapped.ok)` (Task 11), przed `continue;`:
```ts
          if (mapped.unmappedCategoryId != null) {
            unmappedRaw.push({
              bl_category_id: mapped.unmappedCategoryId,
              product_name: bl.text_fields?.name ?? "(brak nazwy)",
            });
          }
          continue;
```
Po obliczeniu `deactivated` (Task 9 Step 5):
```ts
    const unmapped_categories = aggregateUnmappedCategories(unmappedRaw);
```
W `return { ok: true, ... }`:
```ts
      hide_skipped_reason: skippedReason,
      unmapped_categories,
    };
```

- [ ] **Step 5: Persystuj raport w `logSyncOutcome`**

W gałęzi `outcome.ok` (1085-1100) dodaj `report` do insertu:
```ts
      results: outcome.results as unknown as Record<string, unknown>,
      report: {
        deactivated: outcome.deactivated ?? [],
        reactivated: outcome.reactivated ?? [],
        hide_skipped_reason: outcome.hide_skipped_reason ?? null,
        unmapped_categories: outcome.unmapped_categories ?? [],
      } as unknown as Record<string, unknown>,
      error_message: null,
```
W gałęzi błędu dopisz `report: null,`.

- [ ] **Step 6: `SyncLogRow.report`**

`app/admin/baselinker/actions.ts:58-71` (kolumna dociąga się przez `select("*")`):
```ts
  results: unknown;
  report: unknown;
  error_message: string | null;
```

- [ ] **Step 7: Testy + build + commit**

Run: `npm test` → PASS. Run: `npm run build` → SUCCESS.
```powershell
git add supabase/migrations/24_baselinker_sync_log_report.sql app/_lib/baselinker-sync.ts app/admin/baselinker/actions.ts app/_lib/__tests__/unmapped-categories.test.ts
git commit -m @'
feat(sync): agregacja niezmapowanych kategorii (K2) + persystencja raportu w logu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA E — UI panelu + ręczny toggle

## Task 13: Panel — wspólny `<SyncReport>` (ukryto/przywrócono/wstrzymano + banner K2)

**Tło:** raport pokazujemy na żywo (`ResultSummary`, `result.outcome`) i w historii (`LogRow`, `log.report` — przeżywa reload). Jeden komponent.

**Files:**
- Modify: `app/admin/baselinker/BaseLinkerSyncPanel.tsx`

- [ ] **Step 1: Typ + komponent `SyncReport`**

Po `SkippedRow` (~483):
```tsx
type SyncReportData = {
  deactivated?: { id: string; name: string }[];
  reactivated?: { id: string; name: string }[];
  hide_skipped_reason?: string | null;
  unmapped_categories?: {
    bl_category_id: number;
    sample_product_name: string;
    count: number;
  }[];
};

function SyncReport({ report }: { report: SyncReportData }) {
  const deactivated = report.deactivated ?? [];
  const reactivated = report.reactivated ?? [];
  const unmapped = report.unmapped_categories ?? [];
  const hideSkipped = report.hide_skipped_reason ?? null;

  if (
    deactivated.length === 0 &&
    reactivated.length === 0 &&
    unmapped.length === 0 &&
    !hideSkipped
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {unmapped.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl">
          <p className="font-sans text-sm font-semibold text-amber-900 dark:text-amber-200">
            ⚠️ {unmapped.reduce((s, c) => s + c.count, 0)} produkt(ów) nie trafiło do
            sklepu — brak mapowania kategorii BaseLinker
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-900 dark:text-amber-200">
            {unmapped.map((c) => (
              <li key={c.bl_category_id}>
                Kategoria BL <span className="font-mono">{c.bl_category_id}</span> ·{" "}
                {c.count} szt. · np. „{c.sample_product_name}"
              </li>
            ))}
          </ul>
          <a
            href="/admin/kategorie"
            className="mt-2 inline-block text-xs font-sans uppercase tracking-widest text-amber-900 dark:text-amber-200 underline"
          >
            Dodaj mapowanie → /admin/kategorie
          </a>
        </div>
      )}

      {hideSkipped && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-xs text-red-800 dark:text-red-300">
          Auto-ukrywanie wstrzymane: {hideSkipped}
        </div>
      )}

      {deactivated.length > 0 && (
        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Ukryto (znikły z BL) ({deactivated.length}):
          </p>
          <div className="flex flex-col gap-1.5">
            {deactivated.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg"
              >
                <span className="px-2 py-0.5 text-[10px] font-sans rounded shrink-0 mt-0.5 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                  BL: {p.id}
                </span>
                <p className="text-sm text-[var(--fg)] truncate flex-1 min-w-0">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {reactivated.length > 0 && (
        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Przywrócono (wróciły do BL) ({reactivated.length}):
          </p>
          <div className="flex flex-col gap-1.5">
            {reactivated.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg"
              >
                <span className="px-2 py-0.5 text-[10px] font-sans rounded shrink-0 mt-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">
                  BL: {p.id}
                </span>
                <p className="text-sm text-[var(--fg)] truncate flex-1 min-w-0">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Pokaż na żywo w `ResultSummary`**

W `ResultSummary` po paragrafie z czasem (przed `result.outcome.results.map`):
```tsx
      <SyncReport report={result.outcome as SyncReportData} />
```

- [ ] **Step 3: Pokaż w historii (`LogRow`)**

W `LogRow` przy parsowaniu `results` (~504-508) dodaj odczyt raportu, i w JSX rozwiniętej części przed listą `InventoryResult`:
```tsx
  const report =
    log.report && typeof log.report === "object"
      ? (log.report as SyncReportData)
      : null;
```
```tsx
          {report && <SyncReport report={report} />}
```

- [ ] **Step 4: Build + commit**

Run: `npm run build` → SUCCESS.
```powershell
git add app/admin/baselinker/BaseLinkerSyncPanel.tsx
git commit -m @'
feat(admin): panel BL — sekcje ukryto/przywrócono/wstrzymano + banner kategorii (K2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 14: Panel — grupowanie pominiętych „do poprawienia w BL" vs „błąd techniczny"

**Files:**
- Modify: `app/admin/baselinker/BaseLinkerSyncPanel.tsx` (`InventoryResult` — sekcja skipped)

- [ ] **Step 1: Rozdziel skipped po `kind`**

Zamień blok `{inv.skipped.length > 0 && (...)}` w `InventoryResult` na:
```tsx
      {inv.skipped.length > 0 && (
        <div className="mt-3 space-y-3">
          {(() => {
            const technical = inv.skipped.filter((s) => s.kind === "technical");
            const owner = inv.skipped.filter((s) => s.kind !== "technical");
            return (
              <>
                {owner.length > 0 && (
                  <div>
                    <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
                      Do poprawienia w BaseLinkerze ({owner.length}):
                    </p>
                    <div className="flex flex-col gap-2">
                      {(showAllSkipped ? owner : owner.slice(0, 5)).map((s) => (
                        <SkippedRow key={s.id} skipped={s} />
                      ))}
                    </div>
                  </div>
                )}
                {technical.length > 0 && (
                  <div>
                    <p className="text-xs font-sans uppercase tracking-widest text-red-700 dark:text-red-400 mb-2">
                      Błąd techniczny — zgłoś Mikołajowi ({technical.length}):
                    </p>
                    <div className="flex flex-col gap-2">
                      {technical.map((s) => (
                        <SkippedRow key={s.id} skipped={s} />
                      ))}
                    </div>
                  </div>
                )}
                {owner.length > 5 && (
                  <button
                    onClick={() => setShowAllSkipped(!showAllSkipped)}
                    className="text-xs text-[var(--color-gold)] hover:underline"
                  >
                    {showAllSkipped
                      ? "Pokaż mniej"
                      : `Pokaż wszystkie (${owner.length - 5} więcej)`}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}
```
(`showAllSkipped`/`setShowAllSkipped` już istnieją; jeśli `visibleSkipped` stało się nieużywane — usuń je.)

- [ ] **Step 2: Build + lint + commit**

Run: `npm run build` → SUCCESS. Run: `npm run lint` → OK.
```powershell
git add app/admin/baselinker/BaseLinkerSyncPanel.tsx
git commit -m @'
feat(admin): panel BL — podział pominiętych owner vs technical

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 15: `/admin/produkty` — badge „ukryty" + ręczny toggle Ukryj/Przywróć

**Tło:** lista czyta przez `createClient()` — admin widzi ukryte dzięki polityce admin-SELECT (Task 1). `select("*")` dociąga `is_active`. Toggle = client component (jak `DeleteProductButton`) wołający `setProductActive`.

**Files:**
- Modify: `app/admin/produkty/actions.ts` (`setProductActive`)
- Create: `app/admin/produkty/ToggleProductActiveButton.tsx`
- Modify: `app/admin/produkty/page.tsx` (import + badge + przycisk)

- [ ] **Step 1: Server action `setProductActive`**

W `app/admin/produkty/actions.ts` (po `updateProductBasics`):
```ts
// Ręczne ukrycie/przywrócenie. Ukrycie → deactivation_source='manual'
// (sync NIE reaktywuje). Przywrócenie → null.
export async function setProductActive(
  productId: string,
  active: boolean
): Promise<ActionResult> {
  await requireAdmin();
  if (!productId) return { ok: false, error: "Brak id produktu" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({
      is_active: active,
      deactivation_source: active ? null : "manual",
    } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  revalidatePath("/");
  return { ok: true, message: active ? "Produkt przywrócony" : "Produkt ukryty" };
}
```

- [ ] **Step 2: Client component `ToggleProductActiveButton`**

```tsx
"use client";

import { useState, useTransition } from "react";
import { setProductActive } from "./actions";

export default function ToggleProductActiveButton({
  productId,
  isActive,
}: {
  productId: string;
  isActive: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  function handleClick() {
    setErr(null);
    startTransition(async () => {
      const res = await setProductActive(productId, !isActive);
      if (!res.ok) setErr(res.error);
    });
  }

  return (
    <div className="shrink-0 flex flex-col items-end gap-1">
      <button
        onClick={handleClick}
        disabled={pending}
        className="px-4 py-2 text-xs font-sans uppercase tracking-widest rounded-lg border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {pending ? "..." : isActive ? "Ukryj" : "Przywróć"}
      </button>
      {err && <span className="text-[10px] text-red-600">{err}</span>}
    </div>
  );
}
```

- [ ] **Step 3: Badge + przycisk w `page.tsx`**

Import (po linii 7):
```tsx
import DeleteProductButton from "./DeleteProductButton";
import ToggleProductActiveButton from "./ToggleProductActiveButton";
```
Badge przy nazwie (po `<p ...>{p.name}` → przed `</p>` zamykającym nazwę):
```tsx
                  <p className="font-display text-base font-semibold text-[var(--fg)] truncate">
                    {p.name}
                    {!p.is_active && (
                      <span className="ml-2 align-middle px-2 py-0.5 text-[10px] font-sans uppercase tracking-widest rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        ukryty
                      </span>
                    )}
                  </p>
```
Przed `<DeleteProductButton .../>`:
```tsx
                <ToggleProductActiveButton productId={p.id} isActive={p.is_active} />
                <DeleteProductButton productId={p.id} productName={p.name} />
```

- [ ] **Step 4: Build + lint + commit**

Run: `npm run build` → SUCCESS. Run: `npm run lint` → OK.
```powershell
git add app/admin/produkty/actions.ts app/admin/produkty/ToggleProductActiveButton.tsx app/admin/produkty/page.tsx
git commit -m @'
feat(admin): ręczny toggle Ukryj/Przywróć produkt + badge „ukryty"

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# Weryfikacja end-to-end (po zaaplikowaniu migracji 23 + 24 w Supabase)

Po wszystkich taskach i zaaplikowaniu obu migracji przez właściciela, potwierdź ręcznie:

- [ ] Sync nowego produktu z BL: ustawia nazwę/cenę/kategorię/zdjęcia/cechy; `variants` i `description_sections` puste (admin uzupełnia ręcznie); kolejny sync NIE nadpisuje ręcznie wpisanych wariantów/opisu.
- [ ] Produkt usunięty z BL → po sync `is_active=false`, znika z `/sklep`/wyszukiwarki/sitemap, strona daje 404 (niezalogowany); rekord + historia zamówień zostają; powrót do BL → auto-reaktywacja (sekcja „Przywrócono").
- [ ] Produkt ukryty RĘCZNIE (badge „ukryty") — kolejny sync go NIE przywraca.
- [ ] Niezmapowana kategoria BL → produkt pominięty, panel pokazuje **banner K2** (lista ID + CTA), widoczny też po przeładowaniu (z historii).
- [ ] Pominięte rozdzielone na „do poprawienia w BL" / „błąd techniczny".
- [ ] Nowy produkt bez plain `description`: meta-SEO/fallback generowane z `description_sections`.
- [ ] `npm test` zielony; `npm run build` + `npm run lint` czyste (brak resztek po usuniętym parserze).

Przypomnienie dla właściciela: **zaaplikuj `23_products_is_active.sql` i `24_baselinker_sync_log_report.sql` w Supabase.**

---

# Self-Review (autor planu)

**1. Pokrycie specu (z Rewizją 2026-06-09):**
- `is_active` + RLS + 404 → Task 1, 2 ✓ (404 „za darmo" przez RLS: `getProduct`→null→`notFound()`).
- Chudy sync (bez opisów/wariantów, preserve) → Task 5 ✓. Cechy/zdjęcia zostają + quality fix → Task 4 ✓.
- Usunięcie martwego parsera/merge → Task 5 ✓. Usunięcie pasków pokrycia → Task 6 ✓.
- SEO/fallback z sekcji → Task 7 ✓.
- Auto-ukrywanie + bezpieczniki + reaktywacja + raport → Task 8, 9 ✓.
- Retry odczytów → Task 10 ✓. Kategoryzacja owner/technical → Task 11 ✓.
- Banner K2 niezmapowanych kategorii (+persystencja) → Task 12, 13 ✓.
- Ręczny toggle → Task 15 ✓. Grupy błędów w panelu → Task 14 ✓.
- Vitest + testy czystych funkcji → Task 3, 4, 8, 10, 12 ✓.

**2. Skan placeholderów:** brak „TBD/TODO" w krokach modyfikujących kod. Świadomy open-item: `TRANSIENT_BL_ERROR_CODES` (kod rate-limit BL do potwierdzenia — retry działa dla 5xx/429/sieci niezależnie). Task 5/6 zawierają „delete" z dokładnymi symbolami+liniami (nie placeholder — to operacja usunięcia weryfikowana build+lint).

**3. Spójność typów/nazw:**
- `is_active`/`deactivation_source` spójne: types.ts, migracja 23, `mapBlToProduct` (default Task 2), pętla reaktywacji (Task 9), `setProductActive` (Task 15) ✓.
- `SyncProductFields = Omit<ProductInsert, "variants"|"description_sections"|"description">` — wprowadzony w Task 5, użyty w `mapBlToProduct` (Task 5) i sygnaturze zwrotu (Task 11) ✓.
- `UnmappedCategory {bl_category_id, sample_product_name, count}` — spójny: helper, `SyncOutcome` (Task 9), persystencja (Task 12), `SyncReportData` w UI (Task 13) ✓.
- `SyncSkippedProduct.kind` opcjonalny — UI (Task 14) traktuje `undefined` jak owner ✓.
- `report` jsonb (migracja 24) ↔ `SyncLogRow.report` ↔ `SyncReportData` w `LogRow` (Task 13) ✓.
- `resolveBlFeatures`/`pickFirstImage` (Task 4) — zostają po Task 5; testy Task 4 przeżywają usunięcie parsera (nie testują usuwanych funkcji) ✓.

**Ryzyka pilnowane w trakcie:**
- Task 5 deletion: po usunięciu parsera lint może wskazać resztki importów (`BLVariant`, `ProductVariants` itd.) — usunąć (krok build+lint w tasku).
- Task 7: potwierdzić pola tekstowej sekcji (`body`/`admin_body`/`hidden`) z `types.ts` (Step 1) przed użyciem helpera.
- Każdy task kończy build (+test gdzie dotyczy) zielono; kolejność tak dobrana, by stany pośrednie się kompilowały (Task 5 usuwa użycie zanim Task 6 tnie typy coverage; Task 9 operuje na slim loop).
