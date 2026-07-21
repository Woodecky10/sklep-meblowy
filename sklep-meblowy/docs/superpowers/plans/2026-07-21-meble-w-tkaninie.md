# „Meble w tej tkaninie" (wybór produktów zamiast zdjęć z produkcji) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zastąpić model „ręcznie wgrywane zdjęcia z produkcji na tkaninie" (kolumna `production_photos`, migr. 58) modelem „admin wybiera produkty" — strona tkaniny pokazuje wybrane produkty jako siatkę kafelków (główne zdjęcie + nazwa) linkujących do `/produkt/[id]`.

**Architecture:** Nowa kolumna `fabrics.featured_product_ids jsonb` (tablica id produktów) zastępuje `production_photos`. Czysty parser `parseFeaturedProductIds` waliduje wejście z formularza. Admin (`FabricForm`) dostaje wyszukiwarkę + listę produktów z checkboxami (wzorzec z `/admin/zestawy`). Strona tkaniny dociąga produkty jednym zapytaniem `in()` (tylko aktywne, kolejność wg zapisanej listy) i renderuje przez nowy **server-component** `FabricFeaturedProducts`.

**Tech Stack:** Next.js (App Router, wersja z breaking changes — patrz Global Constraints), TypeScript, Supabase (Postgres + JSONB), Vitest, Tailwind (zmienne CSS motywu).

## Global Constraints

- **AGENTS.md:** To NIE jest znany ci Next.js — przed pisaniem kodu Next (server/client components, server actions) przejrzyj właściwy guide w `node_modules/next/dist/docs/`. Zwracaj uwagę na deprecation notices.
- **Implementacja przez subagentów na Opusie** (stała zasada repo): każdy task deleguj przez Agent tool z `model:"opus"`; review po każdym tasku.
- **Ceny/waluta, i18n:** nazwy produktów lokalizowane przez `pickLocalized(name, name_de, locale)`. Admin jest PL-only (miniatury/nazwy po PL).
- **Zdjęcia:** plain `<img>` z `// eslint-disable-next-line @next/next/no-img-element` (wzorzec repo dla URL-i ze storage w tych plikach).
- **Limit:** max 20 wybranych produktów (`MAX_FEATURED_PRODUCTS`), dedupe, kolejność = kolejność dodawania.
- **Nagłówek sekcji:** PL „Meble w tej tkaninie", DE „Möbel in diesem Stoff".
- **Testy:** `npm test` = Vitest. `npx tsc --noEmit` musi być zielone. Build: `npm run build`.
- **Git:** praca na gałęzi `feat/meble-w-tkaninie` (już utworzona, spec już zacommitowany). Konto gh do PR: Woodecky10.
- **Spec:** `docs/superpowers/specs/2026-07-21-meble-w-tkaninie-design.md`.

---

## File Structure

- **Create:**
  - `app/_lib/fabric-featured-products.ts` — czysty parser `parseFeaturedProductIds` + stała `MAX_FEATURED_PRODUCTS` (zastępuje `fabric-production-photos.ts`).
  - `app/_lib/__tests__/fabric-featured-products.test.ts` — testy parsera.
  - `supabase/migrations/59_fabric_featured_products.sql` — dodaje `featured_product_ids`, upuszcza `production_photos`.
  - `app/_components/ui/FabricFeaturedProducts.tsx` — server-component siatki kafelków produktów.
- **Modify:**
  - `app/_lib/types.ts` — usuń `FabricProductionPhoto`; w `Fabric`: `production_photos` → `featured_product_ids: string[]`.
  - `app/_lib/dictionaries/pl.ts`, `de.ts` — tekst `productionHeading`.
  - `app/admin/tkaniny/actions.ts` — parser/walidacja/zapis pod nowy model.
  - `app/admin/tkaniny/page.tsx` — zapytanie pickera `id, name, images` + mapowanie na `{id,name,image}`.
  - `app/admin/tkaniny/FabricsEditor.tsx` — sekcja wyboru produktów (wyszukiwarka + lista + wybrane).
  - `app/tkaniny/[slug]/page.tsx` — dociąganie wybranych produktów + render nowym komponentem.
  - `app/_lib/__tests__/fabric-groups.test.ts` — fixture `production_photos: []` → `featured_product_ids: []`.
