# Płynne filtry na /sklep — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Klik w filtr/wyszukiwanie reaguje natychmiast (optymistyczne UI + wskaźnik pending), a server-render /sklep traci ~połowę latencji (cache facetów i kursu EUR z inwalidacją tagami, spłaszczenie wodospadu zapytań).

**Architecture:** (A) `FilterBar` przechodzi na `useTransition` + lokalny optymistyczny stan query (`pendingQuery`) — WSZYSTKIE stany zaznaczenia liczone z `effectiveParams` zamiast `useSearchParams`; `SearchBox` analogicznie. (B) Nowe cachowane źródło facetów (`unstable_cache`, tag `facets`, czysty klient anon bez cookies) + cache kursu EUR (tag `eur-rate`) + inwalidacja w akcjach admina; na stronie /sklep wishlist+kurs wchodzą do pierwszego `Promise.all`.

**Tech Stack:** Next.js 16 (App Router, `unstable_cache`/`revalidateTag` — wzorzec już w repo: `app/_lib/fabrics.ts`), React `useTransition`, Supabase (`@supabase/supabase-js` bare anon client), Playwright (public, bez logowania).

## Global Constraints

- Optymistyczny stan: kliknięty chip/suwak/sort/ActiveChip zaznacza się NATYCHMIAST (z `pendingQuery`), wskaźnik pending widoczny gdy `isPending || pendingQuery !== null`, `aria-busy` na kontenerze FilterBara.
- Wewnątrz `unstable_cache` NIE wolno używać `cookies()` → dane produktów czytaj CZYSTYM klientem anon (`createClient(URL, ANON_KEY)` z `@supabase/supabase-js` — RLS jak gość, tylko `is_active`); fabrics przez `createAdminClient` (wzorzec `fetchAllFabrics` w fabrics.ts, działa w unstable_cache).
- Inwalidacja: `revalidateTag(TAG, "max")` (konwencja repo — fabrics.ts:39). Tag `facets` inwalidowany w akcjach admina mutujących produkty (basics/variants/delete/setActive/create) i tkaniny (create/update/delete). Tag `eur-rate` w `updateEurRate`.
- Cache NIE może zmienić WYNIKÓW filtrów — tylko czas. Smoke z filtra tkanin (Poso/sztruks/Stoff) musi przejść bez zmian.
- Zero nowych kluczy słownika (reużyj `t.search.searching`); test parytetu PL/DE bez zmian struktury.
- Konwencje repo: straight ASCII w stringach kodu (polska typografia OK w komentarzach/widocznym tekście), commity PL ze stopką `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`, stale `.next/dev/types` → `rm -rf .next`.
- AGENTS.md: przy wątpliwościach o API Next czytaj `node_modules/next/dist/docs/` (np. `ls node_modules/next/dist/docs` i szukaj `unstable_cache`/`revalidateTag`); wzorzec in-repo: `app/_lib/fabrics.ts`.
- Gałąź: `feat/plynne-filtry` (utworzona; spec zacommitowany).

## Plik po pliku

- Modify: `app/_components/ui/FilterBar.tsx` — useTransition + effectiveParams + pasek pending.
- Modify: `app/_components/layout/SearchBox.tsx` — pending przy nawigacji, modal zamyka się po zatwierdzeniu.
- Modify: `app/_lib/products.ts` — `getFacetSource` (unstable_cache) + `FACETS_CACHE_TAG` + `invalidateFacetsCache`; `getFilterFacets` = źródło+lokalizacja.
- Modify: `app/admin/produkty/actions.ts`, `app/admin/tkaniny/actions.ts` — wywołania `invalidateFacetsCache()`.
- Modify: `app/_lib/store-settings.ts` + `app/admin/ustawienia/actions.ts` — cache kursu + inwalidacja.
- Modify: `app/sklep/page.tsx` — spłaszczenie Promise.all.
- Create: `e2e/filter-pending.spec.ts`; Modify: `playwright.local.config.ts` (testMatch).

---

### Task 1: FilterBar — useTransition + optymistyczny stan URL + pasek pending

**Files:**
- Modify: `app/_components/ui/FilterBar.tsx` (importy :3; blok stanu :61-69; efekt ceny :99-120; update/toggleMulti :122-135; clearAll :170-180; kontener :183-186)

