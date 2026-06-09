# Utwardzenie synchronizacji BaseLinker — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Utwardzić ręczny sync produktów BaseLinker → Supabase: bezpieczne auto-ukrywanie znikłych produktów (odwracalne), retry odczytów + czytelna kategoryzacja błędów, lepszy parser wariantów/sekcji, oraz runner testów (Vitest) dla czystych funkcji.

**Architecture:** Podejście chirurgiczne — punktowe zmiany w istniejącym `syncProductsFromBaseLinker` bez przebudowy. Destrukcyjny krok ukrywania wydzielony jako czysta, testowalna funkcja `planDeactivations` z bezpiecznikami (kompletność pobrania + próg anty-masowy). Widoczność produktu egzekwowana w RLS (kolumna `is_active`), nie przez rozsiane filtry w 9+ zapytaniach.

**Tech Stack:** Next.js 16.2.4 (App Router, RSC), React 19.2.4, TypeScript 5, Supabase (Postgres + RLS), Vitest (nowy, env `node`), `vite-tsconfig-paths`.

---

## Pre-flight (przeczytaj raz przed startem)

- **Branch:** zostajemy na bieżącej `feat/admin-delete-and-filters` (decyzja właściciela — bez osobnej `feat/bl-sync-hardening`). NIE twórz worktree.
- **Migracje stosuje ręcznie Mikołaj** w panelu Supabase (SQL editor) — tak jak migracje 12-17. Plik SQL = artefakt; `npm run build`/`npm test` go nie wykonują. Dlatego:
  - Po Tasku 1 (typ `Product` zyskuje `is_active`) `npm run build` przechodzi (kompilacja TS nie dotyka DB), ale **runtime sync/admin produkty zadziałają dopiero po zaaplikowaniu migracji 23**.
  - Po Tasku 9 runtime persystencji raportu wymaga migracji 24.
  - Na końcu (po Tasku 16) przypomnij właścicielowi: „zaaplikuj `23_products_is_active.sql` i `24_baselinker_sync_log_report.sql` w Supabase".
- **Konwencje repo (potwierdzone audytem kodu):**
  - Migracje: `NN_nazwa.sql`, idempotentne (`add column if not exists`, `drop policy if exists`), nagłówek w ramce `-- ====`. Ostatnia istniejąca = `22`; `23` i `24` wolne (numery 20, 21 nie istnieją — luka jest OK).
  - Wzorzec admina w RLS: **`auth.jwt() -> 'app_metadata' ->> 'role' = 'admin'`** (NIE stary `auth.jwt() ->> 'role'`). Rola admina realnie siedzi w `app_metadata` (`isAdmin` w `app/_lib/admin.ts:11` czyta `user.app_metadata.role`).
  - Server action: plik z `"use server"`, każda funkcja zaczyna `await requireAdmin()`, mutacje przez `createAdminClient()`, na końcu `revalidatePath(...)`, zwrot `ActionResult = {ok:true,message?} | {ok:false,error}`.
- **Komenda weryfikacji po każdym kroku:** `npm run build` (Next build + typecheck) oraz — od Tasku 3 — `npm test` (skonfigurowane jako `vitest run`, jednorazowe przejście). `npm run lint` przed commitem grupy.
- **Składnia commitów:** bloki `git commit` poniżej używają PowerShell here-string (`@'…'@`) — uruchamiaj je przez **PowerShell** (domyślny shell tej maszyny). Jeśli wykonujesz przez Bash, ZAMIEŃ na `git commit -m "subject\n\nCo-Authored-By: …"` z prawdziwym podwójnym cudzysłowem i realnymi nowymi liniami (bash nie rozumie `@'…'@` i wstawi błędne znaki `@` do message).
- **Zasada konserwatywna parsera:** zmiany w parserze NIE mogą psuć obecnie poprawnie parsowanych przypadków. Baseline regresji (Task 4) pisany jest na czystych przypadkach PRZED zmianami parsera (Task 10-13).

---

# FAZA A — Widoczność produktu (`is_active`) — spec §4.1

## Task 1: Migracja 23 — kolumny `is_active`/`deactivation_source` + rozdzielenie polityki SELECT

**Tło (z audytu kodu):** dziś `products` ma **jedną** politykę SELECT `"products: publiczny odczyt"` `to anon, authenticated using (true)` (`supabase/schema.sql:115-118`). `/admin/produkty` (`app/admin/produkty/page.tsx:14`) czyta przez `createClient()` (RLS, JWT admina) — więc samo zwężenie publicznej polityki do `is_active = true` ukryłoby produkty **także przed adminką**, łamiąc przywracanie. Dlatego rozdzielamy: publiczna polityka → tylko aktywne; nowa polityka admin-SELECT → wszystko (polityki RLS są OR-owane, więc admin widzi sumę).

**Files:**
- Create: `supabase/migrations/23_products_is_active.sql`

- [ ] **Step 1: Utwórz plik migracji**

```sql
-- ============================================================
-- Migracja 23: widoczność produktu (is_active) + auto/ręczne ukrywanie
-- ============================================================
-- Produkt usunięty z BaseLinkera ma być automatycznie i ODWRACALNIE ukrywany
-- (a nie zostawać „duchem" w sklepie). Admin może też ukryć/przywrócić ręcznie.
--
-- Widoczność egzekwowana W RLS — jeden punkt prawdy zamiast .eq("is_active",true)
-- rozsianego po 9+ zapytaniach. Sync używa service_role (omija RLS), więc dalej
-- widzi i zapisuje wszystko, łącznie z ukrytymi (potrzebne do reaktywacji).
-- ============================================================

alter table public.products
  add column if not exists is_active boolean not null default true;

-- null = aktywny; 'auto' = ukryty przez sync (znikł z BL → auto-reaktywacja gdy
-- wróci); 'manual' = ukryty ręcznie przez admina (sync NIE reaktywuje).
alter table public.products
  add column if not exists deactivation_source text;

-- Constraint dodajemy osobno + idempotentnie (add column nie przyjmuje check
-- warunkowo przy if not exists na starszych Postgresach).
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

-- Ukrytych jest mało → indeks częściowy dla szybkiego lookupu w adminie.
create index if not exists idx_products_inactive
  on public.products (is_active) where is_active = false;

-- ---- RLS: rozdzielenie publicznej polityki SELECT ----
-- Dotychczasowa „products: publiczny odczyt" była WSPÓLNA dla anon+authenticated
-- (using true). Podmieniamy ją (a nie tworzymy drugiej równoległej) i dokładamy
-- osobną politykę admin-SELECT, żeby /admin/produkty (czyta przez RLS) widziało
-- też ukryte produkty (do przywracania). Polityki permissive są OR-owane:
--   anon            → tylko publiczna  → is_active = true
--   authenticated   → publiczna OR admin → (is_active = true) OR (role=admin)
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

- [ ] **Step 2: Weryfikacja składni (lokalnie, opcjonalnie)**

Plik SQL nie jest wykonywany przez build. Jeśli masz lokalny Postgres/`psql`, możesz sprawdzić składnię. W przeciwnym razie weryfikacja = code review SQL pod kątem zgodności z konwencją (idempotentność, wzorzec `app_metadata`).

- [ ] **Step 3: Commit**

```powershell
git add supabase/migrations/23_products_is_active.sql
git commit -m @'
feat(sync): migracja 23 — is_active + deactivation_source + rozdzielenie RLS SELECT

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 2: Typ `Product` + domyślne `is_active` w `mapBlToProduct` + komentarz sitemap

**Tło:** `ProductInsert` (`app/_lib/baselinker-sync.ts:507`) = `Omit<Product,"id"|"created_at"> & {...}`. Po dodaniu wymaganych pól do `Product`, `mapBlToProduct` (jedyny konstruktor `ProductInsert`, linia 819) musi je ustawić, inaczej build padnie. Defaulty (`is_active:true, deactivation_source:null`) = nowy/wrócony produkt aktywny; warunkowe nadpisanie dla ręcznie ukrytych dochodzi w Tasku 6.

**Files:**
- Modify: `app/_lib/types.ts:95-121` (typ `Product`)
- Modify: `app/_lib/baselinker-sync.ts:819-845` (obiekt `product` w `mapBlToProduct`)
- Modify: `app/sitemap.ts:48-49` (mylący komentarz)

- [ ] **Step 1: Dodaj pola do typu `Product`**

W `app/_lib/types.ts`, w typie `Product` (po `created_at: string;` lub przed nim — kolejność dowolna, ale trzymaj logicznie przy `baselinker_id`), dodaj:

```ts
  baselinker_id: string | null;
  collection_id: string | null;
  // Widoczność w sklepie (RLS). false = ukryty. deactivation_source: kto ukrył.
  is_active: boolean;
  deactivation_source: "auto" | "manual" | null;
  created_at: string;
```

(Nie trzeba ruszać `Database.products.Insert/Update` — są budowane przez `Omit<Product,...>`/`Partial<Omit<...>>` i propagują automatycznie.)

- [ ] **Step 2: Ustaw defaulty w `mapBlToProduct`**

W `app/_lib/baselinker-sync.ts`, w obiekcie `const product: ProductInsert = {` (linia 819), dodaj dwa pola (np. tuż przed `baselinker_id: blId,`):

```ts
    variants: null, // wypełnione niżej z parsedVariants
    // Nowy/wrócony produkt domyślnie widoczny. Warunkowe utrzymanie ręcznego
    // ukrycia (deactivation_source='manual') ustawiane w pętli sync po SELECT
    // istniejącego rekordu (Task 6).
    is_active: true,
    deactivation_source: null,
    baselinker_id: blId,
```

- [ ] **Step 3: Popraw mylący komentarz w sitemap**

W `app/sitemap.ts:48-49` zamień komentarz (zachowaj kod `createClient()` bez zmian — teraz RLS faktycznie odfiltruje ukryte, co jest pożądane dla SEO):

```ts
  // Produkty publiczne — RLS (polityka „is_active = true") automatycznie pomija
  // produkty ukryte, więc sitemap nie indeksuje znikłych z BL.
  const supabase = await createClient();
```

- [ ] **Step 4: Build green**

Run: `npm run build`
Expected: SUCCESS. Jeśli build wskaże inne miejsce konstruujące pełny `Product`/`ProductInsert` bez nowych pól — ustaw tam `is_active`/`deactivation_source` analogicznie. (Z audytu: pozostałe zapisy idą przez `... as never` / `Partial`, więc spodziewane jest tylko `mapBlToProduct`.)

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/types.ts app/_lib/baselinker-sync.ts app/sitemap.ts
git commit -m @'
feat(sync): Product.is_active/deactivation_source + defaulty w mapBlToProduct

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA B — Runner testów (Vitest) + baseline regresji — spec §4.5 / §6 krok 2

## Task 3: Dodaj Vitest (devDeps + config + skrypt)

**Tło:** repo nie ma runnera testów. Docs Next 16 (`node_modules/next/dist/docs/01-app/02-guides/testing/vitest.md`) zaleca `vitest.config.mts` (**.mts**, bo `package.json` nie ma `"type":"module"` — `.ts` byłby traktowany jako CJS i `import` by się wysypał). Testujemy **wyłącznie czyste funkcje** → środowisko `node` (nie `jsdom`), bez `@testing-library`/`@vitejs/plugin-react`/`jsdom`. `vite-tsconfig-paths` jest obowiązkowy, bo `tsconfig` ma alias `@/* → ./*`, którego Vitest sam nie czyta. Skrypt = `vitest run` (jednorazowe przejście; gołe `vitest` wchodzi w watch i wisi).

**Files:**
- Create: `vitest.config.mts`
- Modify: `package.json` (devDependencies + scripts)

- [ ] **Step 1: Zainstaluj devDependencies**

Run:
```powershell
npm install -D vitest vite-tsconfig-paths
```
Expected: dopisane do `devDependencies`, zaktualizowany `package-lock.json`. (Bierzemy najnowsze stabilne — vitest >=3 obsługuje Vite 6/Node aktualny dla Next 16/React 19.)

- [ ] **Step 2: Utwórz `vitest.config.mts`**

```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Pure-function tests only (parser/merge/planDeactivations) → środowisko node.
// Brak @vitejs/plugin-react/jsdom — niepotrzebne dla nie-komponentów.
// vite-tsconfig-paths rozwiązuje alias @/* z tsconfig.json.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["app/**/__tests__/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Dodaj skrypt `test` do `package.json`**

W `package.json` w `"scripts"` dodaj `test` (zostaw dev/build/start/lint):

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

- [ ] **Step 4: Smoke test — pusty test przechodzi**

Utwórz tymczasowo `app/_lib/__tests__/smoke.test.ts`:
```ts
import { describe, it, expect } from "vitest";
describe("smoke", () => {
  it("runner działa", () => {
    expect(1 + 1).toBe(2);
  });
});
```
Run: `npm test`
Expected: PASS (1 passed). Usuń `smoke.test.ts` po sprawdzeniu.

- [ ] **Step 5: Commit**

```powershell
git rm -f app/_lib/__tests__/smoke.test.ts 2>$null; git add package.json package-lock.json vitest.config.mts
git commit -m @'
test: skonfiguruj Vitest (env node, vite-tsconfig-paths, vitest run)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 4: Eksport czystych funkcji + testy baseline (regresja PRZED zmianami parsera)

**Tło:** funkcje do testów są dziś module-local (nie eksportowane): `parseVariantsFromBl`, `detectOptionName`, `extractDescriptionSections`, `pickFirstImage`. Eksportujemy je (zmiana bezpieczna). Baseline pokrywa **tylko przypadki dziś parsowane poprawnie** (czysty structured / czysty fallback / none / merge admina) — żeby zmiany z Tasków 10-13 ich nie wywróciły.

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (dodaj `export` przy 4 funkcjach)
- Create: `app/_lib/__tests__/baselinker-sync.baseline.test.ts`

- [ ] **Step 1: Wyeksportuj funkcje**

W `app/_lib/baselinker-sync.ts` dopisz `export` przy deklaracjach:
- linia 200: `function pickFirstImage(` → `export function pickFirstImage(`
- linia 339: `function extractDescriptionSections(` → `export function extractDescriptionSections(`
- linia 602: `function detectOptionName(` → `export function detectOptionName(`
- linia 645: `function parseVariantsFromBl(` → `export function parseVariantsFromBl(`

(`mergeVariantsPreserveAdminEdits` i `mergeSectionsPreserveAdminImages` są już eksportowane.)

- [ ] **Step 2: Napisz testy baseline**

```ts
import { describe, it, expect } from "vitest";
import {
  parseVariantsFromBl,
  detectOptionName,
  extractDescriptionSections,
  pickFirstImage,
  mergeVariantsPreserveAdminEdits,
} from "@/app/_lib/baselinker-sync";

describe("parseVariantsFromBl — baseline (zachowanie do utrzymania)", () => {
  it("structured: 'Kolor: X' z jednolitymi kluczami", () => {
    const r = parseVariantsFromBl(
      { "1": { name: "Kolor: Beżowy" }, "2": { name: "Kolor: Szary" } },
      88309,
      1000
    );
    expect(r.kind).toBe("structured");
    if (r.kind === "structured") {
      expect(r.variants.options).toEqual([{ name: "Kolor", values: ["Beżowy", "Szary"] }]);
      expect(r.variants.combinations).toHaveLength(2);
    }
  });

  it("structured wieloopcyjny: 'Kolor: X, Strona: Y'", () => {
    const r = parseVariantsFromBl(
      { "1": { name: "Kolor: Beż, Strona: Lewa" }, "2": { name: "Kolor: Beż, Strona: Prawa" } },
      88309,
      1000
    );
    expect(r.kind).toBe("structured");
    if (r.kind === "structured") {
      expect(r.variants.options.map((o) => o.name).sort()).toEqual(["Kolor", "Strona"]);
    }
  });

  it("fallback: wspólny prefix > próg jest stripowany", () => {
    const r = parseVariantsFromBl(
      { "1": { name: "Sofa Boston Lewa" }, "2": { name: "Sofa Boston Prawa" } },
      88309,
      1000
    );
    expect(r.kind).toBe("fallback");
    if (r.kind === "fallback") {
      // prefix "Sofa Boston " (>5) stripowany, capitalize first
      expect(r.variants.options[0].values).toEqual(["Lewa", "Prawa"]);
    }
  });

  it("none: brak wariantów", () => {
    expect(parseVariantsFromBl(undefined, 88309, 1000).kind).toBe("none");
    expect(parseVariantsFromBl({}, 88309, 1000).kind).toBe("none");
  });
});

describe("detectOptionName — baseline", () => {
  it("Kolor gdy wszystkie wartości to kolory", () => {
    expect(detectOptionName(["Beżowy", "Szary"])).toBe("Kolor");
  });
  it("Rozmiar gdy wszystkie pasują do wzorca", () => {
    expect(detectOptionName(["120x200", "140x200"])).toBe("Rozmiar");
  });
  it("Wariant gdy mieszane / nieznane", () => {
    expect(detectOptionName(["Lewa", "Prawa"])).toBe("Wariant");
  });
  it("Wariant dla pustej listy", () => {
    expect(detectOptionName([])).toBe("Wariant");
  });
});

describe("extractDescriptionSections — baseline", () => {
  it("buduje sekcję Opis z description + extra1/2", () => {
    const s = extractDescriptionSections({
      description: "Wygodna sofa.",
      description_extra1: "Miękkie poduchy.",
    });
    expect(s.find((x) => x.title === "Opis")?.body).toContain("Wygodna sofa.");
  });
  it("buduje sekcję Wymiary i materiały z extra3/4", () => {
    const s = extractDescriptionSections({ description_extra3: "Szerokość 200 cm." });
    expect(s.some((x) => x.title === "Wymiary i materiały")).toBe(true);
  });
  it("pomija puste sekcje", () => {
    expect(extractDescriptionSections({})).toEqual([]);
  });
});

describe("pickFirstImage — baseline (tablica niezmieniona)", () => {
  it("zwraca tablicę URLi z arraya", () => {
    expect(pickFirstImage(["a.jpg", "b.jpg"])).toEqual(["a.jpg", "b.jpg"]);
  });
  it("filtruje puste", () => {
    expect(pickFirstImage(["a.jpg", ""])).toEqual(["a.jpg"]);
  });
});

describe("mergeVariantsPreserveAdminEdits — baseline", () => {
  it("zachowuje CASE admina i zdjęcia po stronie istniejącego wariantu", () => {
    const fresh = {
      options: [{ name: "Kolor", values: ["Beżowy"] }],
      combinations: [{ values: { Kolor: "Beżowy" }, stock: 5 }],
    };
    const existing = {
      options: [{ name: "Kolor", values: ["beż"] }],
      combinations: [{ values: { Kolor: "beż" }, stock: 0, images: ["x.jpg"] }],
    };
    const merged = mergeVariantsPreserveAdminEdits(fresh, existing);
    expect(merged.combinations[0].values.Kolor).toBe("beż"); // admin case
    expect(merged.combinations[0].images).toEqual(["x.jpg"]); // zdjęcia zachowane
  });
});
```