- **Delete:**
  - `app/_lib/fabric-production-photos.ts`, `app/_lib/__tests__/fabric-production-photos.test.ts`.
  - `app/_components/ui/FabricProductionPhotos.tsx`.
- **Bez zmian:** `ImageLightbox.tsx` (nadal używany przez `FabricSwatchGrid`), `fabrics.ts` (`select("*")` — nowa kolumna dojdzie sama), `variants.ts`, propagacja dopłat, katalog `/tkaniny`, sitemap.

---

## Task 1: Czysty parser `parseFeaturedProductIds` (+ testy)

Zadanie izolowane i addytywne: tworzy nowy plik obok starego. Stary `fabric-production-photos.ts` zostaje jeszcze używany przez `actions.ts` (usuwany w Task 2), więc build pozostaje zielony.

**Files:**
- Create: `app/_lib/fabric-featured-products.ts`
- Test: `app/_lib/__tests__/fabric-featured-products.test.ts`

**Interfaces:**
- Produces:
  - `export const MAX_FEATURED_PRODUCTS = 20`
  - `export function parseFeaturedProductIds(input: unknown): string[]` — JSON string → tablica niepustych, przyciętych, zdeduplikowanych id (kolejność pierwszego wystąpienia), max `MAX_FEATURED_PRODUCTS`. Nie-string / zły JSON / nie-tablica → `[]`.

- [ ] **Step 1: Napisz test (failing)**

Create `app/_lib/__tests__/fabric-featured-products.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseFeaturedProductIds, MAX_FEATURED_PRODUCTS } from "../fabric-featured-products";

describe("parseFeaturedProductIds", () => {
  it("parsuje poprawne id, trim, zachowuje kolejność", () => {
    const input = JSON.stringify([" p1 ", "p2", "p3"]);
    expect(parseFeaturedProductIds(input)).toEqual(["p1", "p2", "p3"]);
  });
  it("odrzuca nie-stringi i puste; dedupe zachowuje pierwsze wystąpienie", () => {
    const input = JSON.stringify(["p1", "", "   ", 42, null, "p2", "p1"]);
    expect(parseFeaturedProductIds(input)).toEqual(["p1", "p2"]);
  });
  it("zły JSON / nie-string / nie-tablica → []", () => {
    expect(parseFeaturedProductIds("nie json")).toEqual([]);
    expect(parseFeaturedProductIds(undefined)).toEqual([]);
    expect(parseFeaturedProductIds(JSON.stringify({ id: "p1" }))).toEqual([]);
  });
  it("tnie do MAX_FEATURED_PRODUCTS (licząc tylko unikalne)", () => {
    const rows = Array.from({ length: MAX_FEATURED_PRODUCTS + 5 }, (_, i) => `p${i}`);
    expect(parseFeaturedProductIds(JSON.stringify(rows))).toHaveLength(MAX_FEATURED_PRODUCTS);
  });
});
```

- [ ] **Step 2: Uruchom test — ma się nie skompilować/failować**

Run: `npm test -- fabric-featured-products`
Expected: FAIL — `Cannot find module '../fabric-featured-products'`.

- [ ] **Step 3: Implementacja parsera**

Create `app/_lib/fabric-featured-products.ts`:

```ts
// Wybrane produkty pokazywane w sekcji „Meble w tej tkaninie" na stronie
// tkaniny — CZYSTY parser wartości z formularza admina (hidden input
// featured_product_ids_json). Wzorzec parseColorRows z app/admin/tkaniny/
// actions.ts: zły JSON → [], tylko niepuste stringi, dedupe z zachowaniem
// kolejności pierwszego wystąpienia, twardy limit wierszy.

export const MAX_FEATURED_PRODUCTS = 20;

export function parseFeaturedProductIds(input: unknown): string[] {
  if (typeof input !== "string") return [];
  let rows: unknown;
  try {
    rows = JSON.parse(input);
  } catch {
    return [];
  }
  if (!Array.isArray(rows)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (out.length >= MAX_FEATURED_PRODUCTS) break;
    if (typeof r !== "string") continue;
    const id = r.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}
```

- [ ] **Step 4: Uruchom test — PASS**