**Interfaces:**
- Produces (Task 5 e2e na tym polega): kontener FilterBara ma `aria-busy={true}` podczas pendingu; przyciski opcji dostają stan aktywny natychmiast po kliku (klasa `bg-[var(--color-gold)]`).

Brak unit-testu (komponent React, brak jsdom) — weryfikacja: tsc/eslint + e2e w Task 5.

- [ ] **Step 1: Import `useTransition`**

Zamień linię 3:
```tsx
import { useEffect, useRef, useState } from "react";
```
na:
```tsx
import { useEffect, useRef, useState, useTransition } from "react";
```

- [ ] **Step 2: Optymistyczny stan + derivacje z `effectiveParams`**

Zamień blok (obecnie linie 61-69):
```tsx
  const category = searchParams.get("kategoria") ?? "";
  const collection = searchParams.get("kolekcja") ?? "";
  const sort = searchParams.get("sortuj") ?? "alphabetic";
  const inStockOnly = searchParams.get("dostepne") === "1";
  const selectedColors = (searchParams.get("kolor") ?? "").split(",").filter(Boolean);
  const selectedMaterials = (searchParams.get("tkanina") ?? "").split(",").filter(Boolean);

  const [priceMin, setPriceMin] = useState(searchParams.get("cena_od") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("cena_do") ?? "");
```
na:
```tsx
  // Optymistyczny stan URL: useSearchParams aktualizuje się dopiero po
  // nadejściu odpowiedzi RSC (~setki ms), więc bez tego kliknięty chip/suwak
  // podświetlał się z opóźnieniem. pendingQuery = docelowe parametry ustawiane
  // od razu przy kliku; zwalniane gdy nawigacja się zatwierdzi. Szybkie
  // wieloklikanie: każdy klik nadpisuje pendingQuery (buduje na effectiveParams,
  // więc wybory się składają); zatwierdzenie starszej nawigacji może na moment
  // pokazać jej stan — akceptowalne, brak ryzyka "zawieszonego" pendingu.
  const [isPending, startTransition] = useTransition();
  const [pendingQuery, setPendingQuery] = useState<string | null>(null);
  const committedQuery = searchParams.toString();
  useEffect(() => {
    setPendingQuery(null);
  }, [committedQuery]);
  const effectiveParams = new URLSearchParams(pendingQuery ?? committedQuery);
  const showPending = isPending || pendingQuery !== null;

  const category = effectiveParams.get("kategoria") ?? "";
  const collection = effectiveParams.get("kolekcja") ?? "";
  const sort = effectiveParams.get("sortuj") ?? "alphabetic";
  const inStockOnly = effectiveParams.get("dostepne") === "1";
  const selectedColors = (effectiveParams.get("kolor") ?? "").split(",").filter(Boolean);
  const selectedMaterials = (effectiveParams.get("tkanina") ?? "").split(",").filter(Boolean);

  const [priceMin, setPriceMin] = useState(searchParams.get("cena_od") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("cena_do") ?? "");
```

- [ ] **Step 3: Wspólny `navigate()` + update/toggleMulti**

Zamień (obecnie 122-135):
```tsx
  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("strona");
    router.push(localizeHref(`/sklep?${params.toString()}`, locale));
  }

  function toggleMulti(key: string, current: string[], value: string) {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update(key, next.join(","));
  }
```
na:
```tsx
  // Jedyna ścieżka nawigacji filtrów: ustawia optymistyczny stan i odpala
  // router.push w transition (isPending → pasek pending pod FilterBarem).
  function navigate(params: URLSearchParams) {
    const qs = params.toString();
    setPendingQuery(qs);
    startTransition(() => {
      router.push(localizeHref(`/sklep?${qs}`, locale));
    });
  }

  function update(key: string, value: string) {
    // Baza = effectiveParams (nie searchParams): szybkie kliki składają się
    // zamiast nadpisywać nawzajem sprzed zatwierdzenia.
    const params = new URLSearchParams(effectiveParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("strona");
    navigate(params);
  }

  function toggleMulti(key: string, current: string[], value: string) {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update(key, next.join(","));
  }
```

- [ ] **Step 4: Efekt debounce ceny przez `navigate()`**