- [ ] **Step 3: Uruchom testy**

Run: `npm test`
Expected: PASS (wszystkie powyższe). Jeśli któryś baseline nie odzwierciedla obecnego zachowania — **popraw test, nie kod** (to snapshot stanu „przed").

- [ ] **Step 4: Build + commit**

Run: `npm run build` (Expected: SUCCESS — eksporty nic nie psują).
```powershell
git add app/_lib/baselinker-sync.ts app/_lib/__tests__/baselinker-sync.baseline.test.ts
git commit -m @'
test(sync): baseline regresji parsera/merge + eksport czystych funkcji

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA C — Bezpieczne auto-ukrywanie + reaktywacja + raport — spec §4.2

## Task 5: `planDeactivations` (TDD — pure)

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (nowa eksportowana funkcja, np. zaraz po typach wyniku ~linia 195)
- Create: `app/_lib/__tests__/plan-deactivations.test.ts`

- [ ] **Step 1: Napisz failing test**

```ts
import { describe, it, expect } from "vitest";
import { planDeactivations } from "@/app/_lib/baselinker-sync";

const db = (...ids: string[]) => ids.map((baselinker_id) => ({ baselinker_id }));
const guards = { completedFully: true, maxRatio: 0.2, maxAbsoluteFloor: 5 };

describe("planDeactivations", () => {
  it("abort gdy pobranie niekompletne (completedFully=false)", () => {
    const r = planDeactivations(db("1", "2"), new Set<string>(), {
      ...guards,
      completedFully: false,
    });
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toMatch(/niekompletne/i);
  });

  it("ukrywa produkty z DB których nie ma w seenBlIds", () => {
    const r = planDeactivations(db("1", "2", "3"), new Set(["1", "2"]), guards);
    expect(r.toDeactivate).toEqual(["3"]);
    expect(r.skippedReason).toBeNull();
  });

  it("nic do ukrycia gdy wszystkie widziane", () => {
    const r = planDeactivations(db("1", "2"), new Set(["1", "2"]), guards);
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toBeNull();
  });

  it("podłoga: mały katalog — 3 z 3 do ukrycia (poniżej floor=5) PRZECHODZI", () => {
    const r = planDeactivations(db("1", "2", "3"), new Set<string>(), guards);
    expect(r.toDeactivate).toEqual(["1", "2", "3"]);
    expect(r.skippedReason).toBeNull();
  });

  it("próg procentowy: 25 z 100 (>20%) wstrzymuje ukrywanie", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i));
    const seen = new Set(all.slice(25)); // 75 widzianych, 25 znikło
    const r = planDeactivations(db(...all), seen, guards);
    expect(r.toDeactivate).toEqual([]);
    expect(r.skippedReason).toMatch(/podejrzanie dużo \(25\)/);
  });

  it("próg procentowy: 15 z 100 (<20%) PRZECHODZI", () => {
    const all = Array.from({ length: 100 }, (_, i) => String(i));
    const seen = new Set(all.slice(15));
    const r = planDeactivations(db(...all), seen, guards);
    expect(r.toDeactivate).toHaveLength(15);
    expect(r.skippedReason).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom — fail**

Run: `npm test app/_lib/__tests__/plan-deactivations.test.ts`
Expected: FAIL (`planDeactivations is not exported` / not defined).

- [ ] **Step 3: Implementacja**

W `app/_lib/baselinker-sync.ts` (po definicji `SyncOutcome`, ~linia 195) dodaj:

```ts
// ============================================================
// Bezpieczne auto-ukrywanie znikłych produktów (czysta, testowalna funkcja)
// ============================================================
// Wszystkie bezpieczniki muszą przejść, inaczej toDeactivate=[] + skippedReason.
export function planDeactivations(
  dbBlProducts: { baselinker_id: string }[],
  seenBlIds: Set<string>,
  guards: { completedFully: boolean; maxRatio: number; maxAbsoluteFloor: number }
): { toDeactivate: string[]; skippedReason: string | null } {
  // 1) Tylko po kompletnym pobraniu — anty-mass-hide / anty-data-loss.
  if (!guards.completedFully) {
    return {
      toDeactivate: [],
      skippedReason:
        "pobranie z BaseLinkera było niekompletne — pominięto auto-ukrywanie dla bezpieczeństwa",
    };
  }

  // Kandydaci: aktywne produkty BL z DB, których baselinker_id NIE było w pełnym
  // pobraniu. (Produkty bez baselinker_id już odfiltrowane przez query w sync.)
  const candidates = dbBlProducts
    .map((p) => p.baselinker_id)
    .filter((id) => !!id && !seenBlIds.has(id));

  if (candidates.length === 0) {
    return { toDeactivate: [], skippedReason: null };
  }

  // 2) Próg anty-masowy: max(ratio * |aktywne BL|, podłoga). Powyżej → wstrzymaj.
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

- [ ] **Step 4: Uruchom — pass**

Run: `npm test app/_lib/__tests__/plan-deactivations.test.ts`
Expected: PASS (6 passed).

- [ ] **Step 5: Build + commit**

Run: `npm run build` (SUCCESS).
```powershell
git add app/_lib/baselinker-sync.ts app/_lib/__tests__/plan-deactivations.test.ts
git commit -m @'
feat(sync): planDeactivations — bezpieczniki auto-ukrywania (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 6: Wpięcie ukrywania + warunkowa reaktywacja + raport w `SyncOutcome`

**Tło:** w pętli zbieramy `seenBlIds` (po udanym upsercie), SELECT istniejącego rekordu dociąga `is_active, deactivation_source` (dziś tylko `variants, description_sections` — linia 943). Reaktywacja: produkt w BL + wcześniej `auto` → wraca; `manual` → zostaje ukryty. Krok ukrywania = JEDEN batchowy update PO pętli wszystkich magazynów (NIE w pętli — ostrzeżenie z audytu: pętla to już N+N zapytań).

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (typy `SyncedProduct`/`SyncOutcome`; pętla 941-1008; sekcja po pętli przed `totals` ~1044; return ~1054)

- [ ] **Step 1: Rozszerz `SyncOutcome` (ok:true) o pola raportu**

W `app/_lib/baselinker-sync.ts:192-194` zmień wariant `ok:true` (pola opcjonalne — wsteczna kompatybilność z istniejącym `return` dla „brak magazynów" i ze starymi logami):

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

Dodaj też typ `UnmappedCategory` (przy innych typach wyniku, ~linia 119, użyty w Tasku 9 — definiujemy teraz, by `SyncOutcome` się kompilował):

```ts
export type UnmappedCategory = {
  bl_category_id: number;
  sample_product_name: string;
  count: number;
};
```

- [ ] **Step 2: Zadeklaruj akumulatory run-level przed pętlą magazynów**

W `syncProductsFromBaseLinker`, po `const results: SyncInventoryResult[] = [];` (linia 873) dodaj:

```ts
    const results: SyncInventoryResult[] = [];
    // Akumulatory run-level (utwardzenie):
    const seenBlIds = new Set<string>(); // baselinker_id z udanych upsertów
    const reactivated: SyncedProduct[] = []; // wcześniej auto-ukryte, wróciły z BL
    // completedFully: każdy nieudany ODCZYT BL rzuca → catch → ok:false (krok
    // ukrywania jest poza tą ścieżką), więc gdy tu dotrzemy pobranie jest pełne.
    const completedFully = true;
```

- [ ] **Step 3: Dociągnij `is_active, deactivation_source` w SELECT istniejącego**

W `app/_lib/baselinker-sync.ts:941-945` zmień select:

```ts
        const { data: existing } = await supabase
          .from("products")
          .select("variants, description_sections, is_active, deactivation_source")
          .eq("baselinker_id", blId)
          .maybeSingle();
```

- [ ] **Step 4: Warunkowa reaktywacja — ustaw `is_active`/`deactivation_source` po SELECT**

W `app/_lib/baselinker-sync.ts`, po bloku merge sekcji (po linii 981, przed upsertem 983) dodaj:

```ts
        // Reaktywacja z poszanowaniem ręcznego ukrycia:
        // - manual → zostaje ukryty (sync respektuje decyzję admina)
        // - auto/aktywny/nowy → aktywny (auto-ukryty wraca, bo znów jest w BL)
        const existingRow = existing as
          | { is_active: boolean | null; deactivation_source: "auto" | "manual" | null }
          | null;
        const wasManuallyHidden = existingRow?.deactivation_source === "manual";
        mapped.product.is_active = !wasManuallyHidden;
        mapped.product.deactivation_source = wasManuallyHidden ? "manual" : null;
        const wasAutoHidden =
          existingRow?.is_active === false && existingRow?.deactivation_source === "auto";
        if (wasAutoHidden) {
          reactivated.push({ id: blId, name: mapped.product.name });
        }
```

- [ ] **Step 5: Zbieraj `seenBlIds` po udanym upsercie**

W `app/_lib/baselinker-sync.ts`, po sprawdzeniu `if (error) {...continue;}` (po linii 996), przed heurystyką insert/update (linia 998), dodaj:

```ts
        seenBlIds.add(blId);

```

- [ ] **Step 6: Krok ukrywania — po pętli magazynów, przed `totals`**

W `app/_lib/baselinker-sync.ts`, między `}` zamykającym pętlę `for (const inv of inventories)` (linia 1043) a `const totals: SyncTotals = ...` (linia 1045) wstaw:

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

- [ ] **Step 7: Dołącz raport do `return { ok: true, ... }`**

W `app/_lib/baselinker-sync.ts:1054` zmień:

```ts
    return {
      ok: true,
      results,
      totals,
      deactivated,
      reactivated,
      hide_skipped_reason: skippedReason,
      // unmapped_categories dochodzi w Tasku 9
    };
```

- [ ] **Step 8: Build green**

Run: `npm run build`
Expected: SUCCESS. (TS: `is_active`/`deactivation_source` są teraz na `ProductInsert`, więc przypisania w Step 4 są typowane; reszta to czysty TS.)

- [ ] **Step 9: Test jednostkowy reaktywacji-logiki nie jest tu wymagany** (logika reaktywacji jest w pętli z DB; `planDeactivations` już pokryte). Potwierdzenie runtime nastąpi przy ręcznej weryfikacji po migracji 23 (sekcja „Weryfikacja end-to-end" na końcu).

- [ ] **Step 10: Commit**

```powershell
git add app/_lib/baselinker-sync.ts
git commit -m @'
feat(sync): wpięcie auto-ukrywania + warunkowa reaktywacja + raport SyncOutcome

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA D — Niezawodność: retry + kategoryzacja + banner kategorii — spec §4.3

## Task 7: Retry odczytów BL w `blRequest` (TDD)

**Tło:** `blRequest` (`app/_lib/baselinker.ts:24-59`) nie ma retry; HTTP !ok rzuca `Error("BaseLinker HTTP ${status}")` (status niedostępny jako pole). Wprowadzamy `BaseLinkerHttpError` (z polem `status`), klasyfikator `isTransientBlError` (pure), backoff i opt-in retry. Retry tylko dla odczytów; `addOrder` bez retry (duplikaty zamówień).

**Files:**
- Modify: `app/_lib/baselinker.ts` (blRequest + nowe typy/helpery; wrappery readów)
- Create: `app/_lib/__tests__/baselinker-retry.test.ts`

- [ ] **Step 1: Napisz failing test (pure klasyfikator + backoff)**

```ts
import { describe, it, expect } from "vitest";
import {
  isTransientBlError,
  retryDelayMs,
  BaseLinkerHttpError,
  BaseLinkerError,
} from "@/app/_lib/baselinker";

describe("isTransientBlError", () => {
  it("HTTP 5xx jest przejściowy", () => {
    expect(isTransientBlError(new BaseLinkerHttpError(503))).toBe(true);
  });
  it("HTTP 429 (rate limit) jest przejściowy", () => {
    expect(isTransientBlError(new BaseLinkerHttpError(429))).toBe(true);
  });
  it("HTTP 4xx (poza 429) jest trwały", () => {
    expect(isTransientBlError(new BaseLinkerHttpError(400))).toBe(false);
  });
  it("błąd sieci (TypeError z fetch) jest przejściowy", () => {
    expect(isTransientBlError(new TypeError("fetch failed"))).toBe(true);
  });
  it("BaseLinkerError z nieprzejściowym kodem jest trwały", () => {
    expect(isTransientBlError(new BaseLinkerError("getInventories", "ERROR_AUTH_TOKEN", "zły token"))).toBe(false);
  });
  it("nieznany błąd jest trwały (fail-safe)", () => {
    expect(isTransientBlError(new Error("?"))).toBe(false);
  });
});

describe("retryDelayMs — backoff 0.5s → 1s → 2s", () => {
  it("rośnie wykładniczo od baseDelayMs", () => {
    expect(retryDelayMs(1, 500)).toBe(500);
    expect(retryDelayMs(2, 500)).toBe(1000);
    expect(retryDelayMs(3, 500)).toBe(2000);
  });
});
```

- [ ] **Step 2: Uruchom — fail**

Run: `npm test app/_lib/__tests__/baselinker-retry.test.ts`
Expected: FAIL (brak eksportów `isTransientBlError`/`retryDelayMs`/`BaseLinkerHttpError`).

- [ ] **Step 3: Implementacja w `app/_lib/baselinker.ts`**

Po klasie `BaseLinkerError` (linia 22) dodaj:

```ts
// Błąd HTTP z BL z zachowanym kodem statusu (do klasyfikacji przejściowy/trwały).
export class BaseLinkerHttpError extends Error {
  constructor(public status: number) {
    super(`BaseLinker HTTP ${status}`);
    this.name = "BaseLinkerHttpError";
  }
}

// Kody błędów BL uznawane za PRZEJŚCIOWE (do ponowienia). Rate-limit BL — kod
// do potwierdzenia na żywym koncie (spec §9, open item); zbiór łatwy do
// uzupełnienia bez zmian w logice.
const TRANSIENT_BL_ERROR_CODES = new Set<string>([
  "ERROR_RATE_LIMIT",
]);

export function isTransientBlError(err: unknown): boolean {
  if (err instanceof BaseLinkerHttpError) return err.status >= 500 || err.status === 429;
  if (err instanceof BaseLinkerError) return TRANSIENT_BL_ERROR_CODES.has(err.errorCode);
  // Błąd sieciowy z fetch() (np. ECONNRESET) leci jako TypeError.
  if (err instanceof TypeError) return true;
  return false;
}

export function retryDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 1);
}

export type BlRetryOptions = { attempts: number; baseDelayMs: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
```

Zamień `blRequest` (24-59): wydziel jednorazowe wywołanie i opakuj retry-pętlą:

```ts
// Pojedyncze wywołanie metody BL (bez retry).
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

// Generyczne wywołanie metody BL. retry = opt-in (tylko dla idempotentnych
// odczytów). Ponawia WYŁĄCZNIE błędy przejściowe (isTransientBlError).
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

- [ ] **Step 4: Przekaż retry do trzech odczytów używanych w sync**

W `app/_lib/baselinker.ts` dodaj opcjonalny `retry` do wrapperów i przekaż do `blRequest`:

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

(`addOrder` — BEZ zmian, bez retry.)

- [ ] **Step 5: Włącz retry w sync**

W `app/_lib/baselinker-sync.ts` dodaj stałą u góry (po importach, ~linia 23):
```ts
// Retry dla idempotentnych odczytów BL: 3 próby, backoff 0.5s → 1s → 2s.
const BL_READ_RETRY = { attempts: 3, baseDelayMs: 500 } as const;
```
i przekaż ją w trzech wywołaniach:
- `getInventories()` (linia 862) → `getInventories(BL_READ_RETRY)`
- `getInventoryProductsList(inv.inventory_id, page)` (linia 880) → `getInventoryProductsList(inv.inventory_id, page, BL_READ_RETRY)`
- `getInventoryProductsData(inv.inventory_id, chunk)` (linia 898) → `getInventoryProductsData(inv.inventory_id, chunk, BL_READ_RETRY)`

- [ ] **Step 6: Uruchom — pass + build**

Run: `npm test app/_lib/__tests__/baselinker-retry.test.ts` → PASS (8 passed).
Run: `npm run build` → SUCCESS.

- [ ] **Step 7: Commit**

```powershell
git add app/_lib/baselinker.ts app/_lib/baselinker-sync.ts app/_lib/__tests__/baselinker-retry.test.ts
git commit -m @'
feat(sync): retry przejściowych błędów BL dla odczytów (backoff, opt-in) — TDD

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 8: Kategoryzacja błędów — `SyncSkippedProduct.kind` (owner/technical)

**Tło:** dziś `skipped[]` miesza 3 klasy z jednym free-text `reason`. Dodajemy `kind` i przekazujemy `kind` + `unmappedCategoryId` z `mapBlToProduct` (reason zawiera dynamiczne `${blCategoryId}` — nie da się go parsować, trzeba surowe id). `kind` opcjonalny w typie (stare logi bez niego → UI traktuje jak `owner`).

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (typ `SyncSkippedProduct`; return `mapBlToProduct`; 3 call-sites push do skipped)

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

- [ ] **Step 2: Zmień sygnaturę zwrotu `mapBlToProduct` + ustaw kind/unmappedCategoryId**

`app/_lib/baselinker-sync.ts:783-786`:
```ts
): Promise<
  | { ok: true; product: ProductInsert; parsedVariants: ParsedVariants }
  | { ok: false; reason: string; kind: "owner" | "technical"; unmappedCategoryId?: number }
> {
```

Zaktualizuj cztery `return { ok: false, ... }` w `mapBlToProduct` (linie 788, 791, 794-799, 802):
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

- [ ] **Step 3: Ustaw `kind` w trzech push-ach do `skipped`**

Mapowanie nieudane (929-934) → dziedziczy z `mapped.kind`:
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

BLOCKER FIX — brak wariantów (963-970) → `owner`:
```ts
          result.skipped.push({
            id: blId,
            name: mapped.product.name,
            reason:
              "BL nie zwrócił wariantów, ale produkt miał wcześniej warianty w DB — " +
              "zachowano stare warianty z zdjęciami admina. Sprawdź w BL czy warianty " +
              "są poprawnie skonfigurowane.",
            kind: "owner",
          });
```

Błąd zapisu (990-994) → `technical`:
```ts
          result.skipped.push({
            id: blId,
            name: mapped.product.name,
            reason: `błąd zapisu: ${error.message}`,
            kind: "technical",
          });
```

- [ ] **Step 4: Build green**

Run: `npm run build` → SUCCESS. (Baseline testy nie dotykają `kind` → dalej zielone.)

- [ ] **Step 5: Commit**

```powershell
git add app/_lib/baselinker-sync.ts
git commit -m @'
feat(sync): kategoryzacja pominiętych produktów (owner vs technical)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 9: Agregacja `unmapped_categories` (K2) + migracja 24 + persystencja raportu w logu

**Tło:** banner K2 musi przeżyć `window.location.reload()` (handleSync robi reload po 1.5s — `BaseLinkerSyncPanel.tsx:57`), więc raport persystujemy do nowej kolumny `baselinker_sync_log.report` (jsonb). Agregacja = czysta funkcja (dedup po `bl_category_id`, count, pierwsza nazwa).

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
-- baselinker_sync_log.results trzyma per-magazyn SyncInventoryResult[].
-- Raport run-level (deactivated/reactivated/hide_skipped_reason/
-- unmapped_categories) wrzucamy do osobnej kolumny jsonb, żeby panel mógł
-- pokazać banner „produkt zniknął — brak mapowania kategorii" także po
-- przeładowaniu strony (z historii). null dla starych logów.
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

- [ ] **Step 3: Implementacja helpera**

W `app/_lib/baselinker-sync.ts` (przy `planDeactivations`) dodaj:
```ts
// Agregacja niezmapowanych kategorii BL do bannera w panelu (K2).
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

- [ ] **Step 4: Akumuluj surowe wpisy w pętli i zbuduj raport**

W `syncProductsFromBaseLinker`, przy akumulatorach (Task 6 Step 2) dodaj:
```ts
    const unmappedRaw: { bl_category_id: number; product_name: string }[] = [];
```

W bloku `if (!mapped.ok)` (Task 8 Step 3, mapowanie nieudane), po `continue`-ującym push dodaj zbieranie (przed `continue;`):
```ts
        if (!mapped.ok) {
          result.skipped.push({
            id: blId,
            name: bl.text_fields?.name ?? "(brak nazwy)",
            reason: mapped.reason,
            kind: mapped.kind,
          });
          if (mapped.unmappedCategoryId != null) {
            unmappedRaw.push({
              bl_category_id: mapped.unmappedCategoryId,
              product_name: bl.text_fields?.name ?? "(brak nazwy)",
            });
          }
          continue;
        }
```

Przy kroku ukrywania (Task 6 Step 6), po obliczeniu `deactivated`, dodaj:
```ts
    const unmapped_categories = aggregateUnmappedCategories(unmappedRaw);
```

W `return { ok: true, ... }` (Task 6 Step 7) dopisz pole:
```ts
      hide_skipped_reason: skippedReason,
      unmapped_categories,
    };
```

- [ ] **Step 5: Persystuj raport w `logSyncOutcome`**

W `app/_lib/baselinker-sync.ts:1085-1100` (wariant `outcome.ok`), dodaj `report` do insertu:
```ts
    await supabase.from("baselinker_sync_log").insert({
      triggered_by: triggeredBy,
      duration_ms: durationMs,
      status,
      total_in_bl: outcome.totals.total_in_bl,
      inserted: outcome.totals.inserted,
      updated: outcome.totals.updated,
      skipped_count: outcome.totals.skipped_count,
      results: outcome.results as unknown as Record<string, unknown>,
      report: {
        deactivated: outcome.deactivated ?? [],
        reactivated: outcome.reactivated ?? [],
        hide_skipped_reason: outcome.hide_skipped_reason ?? null,
        unmapped_categories: outcome.unmapped_categories ?? [],
      } as unknown as Record<string, unknown>,
      error_message: null,
    } as never);
```
W gałęzi błędu (`else`) dopisz `report: null,` analogicznie.

- [ ] **Step 6: Dodaj `report` do `SyncLogRow`**

`app/admin/baselinker/actions.ts:58-71` — dodaj pole (kolumna dociąga się przez `select("*")`):
```ts
  results: unknown;
  report: unknown;
  error_message: string | null;
```

- [ ] **Step 7: Testy + build**

Run: `npm test` → PASS (wszystkie, w tym agregacja).
Run: `npm run build` → SUCCESS.

- [ ] **Step 8: Commit**

```powershell
git add supabase/migrations/24_baselinker_sync_log_report.sql app/_lib/baselinker-sync.ts app/admin/baselinker/actions.ts app/_lib/__tests__/unmapped-categories.test.ts
git commit -m @'
feat(sync): agregacja niezmapowanych kategorii (K2) + persystencja raportu w logu

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA E — Jakość parsera — spec §4.4

## Task 10: Strip wspólnego SUFIKSU w fallbacku (TDD)

**Tło:** dziś jest tylko `commonPrefix` (513-523). Dodajemy `commonSuffix` i stripujemy prefix **oraz** sufiks, ten sam próg `PREFIX_THRESHOLD=5`.

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (nowy `commonSuffix` ~po 523; fallback 734-740)
- Create: `app/_lib/__tests__/parser-suffix.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseVariantsFromBl } from "@/app/_lib/baselinker-sync";

describe("parseVariantsFromBl — strip prefix+suffix", () => {
  it("strip wspólnego sufiksu (tkanina X)", () => {
    const r = parseVariantsFromBl(
      {
        "1": { name: "Sofa Boston Lewa tkanina X" },
        "2": { name: "Sofa Boston Prawa tkanina X" },
      },
      88309,
      1000
    );
    expect(r.kind).toBe("fallback");
    if (r.kind === "fallback") {
      expect(r.variants.options[0].values).toEqual(["Lewa", "Prawa"]);
    }
  });
});
```

Run: `npm test app/_lib/__tests__/parser-suffix.test.ts` → FAIL (zwróci np. `["Lewa tkanina X","Prawa tkanina X"]`).

- [ ] **Step 2: Dodaj `commonSuffix`**

Po `commonPrefix` (po linii 523) w `app/_lib/baselinker-sync.ts`:
```ts
// Longest common suffix (case-sensitive) — bliźniak commonPrefix dla strip
// wspólnego zakończenia nazw wariantów ("... tkanina X").
function commonSuffix(strings: string[]): string {
  if (strings.length === 0) return "";
  let s = strings[0];
  for (let i = 1; i < strings.length; i++) {
    while (!strings[i].endsWith(s)) {
      s = s.slice(1);
      if (!s) return "";
    }
  }
  return s;
}
```

- [ ] **Step 3: Zastosuj strip prefix+suffix w fallbacku**

W `app/_lib/baselinker-sync.ts` zamień blok strip prefixu (734-740) na:
```ts
  // ===== Etap 2: fallback — strip wspólnego prefixu I sufiksu =====
  const prefix = commonPrefix(names);
  const usePrefix = prefix.length >= PREFIX_THRESHOLD;
  const afterPrefix = usePrefix
    ? names.map((n) => n.slice(prefix.length))
    : names.slice();
  const suffix = commonSuffix(afterPrefix);
  const useSuffix = suffix.length >= PREFIX_THRESHOLD;
  const stripped = useSuffix
    ? afterPrefix.map((n) => n.slice(0, n.length - suffix.length))
    : afterPrefix;
  // Capitalize pierwszej litery — BL daje "róż", chcemy "Róż" w UI.
  const rawValues = stripped.map((n) => capitalizeFirst(n.trim()));
```

(Usuwa to dawne `useStripped`/`rawValues` ternary — dalsze użycie `rawValues` pozostaje bez zmian.)

- [ ] **Step 4: Pass + baseline nadal zielony**

Run: `npm test` → PASS (suffix + baseline; baseline „Sofa Boston Lewa/Prawa" bez sufiksu nadal `["Lewa","Prawa"]` bo `commonSuffix(["Lewa","Prawa"])` = "" < próg).

- [ ] **Step 5: Build + commit**

Run: `npm run build` → SUCCESS.
```powershell
git add app/_lib/baselinker-sync.ts app/_lib/__tests__/parser-suffix.test.ts
git commit -m @'
feat(sync): strip wspólnego sufiksu nazw wariantów w fallbacku (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 11: Detekcja opcji „Materiał" (TDD)

**Tło:** `detectOptionName` (602-607) zna Kolor/Rozmiar/Wariant. Dodajemy `MATERIAL_KEYWORDS` + `isMaterialValue`; kolejność: Kolor → Rozmiar → Materiał → Wariant. Reguła konserwatywna (wszystkie wartości muszą pasować).

**Files:**
- Modify: `app/_lib/baselinker-sync.ts` (po `SIZE_PATTERNS` ~582; `detectOptionName` 602-607)
- Modify: `app/_lib/__tests__/baselinker-sync.baseline.test.ts` (dodaj case Materiał)

- [ ] **Step 1: Failing test (dopisz do baseline)**

W `describe("detectOptionName — baseline", ...)` dodaj:
```ts
  it("Materiał gdy wszystkie wartości to materiały tapicerskie", () => {
    expect(detectOptionName(["Welur", "Plusz", "Ekoskóra"])).toBe("Materiał");
  });
```
Run: `npm test` → FAIL (dziś zwróci "Wariant").

- [ ] **Step 2: Dodaj słownik + predykat**

Po `SIZE_PATTERNS` (po linii 582) w `app/_lib/baselinker-sync.ts`:
```ts
// Materiały tapicerskie/obiciowe typowe dla mebli (lowercase).
const MATERIAL_KEYWORDS = new Set([
  "welur", "plusz", "ekoskóra", "ekoskora", "skóra", "skora",
  "sztruks", "boucle", "bouclé", "plecionka", "len", "mikrofibra",
  "tkanina", "żakard", "zakard", "szenil", "filc", "nubuk", "weluropodobny",
]);

function isMaterialValue(v: string): boolean {
  const trimmed = v.trim().toLowerCase();
  if (!trimmed) return false;
  if (MATERIAL_KEYWORDS.has(trimmed)) return true;
  return trimmed.split(/\s+/).some((t) => MATERIAL_KEYWORDS.has(t));
}
```

- [ ] **Step 3: Rozszerz `detectOptionName`**

`app/_lib/baselinker-sync.ts:602-607`:
```ts
function detectOptionName(values: string[]): string {
  if (values.length === 0) return "Wariant";
  if (values.every(isColorValue)) return "Kolor";
  if (values.every(isSizeValue)) return "Rozmiar";
  if (values.every(isMaterialValue)) return "Materiał";
  return "Wariant";
}
```

- [ ] **Step 4: Pass + build + commit**

Run: `npm test` → PASS. Run: `npm run build` → SUCCESS.
```powershell
git add app/_lib/baselinker-sync.ts app/_lib/__tests__/baselinker-sync.baseline.test.ts
git commit -m @'
feat(sync): detekcja opcji wariantu „Materiał" + słownik tkanin (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 12: Tolerancja kluczy case-insensitive w trybie strukturalnym (TDD)

**Tło:** `parseNamedAttrs` (612-626) capitalizuje tylko pierwszą literę klucza, więc „KOLOR" i „Kolor" są różne → produkt wpada w fallback. Normalizujemy klucz do postaci `capitalizeFirst(lowercase(trim(klucz)))`, żeby drobne niespójności wielkości liter nie zrzucały produktu do fallbacku. Wartości zostają jak dziś (`capitalizeFirst(value)`).

**Files:**
- Modify: `app/_lib/baselinker-sync.ts:612-626` (`parseNamedAttrs`)
- Create: `app/_lib/__tests__/parser-key-tolerance.test.ts`

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from "vitest";
import { parseVariantsFromBl } from "@/app/_lib/baselinker-sync";

describe("parseVariantsFromBl — tolerancja wielkości liter klucza", () => {
  it("'KOLOR: X' i 'kolor : Y' grupują się jako jedna opcja Kolor (structured)", () => {
    const r = parseVariantsFromBl(
      { "1": { name: "KOLOR: Beżowy" }, "2": { name: "kolor : Szary" } },
      88309,
      1000
    );
    expect(r.kind).toBe("structured");
    if (r.kind === "structured") {
      expect(r.variants.options).toHaveLength(1);
      expect(r.variants.options[0].name).toBe("Kolor");
      expect(r.variants.options[0].values.sort()).toEqual(["Beżowy", "Szary"]);
    }
  });
});
```

Run: `npm test app/_lib/__tests__/parser-key-tolerance.test.ts` → FAIL (dziś: różne klucze „KOLOR"/„Kolor" → fallback).

- [ ] **Step 2: Normalizuj klucz w `parseNamedAttrs`**

`app/_lib/baselinker-sync.ts:612-626` — zmień TYLKO normalizację klucza (wartość bez zmian):
```ts
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
    // Klucz normalizowany case-insensitive: "KOLOR"/"kolor"/"Kolor " → "Kolor",
    // żeby drobne niespójności wielkości liter nie zrzucały produktu do fallbacku.
    // Wartość zostaje z capitalize pierwszej litery (display).
    result[capitalizeFirst(key.toLowerCase())] = capitalizeFirst(value);
  }
  return Object.keys(result).length > 0 ? result : null;
}
```

- [ ] **Step 3: Pass + baseline zielony + build**

Run: `npm test` → PASS (tolerancja + baseline: „Kolor: X" → klucz „Kolor" bez zmian).
Run: `npm run build` → SUCCESS.

- [ ] **Step 4: Commit**

```powershell
git add app/_lib/baselinker-sync.ts app/_lib/__tests__/parser-key-tolerance.test.ts
git commit -m @'
feat(sync): tolerancja wielkości liter kluczy wariantów w trybie structured (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 13: Determinizm sekcji opisu (K3) + `resolveBlFeatures` + sort kluczy obrazów (TDD)

**Files:**
- Modify: `app/_lib/baselinker.ts` (typ `text_fields.features`)
- Modify: `app/_lib/baselinker-sync.ts` (`extractDescriptionSections` 363-376; `pickFirstImage` 200-206; nowy `resolveBlFeatures`; użycie w `mapBlToProduct` 826-836)
- Create: `app/_lib/__tests__/parser-determinism.test.ts`

- [ ] **Step 1: Failing testy**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  extractDescriptionSections,
  pickFirstImage,
  resolveBlFeatures,
} from "@/app/_lib/baselinker-sync";

describe("extractDescriptionSections — determinizm K3", () => {
  it("ten sam zestaw pól w różnej kolejności → ten sam zestaw sekcji", () => {
    const a = extractDescriptionSections({
      extra_field_10: "Informacje dla klienta: dostawa 4 tyg.",
      extra_field_2: "TILIA 62",
    });
    const b = extractDescriptionSections({
      extra_field_2: "TILIA 62",
      extra_field_10: "Informacje dla klienta: dostawa 4 tyg.",
    });
    expect(a).toEqual(b);
    expect(a.some((s) => s.title === "Informacje dla klienta")).toBe(true);
  });

  it(">1 pole pasujące do wzorca → log ostrzeżenia", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    extractDescriptionSections({
      extra_field_1: "Informacje dla klienta: A",
      extra_field_2: "Informacje dla klienta: B",
    });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

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

describe("pickFirstImage — sort kluczy numerycznych obiektu", () => {
  it("obiekt {2,1,10} → kolejność numeryczna", () => {
    expect(pickFirstImage({ "2": "a.jpg", "1": "b.jpg", "10": "c.jpg" })).toEqual([
      "b.jpg",
      "a.jpg",
      "c.jpg",
    ]);
  });
  it("tablica zostaje bez zmian", () => {
    expect(pickFirstImage(["x.jpg", "y.jpg"])).toEqual(["x.jpg", "y.jpg"]);
  });
});
```

Run: `npm test app/_lib/__tests__/parser-determinism.test.ts` → FAIL.

- [ ] **Step 2: Typ `text_fields.features` w `app/_lib/baselinker.ts`**

W `BLInventoryProduct.text_fields` (96-104) dodaj pole `features` i poszerz index signature (musi być supertypem nazwanych pól):
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

- [ ] **Step 3: `resolveBlFeatures` + użycie w `mapBlToProduct`**

W `app/_lib/baselinker-sync.ts` (przy `getFeature`, ~linia 207) dodaj:
```ts
// Tolerancja źródła cech: audyt na żywych danych BL pokazał, że cechy realnie
// siedzą pod text_fields.features (a kod czytał top-level bl.features). Resolver
// chroni Kolor/Materiał/Konstrukcję/Specyfikację przed cichym wyzerowaniem.
export function resolveBlFeatures(bl: BLInventoryProduct): BLInventoryProduct["features"] {
  return (bl.text_fields?.features as BLInventoryProduct["features"]) ?? bl.features;
}
```

W `mapBlToProduct` (819-845) policz raz i użyj zamiast `bl.features`:
```ts
  const blFeatures = resolveBlFeatures(bl);
  const product: ProductInsert = {
    name: name.trim(),
    description,
    price,
    category: cat.slug,
    images: pickFirstImage(bl.images),
    stock: 0,
    color: getFeature(blFeatures, "Kolor"),
    material: getFeature(blFeatures, "Materiał"),
    dimensions: buildDimensions(bl),
    weight: bl.weight && bl.weight > 0 ? Number(bl.weight) : null,
    construction: getFeature(blFeatures, "Konstrukcja"),
    delivery_time: getFeature(blFeatures, "Czas realizacji"),
    warranty: getFeature(blFeatures, "Gwarancja"),
    features: extractAllFeatures(blFeatures),
    description_sections: extractDescriptionSections(bl.text_fields),
    variants: null,
    is_active: true,
    deactivation_source: null,
    baselinker_id: blId,
    collection_id: null,
  };
```

- [ ] **Step 4: Determinizm + log w `extractDescriptionSections`**

`app/_lib/baselinker-sync.ts:361-377` — zamień pętlę heurystyki na deterministyczną (sort kluczy) + log gdy >1 kandydat:
```ts
  // Heurystycznie wykryj "Informacje dla klienta". Sortujemy klucze przed
  // skanem — kolejność iteracji obiektu (extra_field_NNN) nie jest gwarantowana
  // (optymalizacja V8), więc bez sortu ta sama treść BL dawała różne sekcje.
  const candidates: { key: string; value: string }[] = [];
  for (const [key, value] of Object.entries(fields).sort(([a], [b]) =>
    a < b ? -1 : a > b ? 1 : 0
  )) {
    if (CONSUMED_FIELDS.has(key)) continue;
    if (typeof value !== "string") continue;
    const stripped = value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    if (stripped.length === 0) continue;
    const head = stripped.slice(0, 100);
    if (INFO_SECTION_PATTERNS.some((re) => re.test(head))) {
      candidates.push({ key, value });
    }
  }
  if (candidates.length > 1) {
    console.warn(
      `[BL sync] >1 pole pasuje do „Informacje dla klienta" (${candidates
        .map((c) => c.key)
        .join(", ")}) — biorę pierwsze po sortowaniu: ${candidates[0].key}`
    );
  }
  if (candidates.length > 0) {
    sections.push({
      title: "Informacje dla klienta",
      body: candidates[0].value.trim(),
      kind: "text",
    });
  }

  return sections;
}
```

- [ ] **Step 5: Sort kluczy w `pickFirstImage`**

`app/_lib/baselinker-sync.ts:200-206`:
```ts
function pickFirstImage(images: BLInventoryProduct["images"]): string[] {
  if (!images) return [];
  // Obiekt {1,2,3} → sortuj klucze numerycznie (kolejność galerii stabilna
  // między syncami). Tablica → bez zmian.
  const ordered = Array.isArray(images)
    ? images
    : Object.keys(images)
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => images[k]);
  return ordered.filter((v): v is string => typeof v === "string" && v.length > 0);
}
```

- [ ] **Step 6: Pass + baseline zielony + build**

Run: `npm test` → PASS (determinizm + baseline: stary `extractDescriptionSections` test „Opis/Wymiary/puste" dalej zielony; `pickFirstImage(["a.jpg","b.jpg"])` dalej `["a.jpg","b.jpg"]`).
Run: `npm run build` → SUCCESS.

- [ ] **Step 7: Commit**

```powershell
git add app/_lib/baselinker.ts app/_lib/baselinker-sync.ts app/_lib/__tests__/parser-determinism.test.ts
git commit -m @'
feat(sync): determinizm sekcji opisu (K3) + resolveBlFeatures + sort kluczy obrazów (TDD)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# FAZA F — UI panelu + ręczny toggle — spec §4.2/§4.3/§5

## Task 14: Panel — wspólny `<SyncReport>` (ukryto/przywrócono/wstrzymano + banner K2)

**Tło:** raport pokazujemy w DWÓCH miejscach: na żywo (`ResultSummary`, czyta `result.outcome`) oraz w historii (`LogRow`, czyta `log.report` — przeżywa reload). Jeden wspólny komponent. Banner K2 = wyróżniony, na górze.

**Files:**
- Modify: `app/admin/baselinker/BaseLinkerSyncPanel.tsx` (nowy `SyncReport`; użycie w `ResultSummary` ~161-188 i `LogRow` ~489-579)

- [ ] **Step 1: Dodaj typ raportu + komponent `SyncReport`**

W `app/admin/baselinker/BaseLinkerSyncPanel.tsx` (przy innych pomocniczych komponentach, np. po `ProductList`/`SkippedRow` ~483) dodaj:
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

  const hasAnything =
    deactivated.length > 0 ||
    reactivated.length > 0 ||
    unmapped.length > 0 ||
    !!hideSkipped;
  if (!hasAnything) return null;

  return (
    <div className="space-y-3">
      {/* Banner K2 — najczęstsza przyczyna „produkt zniknął" */}
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

- [ ] **Step 2: Pokaż `<SyncReport>` na żywo w `ResultSummary`**

W `ResultSummary` (`BaseLinkerSyncPanel.tsx:161-188`), po paragrafie z czasem (po linii 181, przed `result.outcome.results.map`) dodaj:
```tsx
      <SyncReport report={result.outcome as SyncReportData} />
```
(`result.outcome` zawiera teraz pola raportu; rzut na `SyncReportData` jest bezpieczny — pola opcjonalne.)

- [ ] **Step 3: Pokaż `<SyncReport>` w historii (`LogRow`)**

W `LogRow` (rozwijany detal, po rzutowaniu `results` ~508), w renderze rozwiniętego logu, przed mapowaniem `results` na `InventoryResult`, dodaj odczyt + render raportu z `log.report`:
```tsx
  const report =
    log.report && typeof log.report === "object"
      ? (log.report as SyncReportData)
      : null;
```
i w JSX rozwiniętej części (gdzie renderowane są `InventoryResult`) dodaj na górze:
```tsx
          {report && <SyncReport report={report} />}
```

- [ ] **Step 4: Build green**

Run: `npm run build` → SUCCESS.

- [ ] **Step 5: Commit**

```powershell
git add app/admin/baselinker/BaseLinkerSyncPanel.tsx
git commit -m @'
feat(admin): panel BL — sekcje ukryto/przywrócono/wstrzymano + banner kategorii (K2)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 15: Panel — grupowanie pominiętych na „do poprawienia w BL" vs „błąd techniczny"

**Tło:** `InventoryResult` (190-257) renderuje `inv.skipped` płasko przez `SkippedRow`. Rozdzielamy po `kind` (undefined → owner, dla starych logów).

**Files:**
- Modify: `app/admin/baselinker/BaseLinkerSyncPanel.tsx` (`InventoryResult` 226-247 — sekcja skipped)

- [ ] **Step 1: Rozdziel skipped na dwie grupy**

W `InventoryResult`, zamień blok renderujący skipped (`{inv.skipped.length > 0 && (...)}`, ~226-247) na grupowanie:
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
(`showAllSkipped`/`setShowAllSkipped` i `visibleSkipped` już istnieją w komponencie — `visibleSkipped` można usunąć, jeśli nieużywane gdzie indziej.)

- [ ] **Step 2: Build green + lint**

Run: `npm run build` → SUCCESS. Run: `npm run lint` → brak błędów (usuń ewentualne nieużywane `visibleSkipped`).

- [ ] **Step 3: Commit**

```powershell
git add app/admin/baselinker/BaseLinkerSyncPanel.tsx
git commit -m @'
feat(admin): panel BL — rozdziel pominięte na „do poprawienia w BL" vs „błąd techniczny"

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

## Task 16: `/admin/produkty` — badge „ukryty" + ręczny toggle Ukryj/Przywróć

**Tło:** lista produktów (`page.tsx`) czyta przez `createClient()` — admin widzi też ukryte dzięki nowej polityce admin-SELECT (Task 1). `select("*")` dociąga `is_active`. Toggle = client component (jak `DeleteProductButton`) wołający nową server action `setProductActive`.

**Files:**
- Modify: `app/admin/produkty/actions.ts` (nowa `setProductActive`)
- Create: `app/admin/produkty/ToggleProductActiveButton.tsx`
- Modify: `app/admin/produkty/page.tsx` (import + badge + przycisk w wierszu)

- [ ] **Step 1: Server action `setProductActive`**

W `app/admin/produkty/actions.ts` (przy innych akcjach, np. po `updateProductBasics`) dodaj:
```ts
// Ręczne ukrycie/przywrócenie produktu. Ukrycie → deactivation_source='manual'
// (sync NIE reaktywuje, respektuje decyzję admina). Przywrócenie → null.
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

W `app/admin/produkty/page.tsx`:

Import (po linii 7):
```tsx
import DeleteProductButton from "./DeleteProductButton";
import ToggleProductActiveButton from "./ToggleProductActiveButton";
```

W `<li>` produktu: dodaj badge „ukryty" przy nazwie (w bloku `<div className="flex-1 min-w-0">`, po `<p ...>{p.name}</p>`):
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

Przed `<DeleteProductButton .../>` dodaj toggle:
```tsx
                <ToggleProductActiveButton productId={p.id} isActive={p.is_active} />
                <DeleteProductButton productId={p.id} productName={p.name} />
```

- [ ] **Step 4: Build green + lint**

Run: `npm run build` → SUCCESS. Run: `npm run lint` → OK.

- [ ] **Step 5: Commit**

```powershell
git add app/admin/produkty/actions.ts app/admin/produkty/ToggleProductActiveButton.tsx app/admin/produkty/page.tsx
git commit -m @'
feat(admin): ręczny toggle Ukryj/Przywróć produkt + badge „ukryty"

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
'@
```

---

# Weryfikacja end-to-end (po zaaplikowaniu migracji 23 + 24 w Supabase)

Po wdrożeniu wszystkich tasków i zaaplikowaniu obu migracji przez właściciela, potwierdź kryteria akceptacji (spec §8) ręcznie w `/admin/baselinker` i `/admin/produkty`:

- [ ] Produkt usunięty z BL → po sync `is_active=false`, znika z `/sklep`, wyszukiwarki, sitemap; jego strona daje 404 (dla niezalogowanego); rekord + historia zamówień zostają.
- [ ] Ten sam produkt wraca do BL → po sync automatycznie `is_active=true` (sekcja „Przywrócono").
- [ ] Produkt ukryty RĘCZNIE w `/admin/produkty` (badge „ukryty") — kolejny sync go NIE przywraca (bo `deactivation_source='manual'`).
- [ ] Niezmapowana kategoria BL → produkt pominięty, panel pokazuje **banner K2** z listą ID + CTA `/admin/kategorie` (banner widoczny też po przeładowaniu strony — z historii).
- [ ] Pominięte produkty rozdzielone na „do poprawienia w BL" / „błąd techniczny".
- [ ] `npm test` zielony; `npm run build` przechodzi.

Przypomnienie dla właściciela na koniec: **zaaplikuj `supabase/migrations/23_products_is_active.sql` i `24_baselinker_sync_log_report.sql` w panelu Supabase** (jak migracje 12-17).

---

# Self-Review (autor planu)

**1. Pokrycie specu (§3 zakres):**
- `is_active` + RLS + 404 → Task 1, 2 ✓ (404 działa „za darmo" przez RLS: `getProduct`→null→`notFound()`).
- Auto-ukrywanie + bezpieczniki + raport + auto-reaktywacja → Task 5, 6 ✓.
- Ręczny toggle → Task 16 ✓.
- Auto-retry odczytów + kategoryzacja błędów → Task 7, 8 ✓.
- Banner K2 niezmapowanych kategorii → Task 9 (agregacja+persystencja) + 14 (UI) ✓.
- K3/W6 determinizm sekcji + log → Task 13 ✓.
- `resolveBlFeatures` (tolerancja `text_fields.features ?? features`) → Task 13 ✓.
- Sort kluczy obrazów → Task 13 ✓.
- Parser: tolerancja kluczy, suffix, materiał → Task 10, 11, 12 ✓.
- Vitest + testy czystych funkcji → Task 3, 4, 5, 7, 9, 10, 11, 12, 13 ✓.

**2. Skan placeholderów:** brak „TBD/TODO/itp." w krokach modyfikujących kod. Jedyny świadomy open-item to zbiór `TRANSIENT_BL_ERROR_CODES` (kod rate-limit BL do potwierdzenia na żywym koncie — spec §9); zostawiony jako jawna, działająca stała z komentarzem (retry działa dla 5xx/429/sieci niezależnie).

**3. Spójność typów/nazw:**
- `is_active`/`deactivation_source` użyte spójnie w: types.ts (Product), migracji 23, mapBlToProduct (default), pętli sync (reaktywacja), planDeactivations call-site, setProductActive — wszędzie te same nazwy ✓.
- `SyncedProduct = {id,name}` — `deactivated`/`reactivated` używają tego kształtu ✓.
- `UnmappedCategory {bl_category_id, sample_product_name, count}` — spójne między helperem, SyncOutcome, persystencją i `SyncReportData` w UI ✓.
- `SyncSkippedProduct.kind` opcjonalny — UI (Task 15) traktuje `undefined` jak `owner` (wsteczna kompatybilność starych logów) ✓.
- `report` jsonb (migracja 24) ↔ `SyncLogRow.report` ↔ `SyncReportData` w `LogRow` ✓.

**Ryzyka pilnowane w trakcie wykonania:**
- Task 2 build może wykazać inne konstruktory `Product` — naprawić analogicznie (oczekiwany tylko `mapBlToProduct`).
- Zmiany parsera (10-13) NIE mogą złamać baseline (Task 4) — każdy task kończy `npm test` na całości.
- Przy `extractDescriptionSections` cast `fields as Record<string,string|undefined>` po poszerzeniu index signature: jeśli TS zgłosi niezgodność, użyć `as unknown as Record<string,string|undefined>`.