Run: `npm test -- fabric-featured-products`
Expected: PASS (4 testy).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabric-featured-products.ts app/_lib/__tests__/fabric-featured-products.test.ts
git commit -m "feat(tkaniny): parseFeaturedProductIds — czysty parser wyboru produktow"
```

---

## Task 2: Przełączenie modelu (data model + admin + strona tkaniny)

Atomowa zamiana: zmiana typu `Fabric` wymusza jednoczesną aktualizację wszystkich konsumentów, więc całość ląduje w jednym commicie (build zielony dopiero po całości). Dostarcza: `tsc` + lint + Vitest + build zielone.

**Files:**
- Create: `supabase/migrations/59_fabric_featured_products.sql`, `app/_components/ui/FabricFeaturedProducts.tsx`
- Modify: `app/_lib/types.ts`, `app/_lib/dictionaries/pl.ts`, `app/_lib/dictionaries/de.ts`, `app/admin/tkaniny/actions.ts`, `app/admin/tkaniny/page.tsx`, `app/admin/tkaniny/FabricsEditor.tsx`, `app/tkaniny/[slug]/page.tsx`, `app/_lib/__tests__/fabric-groups.test.ts`
- Delete: `app/_lib/fabric-production-photos.ts`, `app/_lib/__tests__/fabric-production-photos.test.ts`, `app/_components/ui/FabricProductionPhotos.tsx`

**Interfaces:**
- Consumes (z Task 1): `parseFeaturedProductIds`, `MAX_FEATURED_PRODUCTS` z `@/app/_lib/fabric-featured-products`.
- Produces:
  - `Fabric.featured_product_ids: string[]` (w `types.ts`).
  - `FabricPickerProduct = { id: string; name: string; image: string | null }` (export z `FabricsEditor.tsx`).
  - `FabricFeaturedProducts` (default export) — props `{ products: { id: string; name: string; image: string | null }[] }`.

- [ ] **Step 1: Plik migracji**

Create `supabase/migrations/59_fabric_featured_products.sql`:

```sql
-- Migracja 59: model „zdjęć z produkcji" na tkaninie zmieniony z ręcznie
-- wgrywanych zdjęć (production_photos, migr. 58) na WYBÓR PRODUKTÓW.
-- featured_product_ids = tablica id produktów pokazywanych w sekcji
-- „Meble w tej tkaninie" na /tkaniny/[slug] (kolejność = kolejność w tablicy).
-- Idempotentnie. UWAGA: drop production_photos wycofuje stary model — przed
-- zastosowaniem na prodzie sprawdzić, czy nie ma tam realnych danych (Task 3).
alter table public.fabrics
  add column if not exists featured_product_ids jsonb not null default '[]'::jsonb;

alter table public.fabrics
  drop column if exists production_photos;
```

- [ ] **Step 2: Typy (`app/_lib/types.ts`)**

Usuń cały blok `FabricProductionPhoto` (komentarz + type, ~linie 180–186):

```ts
// Zdjęcie z produkcji na stronie tkaniny (migracja 58) — mebel uszyty w tej
// tkaninie. product_id opcjonalnie linkuje do produktu (klikalna karta);
// null / produkt nieaktywny → samo zdjęcie bez linku.
export type FabricProductionPhoto = {
  url: string;
  product_id: string | null;
};
```

W typie `Fabric` zamień pole:

```ts
  // Zdjęcia z produkcji (kolejność = kolejność w tablicy; max 20 w adminie).
  production_photos: FabricProductionPhoto[];
```

na:

```ts
  // Wybrane produkty pokazywane w sekcji „Meble w tej tkaninie" na stronie
  // tkaniny (kolejność = kolejność w tablicy; max 20 w adminie). Nieznane/
  // nieaktywne id pomijane przy renderze.
  featured_product_ids: string[];