W efekcie ceny (obecnie 99-120) zamień w środku `setTimeout`:
```tsx
      const params = new URLSearchParams(searchParams.toString());
      if (priceMin) params.set("cena_od", priceMin);
      else params.delete("cena_od");
      if (priceMax) params.set("cena_do", priceMax);
      else params.delete("cena_do");

      const currentMin = searchParams.get("cena_od") ?? "";
      const currentMax = searchParams.get("cena_do") ?? "";
      if (priceMin === currentMin && priceMax === currentMax) return;

      params.delete("strona");
      router.push(localizeHref(`/sklep?${params.toString()}`, locale));
```
na:
```tsx
      const params = new URLSearchParams(searchParams.toString());
      if (priceMin) params.set("cena_od", priceMin);
      else params.delete("cena_od");
      if (priceMax) params.set("cena_do", priceMax);
      else params.delete("cena_do");

      const currentMin = searchParams.get("cena_od") ?? "";
      const currentMax = searchParams.get("cena_do") ?? "";
      if (priceMin === currentMin && priceMax === currentMax) return;

      params.delete("strona");
      navigate(params);
```
(Uwaga: tablica zależności efektu bez zmian — `navigate` używa stanu przez settery, a `router`/`searchParams`/`locale` już tam są.)

- [ ] **Step 5: `clearAll()` przez `navigate()` + odczyt q z effectiveParams**

Zamień (obecnie 170-180):
```tsx
  function clearAll() {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    // Sortowanie zachowujemy jeśli różne od default (alphabetic).
    if (sort && sort !== "alphabetic") params.set("sortuj", sort);
    setPriceMin("");
    setPriceMax("");
    setOpenDropdown(null);
    router.push(localizeHref(`/sklep?${params.toString()}`, locale));
  }
```
na:
```tsx
  function clearAll() {
    const params = new URLSearchParams();
    const q = effectiveParams.get("q");
    if (q) params.set("q", q);
    // Sortowanie zachowujemy jeśli różne od default (alphabetic).
    if (sort && sort !== "alphabetic") params.set("sortuj", sort);
    setPriceMin("");
    setPriceMax("");
    setOpenDropdown(null);
    navigate(params);
  }
```

- [ ] **Step 6: Pasek pending + aria-busy na kontenerze**

Zamień otwarcie kontenera (obecnie 183-186):
```tsx
    <div ref={containerRef} className="mb-10 relative">
      {/* Pasek filtrów. Na mobile: horizontal scroll (overflow-x-auto), żeby
          nie wieszały się na 3 linie. Na desktop: flex-wrap z gap. */}
      <div className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap pb-2 md:pb-0 -mx-1 px-1 scrollbar-thin">
```
na:
```tsx
    <div ref={containerRef} className="mb-10 relative" aria-busy={showPending}>
      {/* Wskaźnik trwającej nawigacji filtrów: cienki pulsujący pasek pod
          FilterBarem. FilterBar nie ma dostępu do siatki produktów (sibling
          server component), więc sygnalizuje we własnym obszarze. */}
      {showPending && (
        <div
          aria-hidden="true"
          className="absolute -bottom-1 left-0 right-0 h-0.5 rounded-full bg-[var(--color-gold)] animate-pulse"
        />
      )}
      {/* Pasek filtrów. Na mobile: horizontal scroll (overflow-x-auto), żeby
          nie wieszały się na 3 linie. Na desktop: flex-wrap z gap. */}
      <div className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap pb-2 md:pb-0 -mx-1 px-1 scrollbar-thin">
```

- [ ] **Step 7: Weryfikacja + commit**

Run: `npx tsc --noEmit` → exit 0; `npx eslint app/_components/ui/FilterBar.tsx` → exit 0; `npx vitest run` → all green.
```bash
git add app/_components/ui/FilterBar.tsx
git commit -m "feat(sklep): optymistyczne filtry + wskaźnik pending (useTransition)"
```

---

### Task 2: SearchBox — pending przy nawigacji do wyników

**Files:**
- Modify: `app/_components/layout/SearchBox.tsx` (import :3; stan po :35; submit/goToProduct :112-135; formularze :171-199 i :238+)

- [ ] **Step 1: Import + stan pending**

Linia 3: `import { useEffect, useRef, useState } from "react";` → `import { useEffect, useRef, useState, useTransition } from "react";`

Po linii 35 (`const [suggestionsOpen, setSuggestionsOpen] = useState(false);`) dodaj:
```tsx
  // Pending nawigacji do wyników/produktu: modal nie znika "w próżnię" —
  // pokazuje "Szukam..." i zamyka się dopiero po zatwierdzeniu nawigacji.
  const [isPending, startTransition] = useTransition();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending) {
      setOpen(false);
      setSuggestionsOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending]);
```

- [ ] **Step 2: submit/goToProduct w transition**

Zamień (obecnie 112-135):
```tsx
  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    // Jeśli klawisz Enter z zaznaczoną sugestią → idź do produktu
    if (highlighted >= 0 && highlighted < suggestions.length) {
      goToProduct(suggestions[highlighted].id);
      return;
    }
    const q = value.trim();
    const params = new URLSearchParams(
      isOnSklep ? searchParams.toString() : ""
    );
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("strona");
    router.push(localizeHref(`/sklep?${params.toString()}`, locale));
    setOpen(false);
    setSuggestionsOpen(false);
  }

  function goToProduct(id: string) {
    router.push(localizeHref(`/produkt/${id}`, locale));
    setOpen(false);
    setSuggestionsOpen(false);
  }
```
na:
```tsx
  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    // Jeśli klawisz Enter z zaznaczoną sugestią → idź do produktu
    if (highlighted >= 0 && highlighted < suggestions.length) {
      goToProduct(suggestions[highlighted].id);
      return;
    }
    const q = value.trim();
    const params = new URLSearchParams(
      isOnSklep ? searchParams.toString() : ""
    );
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("strona");
    setSuggestionsOpen(false);
    startTransition(() => {
      router.push(localizeHref(`/sklep?${params.toString()}`, locale));
    });
  }

  function goToProduct(id: string) {
    setSuggestionsOpen(false);
    startTransition(() => {
      router.push(localizeHref(`/produkt/${id}`, locale));
    });
  }
```
(Modal/suggestions zamykają się teraz w efekcie z Step 1, gdy pending opadnie.)

- [ ] **Step 3: Wskaźniki pending w obu wariantach**

Wariant inline — w `<form ...>` (obecnie 171-174) dodaj `aria-busy={isPending}` do atrybutów formy, a po bloku przycisku czyszczenia (obecnie 185-198, przed `</form>`) dodaj:
```tsx
          {isPending && (
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full bg-[var(--color-gold)] animate-pulse shrink-0"
            />
          )}
```
Wariant icon (modal) — w `<form ...>` (obecnie 238-241) dodaj `aria-busy={isPending}`, a bezpośrednio PO zamknięciu `</form>` dodaj:
```tsx
            {isPending && (
              <p className="mt-3 text-center text-sm font-sans text-white/90">
                {t.search.searching}
              </p>
            )}
```

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit` → 0; `npx eslint app/_components/layout/SearchBox.tsx` → 0; `npx vitest run` → green.
```bash
git add app/_components/layout/SearchBox.tsx
git commit -m "feat(sklep): pending wyszukiwarki (modal czeka na wyniki)"
```

---

### Task 3: Cache facetów + inwalidacja w akcjach admina

**Files:**
- Modify: `app/_lib/products.ts` (importy; `getFilterFacets` :339-399 → źródło+lokalizacja)
- Modify: `app/admin/produkty/actions.ts` (5 funkcji), `app/admin/tkaniny/actions.ts` (3 funkcje)

**Interfaces:**
- Produces: `FACETS_CACHE_TAG = "facets"`; `invalidateFacetsCache(): void`; `getFilterFacets(locale)` — sygnatura i kształt zwrotki BEZ zmian.
- Consumes: `deriveFabricFamilies` (już importowany), `buildLocalizedFacets` (już importowany), `createAdminClient` (dodać import z `./supabase/server`), `unstable_cache`/`revalidateTag` z `next/cache`, `createClient` z `@supabase/supabase-js` (alias `createBareAnonClient`).

- [ ] **Step 1: Importy w products.ts**

Dodaj do importów:
```ts
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
```
oraz rozszerz istniejący import z `./supabase/server` o `createAdminClient` (obok `createClient`).

- [ ] **Step 2: Zamień `getFilterFacets` na cachowane źródło + lokalizację**

Zamień CAŁĄ funkcję `getFilterFacets` (obecnie 339-399) na:
```ts
export const FACETS_CACHE_TAG = "facets";