```

- [ ] **Step 3: Słownik — nagłówek**

`app/_lib/dictionaries/pl.ts` (linia ~443): zamień
`productionHeading: "Ta tkanina na naszych meblach",`
na
`productionHeading: "Meble w tej tkaninie",`

`app/_lib/dictionaries/de.ts` (linia ~107): zamień
`productionHeading: "Dieser Stoff auf unseren Möbeln",`
na
`productionHeading: "Möbel in diesem Stoff",`

(Klucz `productionHeading: string;` w typie słownika — bez zmian.)

- [ ] **Step 4: Server action (`app/admin/tkaniny/actions.ts`)**

Zamień importy (linie 16–17):

```ts
import { parseProductionPhotos } from "@/app/_lib/fabric-production-photos";
import type { FabricProductionPhoto } from "@/app/_lib/types";
```

na:

```ts
import { parseFeaturedProductIds } from "@/app/_lib/fabric-featured-products";
```

Zamień funkcję `validatePhotoProducts` (linie ~81–97) na:

```ts
// Walidacja serwerowa wybranych produktów: jedno zapytanie in(); zostają tylko
// istniejące id (kolejność zachowana). Przy błędzie zapytania zwraca ids bez
// zmian, żeby przejściowy błąd DB nie wyzerował wyboru admina.
async function validateFeaturedProducts(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  ids: string[]
): Promise<string[]> {
  if (ids.length === 0) return ids;
  const { data, error } = await supabase.from("products").select("id").in("id", ids);
  if (error) return ids;
  const known = new Set(((data ?? []) as { id: string }[]).map((r) => r.id));
  return ids.filter((id) => known.has(id));
}
```

W `createFabric` zamień:

```ts
  const rawPhotos = parseProductionPhotos(formData.get("production_photos_json"));

  const supabase = await createAdminClient();
  const productionPhotos = await validatePhotoProducts(supabase, rawPhotos);
```

na:

```ts
  const rawFeatured = parseFeaturedProductIds(formData.get("featured_product_ids_json"));

  const supabase = await createAdminClient();
  const featuredProductIds = await validateFeaturedProducts(supabase, rawFeatured);
```

oraz w obiekcie `.insert({...})` zamień `production_photos: productionPhotos,` na `featured_product_ids: featuredProductIds,`.

W `updateFabric` zamień:

```ts
  const rawPhotos = parseProductionPhotos(formData.get("production_photos_json"));

  const supabase = await createAdminClient();
  const productionPhotos = await validatePhotoProducts(supabase, rawPhotos);
```

na:

```ts
  const rawFeatured = parseFeaturedProductIds(formData.get("featured_product_ids_json"));

  const supabase = await createAdminClient();
  const featuredProductIds = await validateFeaturedProducts(supabase, rawFeatured);
```

oraz w obiekcie `.update({...})` zamień `production_photos: productionPhotos,` na `featured_product_ids: featuredProductIds,`.

- [ ] **Step 5: Loader pickera (`app/admin/tkaniny/page.tsx`)**

Zamień zapytanie produktów oraz mapowanie propsa. Był:

```ts
    // Picker do zdjęć z produkcji: tylko aktywne, po nazwie (wzorzec zestawów).
    supabase
      .from("products")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);
  return (
    <FabricsEditor
      initialFabrics={fabrics}
      groups={groups}
      pickerProducts={(productRows ?? []) as FabricPickerProduct[]}
    />
  );
```

na:

```ts
    // Picker „Meble w tej tkaninie": aktywne produkty z miniaturą, po nazwie.
    supabase
      .from("products")
      .select("id, name, images")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);
  const pickerProducts: FabricPickerProduct[] = (
    (productRows ?? []) as { id: string; name: string; images: string[] | null }[]
  ).map((p) => ({ id: p.id, name: p.name, image: p.images?.[0] ?? null }));
  return (
    <FabricsEditor
      initialFabrics={fabrics}
      groups={groups}
      pickerProducts={pickerProducts}
    />
  );