// Inwalidacja cache facetów — wołana w akcjach admina mutujących produkty
// (kolor/materiał/warianty/aktywność) i katalog tkanin. Wzorzec jak
// invalidateFabricsCache (fabrics.ts).
export function invalidateFacetsCache(): void {
  revalidateTag(FACETS_CACHE_TAG, "max");
}

// Surowe, locale-NIEZALEŻNE źródło facetów, cachowane (tag + 300 s siatka
// bezpieczeństwa na edycje bezpośrednio w DB). Wcześniej każdy klik filtra
// robił 2 pełne skany products (w tym ciężki JSON variants) — to był główny
// niecachowany koszt renderu /sklep.
//
// ⚠️ Wewnątrz unstable_cache nie wolno używać cookies() → products czytamy
// CZYSTYM klientem anon (RLS widzi dokładnie to co gość: tylko is_active —
// przy okazji facety przestają zawierać dane produktów ukrytych, gdy ogląda
// je zalogowany admin). fabrics ma RLS admin-only → createAdminClient
// (wzorzec fetchAllFabrics, działa w unstable_cache).
const getFacetSource = unstable_cache(
  async (): Promise<{
    colorRows: { value: string | null; value_de: string | null }[];
    fabricFacetRows: { value: string | null; value_de: string | null }[];
  }> => {
    const anon = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    const admin = await createAdminClient();
    const [{ data: colorsData }, { data: fabricSourceData }, { data: fabricsData }] =
      await Promise.all([
        anon.from("products").select("color, color_de").not("color", "is", null),
        // Bez .limit() — świadomie (katalog ~dziesiątki produktów). Przy dużym
        // wzroście katalogu PostgREST utnie wiersze i facety po cichu zgubią
        // produkty — wtedy zdenormalizować rodziny do kolumny.
        anon.from("products").select("variants, material, material_de"),
        admin
          .from("fabrics")
          .select("name, name_de")
          .order("sort_order", { ascending: true })
          .order("name", { ascending: true }),
      ]);

    const colorRows = (
      (colorsData ?? []) as { color: string | null; color_de: string | null }[]
    ).map((r) => ({ value: r.color, value_de: r.color_de }));

    // Facet „Tkanina" = rodziny tkanin UŻYTE w widocznych produktach (value =
    // nazwa PL z katalogu, label DE = fabrics.name_de) ∪ legacy wartości kolumny
    // material (label DE = material_de). Dedupe po PL value robi
    // buildLocalizedFacets (rodzina z name_de wygrywa etykietę nad legacy).
    const fabricRows = (fabricSourceData ?? []) as {
      variants: Product["variants"];
      material: string | null;
      material_de: string | null;
    }[];
    const fabrics = (fabricsData ?? []) as { name: string; name_de: string | null }[];
    const familyNames = fabrics.map((f) => f.name);
    const usedFamilies = new Set<string>();
    for (const row of fabricRows) {
      for (const fam of deriveFabricFamilies(row.variants, familyNames)) {
        usedFamilies.add(fam);
      }
    }
    const fabricFacetRows = [
      ...fabrics
        .filter((f) => usedFamilies.has(f.name))
        .map((f) => ({ value: f.name as string | null, value_de: f.name_de })),
      ...fabricRows
        .filter((r) => r.material)
        .map((r) => ({ value: r.material, value_de: r.material_de })),
    ];

    return { colorRows, fabricFacetRows };
  },
  ["facet-source"],
  { tags: [FACETS_CACHE_TAG], revalidate: 300 }
);

// Pobiera facety filtrów na /sklep. Wartości cachowane (getFacetSource);
// lokalizacja/sortowanie per request (tania, czysta buildLocalizedFacets).
// Decyzja historyczna: nie ograniczamy facets do bieżącego search/category
// (pełna paleta zawsze; pusta lista po kliknięciu jest akceptowana).
export async function getFilterFacets(locale: Locale = DEFAULT_LOCALE) {
  const { colorRows, fabricFacetRows } = await getFacetSource();
  return {
    colors: buildLocalizedFacets(colorRows, locale),
    materials: buildLocalizedFacets(fabricFacetRows, locale),
  };
}
```
Stary komentarz nad funkcją (obecnie 330-338) zastąp krótszą wersją wplecioną wyżej. Jeśli po zmianie `createClient` z `./supabase/server` przestaje być używany w tym pliku — NIE usuwaj (używa go `getProducts`).

- [ ] **Step 3: Inwalidacja w akcjach produktów**

W `app/admin/produkty/actions.ts`: dodaj import
```ts
import { invalidateFacetsCache } from "@/app/_lib/products";
```
i dopisz `invalidateFacetsCache();` bezpośrednio PRZED każdym z tych wywołań `revalidatePath("/sklep");` (dotyczą mutacji wpływających na facety): w `updateProductBasics` (:188), `updateProductVariants` (:276), `deleteProduct` (:351), `setProductActive` (:381) oraz w OBU miejscach w `createProduct` (:588 i :602). (POMIŃ `updateProductImages` i `updateProductDescription` — zdjęcia/opis nie wpływają na facety.)

- [ ] **Step 4: Inwalidacja w akcjach tkanin**

W `app/admin/tkaniny/actions.ts`: dodaj import
```ts
import { invalidateFacetsCache } from "@/app/_lib/products";
```
i dopisz `invalidateFacetsCache();` bezpośrednio po każdym `invalidateFabricsCache();` (:85, :113, :130 — createFabric/updateFabric/deleteFabric).

- [ ] **Step 5: Weryfikacja + commit**

Run: `npx tsc --noEmit` → 0; `npx eslint app/_lib/products.ts app/admin/produkty/actions.ts app/admin/tkaniny/actions.ts` → 0; `npx vitest run` → green.
```bash
git add app/_lib/products.ts app/admin/produkty/actions.ts app/admin/tkaniny/actions.ts
git commit -m "perf(sklep): cache facetów (tag facets) + inwalidacja w akcjach admina"
```

---

### Task 4: Cache kursu EUR + spłaszczenie wodospadu na /sklep

**Files:**
- Modify: `app/_lib/store-settings.ts` (cała zawartość)
- Modify: `app/admin/ustawienia/actions.ts` (import + 1 linia)
- Modify: `app/sklep/page.tsx` (:85-121)

**Interfaces:**
- Produces: `EUR_RATE_CACHE_TAG = "eur-rate"`; `getEurRate(): Promise<number>` — sygnatura bez zmian.

- [ ] **Step 1: `store-settings.ts` — unstable_cache zamiast odczytu per request**

Zamień CAŁĄ zawartość pliku na:
```ts
import "server-only";
import { unstable_cache } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { DEFAULT_EUR_RATE } from "./eur-constants";

// Re-export so existing importers of DEFAULT_EUR_RATE from store-settings keep working.
export { DEFAULT_EUR_RATE };

export const EUR_RATE_CACHE_TAG = "eur-rate";

// Kurs PLN->EUR (ile € za 1 zł). Kurs zmienia się WYŁĄCZNIE w /admin/ustawienia
// (tam revalidateTag) → unstable_cache (300 s = siatka bezpieczeństwa) zamiast
// odczytu DB per request. Wewnątrz unstable_cache nie wolno używać cookies()
// → czysty klient anon (store_settings ma publiczny odczyt RLS — dotąd też
// czytane anon-kluczem).
export const getEurRate = unstable_cache(
  async (): Promise<number> => {
    try {
      const supabase = createBareAnonClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase
        .from("store_settings")
        .select("eur_rate")
        .eq("id", true)
        .single();
      const rate = data ? Number((data as { eur_rate: number }).eur_rate) : NaN;
      return Number.isFinite(rate) && rate > 0 ? rate : DEFAULT_EUR_RATE;
    } catch (err) {
      console.error("[store-settings] getEurRate failed, using DEFAULT_EUR_RATE", err);
      return DEFAULT_EUR_RATE;
    }
  },
  ["eur-rate"],
  { tags: [EUR_RATE_CACHE_TAG], revalidate: 300 }
);
```

- [ ] **Step 2: Inwalidacja w `updateEurRate`**

W `app/admin/ustawienia/actions.ts`: zamień import `next/cache` (linia 3) na:
```ts
import { revalidatePath, revalidateTag } from "next/cache";
```
dodaj import:
```ts
import { EUR_RATE_CACHE_TAG } from "@/app/_lib/store-settings";
```
i po `if (error) return { ok: false, error: error.message };` (linia 22), przed `revalidatePath("/", "layout");` dodaj:
```ts
  revalidateTag(EUR_RATE_CACHE_TAG, "max");