```

- [ ] **Step 6: Nowy server-component siatki (`app/_components/ui/FabricFeaturedProducts.tsx`)**

Create:

```tsx
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Sekcja „Meble w tej tkaninie" na stronie tkaniny: siatka kafelków wybranych
// produktów (główne zdjęcie + nazwa) → /produkt/[id]. Server component (bez
// interakcji). Wygląd jak kafelki katalogu /tkaniny.
export default function FabricFeaturedProducts({
  products,
}: {
  products: { id: string; name: string; image: string | null }[];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
      {products.map((p) => (
        <LocalizedLink
          key={p.id}
          href={`/produkt/${p.id}`}
          className="group flex flex-col gap-3"
        >
          <span className="relative aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image}
                alt={p.name}
                loading="lazy"
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <span className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">
                {p.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <span className="font-sans text-sm text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
            {p.name}
          </span>
        </LocalizedLink>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Strona tkaniny (`app/tkaniny/[slug]/page.tsx`)**

Zamień import komponentu (linia 13):

```ts
import FabricProductionPhotos from "@/app/_components/ui/FabricProductionPhotos";
```

na:

```ts
import FabricFeaturedProducts from "@/app/_components/ui/FabricFeaturedProducts";
```

Zamień blok dociągania zdjęć (obecnie linie ~57–82, od komentarza „Zdjęcia z produkcji…" przez budowę `productionPhotos`) na:

```ts
  // Wybrane produkty („Meble w tej tkaninie"): defensywne ?? [] (stary cache
  // bez kolumny). Dociągnięcie jednym zapytaniem, tylko aktywne; kolejność wg
  // zapisanej listy, nieznane/nieaktywne pominięte.
  const featuredIds = fabric.featured_product_ids ?? [];
  let featuredProducts: { id: string; name: string; image: string | null }[] = [];
  if (featuredIds.length > 0) {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("products")
      .select("id, name, name_de, images")
      .eq("is_active", true)
      .in("id", featuredIds);
    const byId = new Map(
      (
        (data ?? []) as {
          id: string;
          name: string;
          name_de: string | null;
          images: string[] | null;
        }[]
      ).map((p) => [p.id, p])
    );
    featuredProducts = featuredIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        id: p.id,
        name: pickLocalized(p.name, p.name_de, locale),
        image: p.images?.[0] ?? null,
      }));
  }
```

Zamień blok renderu sekcji (obecnie linie ~144–154, `{photos.length > 0 && (...)}`) na:

```tsx
      {featuredProducts.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
            {t.fabrics.productionHeading}
          </h2>
          <FabricFeaturedProducts products={featuredProducts} />
        </section>
      )}
```

(Importy `createAdminClient` i `pickLocalized` już są w tym pliku — bez zmian.)

- [ ] **Step 8: Admin picker (`app/admin/tkaniny/FabricsEditor.tsx`)**

8a. Importy — na górze pliku zamień:

```ts
import { useState, useTransition } from "react";
```
na
```ts
import { useMemo, useState, useTransition } from "react";
```

Dodaj po istniejących importach (obok innych `@/app/_lib`):
```ts
import { normalizeSearchText } from "@/app/_lib/search-normalize";
import { MAX_FEATURED_PRODUCTS } from "@/app/_lib/fabric-featured-products";
```

Usuń nieużywany po zmianie import uploadu zdjęć per wiersz produkcji:
```ts
import { uploadProductImageFile } from "@/app/admin/produkty/[id]/_shared";
```
(`uploadProductImage` i `compressIfNeeded` ZOSTAJĄ — używane przez sekcję „Kolory / numery".)

Zamień import typów (linia 13):
```ts
import type { Fabric, FabricPriceGroup, FabricProductionPhoto } from "@/app/_lib/types";
```
na
```ts
import type { Fabric, FabricPriceGroup } from "@/app/_lib/types";
```

8b. Typ pickera — zamień:
```ts
// Produkt w pickerze zdjęć z produkcji (lista z page.tsx — tylko aktywne).
export type FabricPickerProduct = { id: string; name: string };
```
na:
```ts
// Produkt w pickerze „Meble w tej tkaninie" (lista z page.tsx — tylko aktywne).
export type FabricPickerProduct = { id: string; name: string; image: string | null };
```

8c. W komponencie `FabricForm` usuń CAŁY stan i handlery zdjęć z produkcji (obecnie linie ~233–276): `type PhotoRow`, `photoRows`, `uploadingPhotoIdx`, `photoError`, `productListId`, `addPhotoRow`, `removePhotoRow`, `setPhotoProduct`, `uploadPhotoForRow`. Zamień je na stan wyboru produktów:

```ts
  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial?.featured_product_ids ?? []
  );
  const [productQuery, setProductQuery] = useState("");
  const productById = useMemo(
    () => new Map(pickerProducts.map((p) => [p.id, p])),
    [pickerProducts]
  );
  const filteredProducts = useMemo(() => {
    const q = normalizeSearchText(productQuery);
    if (!q) return pickerProducts;
    return pickerProducts.filter((p) => normalizeSearchText(p.name).includes(q));
  }, [pickerProducts, productQuery]);
  function toggleProduct(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_FEATURED_PRODUCTS
          ? prev
          : [...prev, id]
    );
  }
```

8d. Zamień CAŁĄ sekcję JSX „Zdjęcia z produkcji" (obecnie linie ~435–534, od komentarza `{/* Zdjęcia z produkcji … */}` do zamykającego `</div>` przed blokiem przycisków submit) na:

```tsx
      {/* Meble w tej tkaninie — wybór produktów (bez wgrywania zdjęć). Strona
          tkaniny pokazuje je jako siatkę kafelków → /produkt/[id]. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Meble w tej tkaninie
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Wybierz produkty pokazywane w sekcji &bdquo;Meble w tej tkaninie&rdquo;
          na stronie tkaniny (główne zdjęcie + nazwa, klik → karta produktu).
          Kolejność = kolejność dodawania. Max {MAX_FEATURED_PRODUCTS}.
        </p>
        <input
          type="hidden"
          name="featured_product_ids_json"
          readOnly
          value={JSON.stringify(selectedIds)}
        />

        {/* Wybrane (w kolejności wyświetlania) */}
        {selectedIds.length === 0 ? (
          <span className="text-xs text-[var(--muted)] italic">
            Nie wybrano produktów.
          </span>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedIds.map((id) => {
              const p = productById.get(id);
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2"
                >
                  <span className="relative w-16 h-12 shrink-0 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card-bg)]">
                    {p?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-[10px] text-[var(--muted)]">
                        brak
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">
                    {p?.name ?? "(produkt nieaktywny lub usunięty)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleProduct(id)}
                    aria-label="Usuń produkt"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Szukaj i dodaj */}
        <input
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          placeholder="Szukaj produktu do dodania…"
          className={`${inputCls} mt-1`}
        />
        <ul className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {filteredProducts.map((p) => {
            const active = selectedIds.includes(p.id);
            const atLimit = selectedIds.length >= MAX_FEATURED_PRODUCTS;
            return (
              <li key={p.id}>
                <label
                  className={`flex items-center gap-3 p-2 transition-colors ${
                    active
                      ? "bg-[var(--color-gold)]/10 cursor-pointer"
                      : atLimit
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[var(--bg)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={!active && atLimit}
                    onChange={() => toggleProduct(p.id)}
                    className="h-4 w-4 accent-[var(--color-gold)]"
                  />
                  <span className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[var(--card-bg)] border border-[var(--border)]">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">
                    {p.name}
                  </span>
                </label>
              </li>
            );
          })}
          {filteredProducts.length === 0 && (
            <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
          )}
        </ul>
      </div>
```

- [ ] **Step 9: Fixture testu grupowania (`app/_lib/__tests__/fabric-groups.test.ts`)**

Zamień w fixture (linia ~30) `production_photos: [],` na `featured_product_ids: [],`.

- [ ] **Step 10: Usuń pliki starego modelu**

```bash
git rm app/_lib/fabric-production-photos.ts \
       app/_lib/__tests__/fabric-production-photos.test.ts \
       app/_components/ui/FabricProductionPhotos.tsx
```

- [ ] **Step 11: Weryfikacja — brak odwołań do starego modelu**

Run: `grep -rn "production_photos\|FabricProductionPhoto\|parseProductionPhotos\|validatePhotoProducts\|fabric-production-photos" app/`
Expected: BRAK wyników (pusto).

- [ ] **Step 12: tsc + lint + testy + build**

Run: `npx tsc --noEmit`
Expected: brak błędów.

Run: `npm run lint`
Expected: brak błędów (ew. tylko istniejące ostrzeżenia repo).

Run: `npm test`
Expected: wszystkie testy PASS (w tym `fabric-featured-products` i `fabric-groups`).

Run: `npm run build`
Expected: build zielony.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(tkaniny): 'Meble w tej tkaninie' — wybor produktow zamiast zdjec z produkcji

Kolumna featured_product_ids (migr. 59) zastepuje production_photos. Admin
wybiera produkty (wyszukiwarka + lista), strona tkaniny renderuje siatke
kafelkow (glowne zdjecie + nazwa) -> /produkt/[id] przez FabricFeaturedProducts.
Usuniety stary model (upload zdjec + lightbox tej sekcji)."
```

---

## Task 3: Weryfikacja end-to-end (skill `verify`) + PR

**Files:** brak zmian kodu (weryfikacja + PR).

- [ ] **Step 1: Uruchom aplikację i przejdź ścieżkę** (skill `verify` / `run`):
  - `/admin/tkaniny` → edytuj tkaninę → w sekcji „Meble w tej tkaninie" wyszukaj i zaznacz 2 produkty → Zapisz. Wejdź ponownie w edycję → zaznaczenie i kolejność zachowane.
  - `/tkaniny/[slug]` (PL) → sekcja „Meble w tej tkaninie" pokazuje 2 kafelki (główne zdjęcie + nazwa); klik → `/produkt/[id]`.
  - `/de/tkaniny/[slug]` → nagłówek „Möbel in diesem Stoff", nazwy produktów po DE (fallback PL).
  - Tkanina bez wybranych produktów → sekcja się nie renderuje.
- [ ] **Step 2: Utwórz PR** (`gh`, konto Woodecky10) z gałęzi `feat/meble-w-tkaninie` do `main`. W opisie: streszczenie, checklista klik-testów dla Mikołaja na prodzie, przypomnienie o migracji 59 (Step 3 poniżej).

---

## Task 4: Migracja 59 na prodzie (Supabase MCP) — przy/po merge, z potwierdzeniem

**Wykonywane w głównej pętli (nie subagent), bo dotyka ŻYWEJ bazy = PROD.** Model: pokaż SQL → potwierdź z użytkownikiem → wykonaj. Wymaga aktywnego połączenia MCP (`/mcp` authenticate jeśli trzeba).

- [ ] **Step 1: Pre-check danych** — przez `mcp__supabase__execute_sql`:
  ```sql
  select count(*) filter (where production_photos is not null
    and production_photos <> '[]'::jsonb) as z_danymi
  from public.fabrics;
  ```
  Jeśli `z_danymi > 0` → zgłoś użytkownikowi PRZED dropem (stary model miał realne dane; potwierdź świadome wycofanie). Jeśli kolumna `production_photos` nie istnieje (migr. 58 nie doszła) — zapytanie rzuci błąd; wtedy pomiń pre-check.
- [ ] **Step 2: Zastosuj migrację** — `mcp__supabase__apply_migration` z treścią `59_fabric_featured_products.sql` (idempotentnie).
- [ ] **Step 3: Weryfikacja** — `mcp__supabase__list_tables` (lub `execute_sql` na `information_schema.columns`): potwierdź, że `fabrics` ma `featured_product_ids` i NIE ma `production_photos`.
- [ ] **Step 4:** Zaktualizuj pamięć (memory) o stanie migracji 59 na prodzie i statusie PR.

---

## Self-Review (autor planu)

**Spec coverage:**
- Cel 1 (admin: wybór produktów bez uploadu) → Task 2 Step 8. ✅
- Cel 2 (sekcja „Meble w tej tkaninie": siatka kafelków → /produkt/[id]) → Task 2 Step 6 + 7. ✅
- Cel 3 (wycofanie starego modelu + drop kolumny) → Task 2 Step 1/2/10 + Task 4. ✅
- Model danych (migr. 59, typ `featured_product_ids: string[]`) → Task 2 Step 1/2. ✅
- Pure lib `parseFeaturedProductIds` + testy → Task 1. ✅
- Akcje (parse/validate/save) → Task 2 Step 4. ✅
- Loader pickera z miniaturą → Task 2 Step 5. ✅
- Słownik (nagłówek PL/DE) → Task 2 Step 3. ✅
- Przypadki brzegowe (nieaktywny/usunięty pominięty, dedupe, brak → brak sekcji, brak zdjęcia → placeholder, stary cache → `?? []`) → parser (Task 1), `validateFeaturedProducts` + render z filtrem `is_active` i `?? []` (Task 2 Step 4/7), placeholder w komponencie (Step 6). ✅
- Testy (unit + tsc/lint/build/smoke) → Task 1 Step 4, Task 2 Step 12, Task 3. ✅
- Uwagi wdrożeniowe (pre-check danych 58, drop, weryfikacja po) → Task 4. ✅

**Placeholder scan:** brak TBD/TODO; każdy krok kodu ma pełną treść. ✅

**Type consistency:** `FabricPickerProduct = {id,name,image}` spójne w `FabricsEditor.tsx` (def), `page.tsx` (map), i props komponentu; `featured_product_ids: string[]` spójne w types/actions/FabricsEditor/page; `parseFeaturedProductIds`/`MAX_FEATURED_PRODUCTS`/`validateFeaturedProducts` używane pod tymi samymi nazwami. ✅