```

- [ ] **Step 3: `page.tsx` — wishlist + kurs do pierwszego Promise.all**

Zamień (obecnie 85-121):
```ts
  const [
    { products, total, pages },
    facets,
    sections,
    allCategories,
    allCollections,
    categoryLabel,
    collection,
  ] = await Promise.all([
    getProducts({
      category,
      sort,
      page,
      search,
      priceMin,
      priceMax,
      inStockOnly,
      colors,
      materials,
      collectionSlug,
      sectionSlug,
      locale,
    }),
    getFilterFacets(locale),
    getSections(locale),
    getCategories(locale),
    getAllCollections(),
    getCategoryLabel(category, locale),
    collectionSlug ? getCollection(collectionSlug, locale) : Promise.resolve(null),
  ]);

  // Batch pobrania ocen — jedno zapytanie dla całej strony list.
  const [ratings, wishlistIds, rate] = await Promise.all([
    getRatingsForProducts(products.map((p) => p.id)),
    getUserWishlistIds(),
    getEurRate(),
  ]);
```
na:
```ts
  const [
    { products, total, pages },
    facets,
    sections,
    allCategories,
    allCollections,
    categoryLabel,
    collection,
    wishlistIds,
    rate,
  ] = await Promise.all([
    getProducts({
      category,
      sort,
      page,
      search,
      priceMin,
      priceMax,
      inStockOnly,
      colors,
      materials,
      collectionSlug,
      sectionSlug,
      locale,
    }),
    getFilterFacets(locale),
    getSections(locale),
    getCategories(locale),
    getAllCollections(),
    getCategoryLabel(category, locale),
    collectionSlug ? getCollection(collectionSlug, locale) : Promise.resolve(null),
    // wishlist i kurs NIE zależą od listy produktów — kiedyś czekały w drugiej
    // paczce (pełny dodatkowy łańcuch RTT po products).
    getUserWishlistIds(),
    getEurRate(),
  ]);

  // Oceny wymagają id produktów — jedyne genuinie sekwencyjne zapytanie.
  const ratings = await getRatingsForProducts(products.map((p) => p.id));
```

- [ ] **Step 4: Weryfikacja + commit**

Run: `npx tsc --noEmit` → 0; `npx eslint app/_lib/store-settings.ts app/admin/ustawienia/actions.ts app/sklep/page.tsx` → 0; `npx vitest run` → green.
```bash
git add app/_lib/store-settings.ts app/admin/ustawienia/actions.ts app/sklep/page.tsx
git commit -m "perf(sklep): cache kursu EUR (tag) + wishlist/kurs w pierwszym Promise.all"
```

---

### Task 5: e2e pending + weryfikacja końcowa + pomiary

**Files:**
- Create: `e2e/filter-pending.spec.ts`
- Modify: `playwright.local.config.ts` (testMatch)

- [ ] **Step 1: Spec Playwright (public, z dławieniem odpowiedzi)**

Utwórz `e2e/filter-pending.spec.ts`:
```ts
import { test, expect } from "@playwright/test";

// Regresja płynności filtrów: po kliknięciu opcji tkaniny UI reaguje
// NATYCHMIAST (optymistyczne podświetlenie + aria-busy na kontenerze),
// zanim serwer odpowie. Dławimy odpowiedzi nawigacji z ?tkanina= o ~1,5 s,
// żeby okno pending było deterministycznie obserwowalne.
test("filtr tkaniny — natychmiastowy feedback przed odpowiedzią serwera", async ({ page }) => {
  await page.route("**/sklep*", async (route) => {
    if (route.request().url().includes("tkanina=")) {
      await new Promise((r) => setTimeout(r, 1500));
    }
    await route.continue();
  });

  await page.goto("/sklep");

  // Otwórz dropdown "Tkanina" i kliknij pierwszą opcję.
  await page.getByRole("button", { name: "Tkanina", exact: false }).first().click();
  const option = page
    .locator("div.flex.flex-wrap.gap-1\\.5 > button")
    .first();
  const optionLabel = (await option.textContent())?.trim() ?? "";
  await option.click();

  // NATYCHMIAST (przed upływem dławienia): kontener FilterBara w stanie busy
  // i kliknięta opcja optymistycznie aktywna (złote tło).
  const busy = page.locator('div[aria-busy="true"]');
  await expect(busy).toBeVisible({ timeout: 500 });
  await expect(option).toHaveClass(/bg-\[var\(--color-gold\)\]/, { timeout: 500 });

  // Po zatwierdzeniu nawigacji: URL niesie ?tkanina=, busy znika.
  await expect(page).toHaveURL(/tkanina=/, { timeout: 10_000 });
  await expect(page.locator('div[aria-busy="true"]')).toHaveCount(0, { timeout: 10_000 });
  expect(optionLabel.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Rozszerz testMatch configu lokalnego**

W `playwright.local.config.ts` zamień:
```ts
  testMatch: /corner-side\.spec\.ts/,
```
na:
```ts
  testMatch: /(corner-side|filter-pending)\.spec\.ts/,
```

- [ ] **Step 3: Pełna weryfikacja + e2e + pomiar**

```bash
npx tsc --noEmit && npx vitest run && npm run build
npx next dev -p 3210   # w tle
E2E_BASE_URL=http://localhost:3210 npx playwright test --config=playwright.local.config.ts
# smoke wyników filtra (cache nie może zmienić WYNIKÓW):
curl -s "http://localhost:3210/sklep?tkanina=Poso" | grep -c "VEGAS"     # >0
curl -s "http://localhost:3210/de/sklep" | grep -c "Stoff"               # >0
# pomiar TTFB po zmianach (baseline przed: /sklep ~0.375 s, ?tkanina=Poso ~0.380 s):
for i in 1 2 3; do curl -s -o /dev/null -w "%{time_starttransfer}\n" "http://localhost:3210/sklep"; done
for i in 1 2 3; do curl -s -o /dev/null -w "%{time_starttransfer}\n" "http://localhost:3210/sklep?tkanina=Poso"; done
# zatrzymaj dev server po pomiarach
```
Expected: build/testy zielone; e2e 2 pliki (corner-side 2 + filter-pending 1) passed; smoke >0; TTFB dev niższy od baseline (dokładna liczba do raportu — cache facetów zdejmuje 2 zapytania z JSON variants per request).

- [ ] **Step 4: Commit**

```bash
git add e2e/filter-pending.spec.ts playwright.local.config.ts
git commit -m "test(sklep): e2e natychmiastowego feedbacku filtrów (dławiona nawigacja)"
```

---

## Self-Review

**Spec coverage:** A-FilterBar (T1: optymistyczne derivacje, navigate, pasek, aria-busy) ✓; A-SearchBox (T2: pending, modal czeka, oba warianty) ✓; B1 facety (T3: unstable_cache, anon bez cookies, admin dla fabrics, tag+inwalidacja produkty+tkaniny) ✓; B2 kurs (T4: tag+inwalidacja w updateEurRate) ✓; B3 wodospad (T4 Step 3) ✓; Playwright z dławieniem (T5) ✓; pomiary przed/po (T5; baseline w planie) ✓; smoke wyników bez zmian (T5) ✓; zero nowych kluczy słownika ✓.

**Placeholder scan:** brak TBD/TODO; każdy krok kodowy ma pełny kod; komendy z oczekiwanym wynikiem.

**Type consistency:** `navigate(params: URLSearchParams)` używany w update/clearAll/efekcie ceny (T1); `FACETS_CACHE_TAG`/`invalidateFacetsCache` zdefiniowane w T3 Step 2 i konsumowane w T3 Step 3-4; `EUR_RATE_CACHE_TAG` zdefiniowany w T4 Step 1, konsumowany w T4 Step 2; `getFilterFacets`/`getEurRate` sygnatury niezmienione (page.tsx wywołania bez zmian poza przeniesieniem); kształt `{value, value_de}` zgodny z `buildLocalizedFacets`. `revalidateTag(tag, "max")` — konwencja z fabrics.ts:39.
