# Pełne wycięcie BaseLinkera — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Usunąć BaseLinkera (BL) z kodu, env i bazy tak, by nie był widoczny ani aktywny nigdzie — zachowując jedynie licznik zaległych tłumaczeń DE (przeniesiony na dashboard).

**Architecture:** Najpierw ratujemy jedyną przydatną funkcję ze strony BL (licznik tłumaczeń DE → współdzielony helper + sekcja na `/admin`). Potem kasujemy pliki czysto-BL (moduły, routes, cron, panel admina, testy), chirurgicznie usuwamy odniesienia BL z plików współdzielonych (kategorie, produkty, typy), redagujemy widoczne stringi i komentarze, na końcu migracja drop kolumn + czyszczenie env. Każdy commit zostawia zielone `tsc`/`lint`/`build`.

**Tech Stack:** Next.js 16.2.4 (App Router, Turbopack), React 19.2.4, TypeScript, Vitest (node), Supabase.

**Spec:** `docs/superpowers/specs/2026-06-24-usun-baselinker-design.md`

## Global Constraints

- **Pełne wycięcie BL** — po zmianie `grep -ri baselinker app/` nie zwraca trafień w kodzie aplikacji (dopuszczalne tylko w `docs/` i historycznych migracjach `07/11/24/25`).
- **Zachować licznik tłumaczeń DE** (`needs_translation=true`) — przeniesiony do `app/_lib/translations.ts` (`getPendingTranslationCount(): Promise<number>`) i pokazany jako sekcja na `/admin`.
- **Panel admina PL-only**; komentarze po polsku.
- **Migracja drop uruchamiana przez człowieka** w Supabase, PO deployu kodu (kod już nie odwołuje się do kolumn). Migracja idempotentna (`if exists`). Destrukcyjna — utrata historycznych `baselinker_*` (świadomie).
- **Każdy commit: `tsc`/`lint`/`build` zielone.** Po usunięciu testów liczba testów spada — to oczekiwane; reszta MUSI być zielona.
- **Nie ruszać `.env.local`** (sekrety; i tak puste). Czyścimy tylko `.env.example`.
- **Bramki z katalogu `sklep-meblowy/`.** npm. Branch `chore/usun-baselinker` (z `main`, spec scommitowany). Push/PR osobno, za zgodą (konto Woodecky10).

## File Structure

- **Create** `app/_lib/translations.ts` — `getPendingTranslationCount()` (przeniesione z `admin/baselinker/page.tsx`).
- **Modify** `app/admin/page.tsx` — async, sekcja „tłumaczenia DE do zrobienia" nad `CARDS`.
- **Delete** (czysto-BL): `app/_lib/baselinker.ts`, `baselinker-sync.ts`, `baselinker-orders.ts`, `baselinker-reconcile.ts`, `baselinker-status-sync.ts`; cały `app/api/baselinker/`; `app/api/cron/reconcile-bl/`; cały `app/admin/baselinker/`; 7 plików testów (patrz Task 2).
- **Modify** (kategorie): `app/_lib/categories.ts`, `app/admin/kategorie/KategorieEditor.tsx`, `app/admin/kategorie/actions.ts`.
- **Modify** (produkty): `app/admin/produkty/[id]/ProductEditor.tsx`, `app/produkt/[id]/page.tsx`, `app/_lib/new-product.ts`, `app/_lib/__tests__/new-product.test.ts`, `app/_lib/types.ts`, `app/admin/produkty/actions.ts`.
- **Modify** (stringi/komentarze): `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx`, `app/admin/polecane/FeaturedEditor.tsx`, `app/admin/_shared.tsx`, `app/_lib/de-content-maps.ts`, `app/_lib/product-html.ts`.
- **Create** `supabase/migrations/34_drop_baselinker.sql`.
- **Modify** `.env.example`.

Kolejność celowa: T1 ratuje licznik ZANIM skasujemy panel; T2 usuwa masę plików; T3/T4 czyszczą pliki współdzielone (tsc zielone na każdym kroku); T5 redaguje copy + komentarze + grep-clean; T6 migracja+env; T7 bramki.

---

### Task 1: Licznik tłumaczeń DE → helper + dashboard

Najpierw przenosimy jedyną wartościową funkcję ze strony BL, żeby jej nie stracić przy kasowaniu panelu (T2).

**Files:**
- Create: `app/_lib/translations.ts`
- Modify: `app/admin/page.tsx`

**Interfaces:**
- Consumes: `createAdminClient` z `@/app/_lib/supabase/server`.
- Produces: `getPendingTranslationCount(): Promise<number>` — liczy produkty z `needs_translation=true`; przy błędzie loguje i zwraca `0`.

- [ ] **Step 1: Utwórz `app/_lib/translations.ts`**

```ts
// app/_lib/translations.ts
import { createAdminClient } from "@/app/_lib/supabase/server";

// Ile produktów czeka na ręczne tłumaczenie DE (needs_translation=true).
// Brak kolumny (migracja 29 nieodpalona) → zwracamy 0.
export async function getPendingTranslationCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count, error } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("needs_translation", true);
  if (error) {
    console.error("[i18n] odczyt needs_translation count nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}
```

- [ ] **Step 2: Pokaż licznik na dashboardzie `app/admin/page.tsx`**

Zamień nagłówek importów i sygnaturę komponentu na async + pobranie licznika, i dołóż sekcję nad siatką `CARDS`. Dodaj import:
```ts
import { getPendingTranslationCount } from "@/app/_lib/translations";
```
Zmień `export default function AdminDashboardPage() {` na:
```tsx
export default async function AdminDashboardPage() {
  const pendingTranslations = await getPendingTranslationCount();
```
Bezpośrednio po bloku nagłówka (`</div>` zamykającym „Pulpit", przed `<div className="grid ...">`) wstaw:
```tsx
      {pendingTranslations > 0 && (
        <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5">
          <p className="text-sm text-[var(--fg)]">
            Czeka na tłumaczenie DE:{" "}
            <strong className="text-amber-700 dark:text-amber-300">
              {pendingTranslations}{" "}
              {pendingTranslations === 1 ? "produkt" : "produktów"}
            </strong>{" "}
            —{" "}
            <Link href="/admin/produkty" className="text-[var(--color-gold)] underline">
              przejdź do produktów
            </Link>
          </p>
        </div>
      )}
```
(`Link` z `next/link` jest już importowany w tym pliku.)

- [ ] **Step 3: Bramki**

Run (z `sklep-meblowy/`): `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.

- [ ] **Step 4: Commit**

```bash
git add app/_lib/translations.ts app/admin/page.tsx
git commit -m "feat(admin): licznik zaleglych tlumaczen DE na dashboardzie (z panelu BL)"
```

---

### Task 2: Usuń pliki czysto-BaseLinker

Kasujemy moduły, API, cron, panel admina i testy BL. Te pliki tworzą zamknięty graf importów (żaden plik spoza listy ich nie importuje — zweryfikowane), więc po usunięciu drzewo dalej się kompiluje.

**Files (Delete):**
- `app/_lib/baselinker.ts`, `app/_lib/baselinker-sync.ts`, `app/_lib/baselinker-orders.ts`, `app/_lib/baselinker-reconcile.ts`, `app/_lib/baselinker-status-sync.ts`
- `app/api/baselinker/` (cały katalog: `sync-products/`, `test/`, `raw/`, `push-order/`)
- `app/api/cron/reconcile-bl/`
- `app/admin/baselinker/` (cały katalog: `page.tsx`, `BaseLinkerSyncPanel.tsx`, `actions.ts`)
- Testy: `app/_lib/__tests__/baselinker-retry.test.ts`, `baselinker-orders.test.ts`, `baselinker-reconcile.test.ts`, `baselinker-status-sync.test.ts`, `plan-deactivations.test.ts`, `unmapped-categories.test.ts`, `sync-features-images.test.ts`

> 3 ostatnie testy importują helpery z `app/_lib/baselinker-sync.ts` (`planDeactivations`, `aggregateUnmappedCategories`, sync features/images) — usuwamy je razem z modułem.

- [ ] **Step 1: Usuń pliki**

```bash
git rm app/_lib/baselinker.ts app/_lib/baselinker-sync.ts app/_lib/baselinker-orders.ts app/_lib/baselinker-reconcile.ts app/_lib/baselinker-status-sync.ts
git rm -r app/api/baselinker app/api/cron/reconcile-bl app/admin/baselinker
git rm app/_lib/__tests__/baselinker-retry.test.ts app/_lib/__tests__/baselinker-orders.test.ts app/_lib/__tests__/baselinker-reconcile.test.ts app/_lib/__tests__/baselinker-status-sync.test.ts app/_lib/__tests__/plan-deactivations.test.ts app/_lib/__tests__/unmapped-categories.test.ts app/_lib/__tests__/sync-features-images.test.ts
```

- [ ] **Step 2: Bramki — weryfikują brak wiszących importów**

Run: `npx tsc --noEmit`
Expected: 0 błędów. Jeśli `tsc` zgłosi „Cannot find module './baselinker…'" w pliku SPOZA listy — to plik, który trzeba dołożyć do edycji w T3/T4 (zgłoś / dostosuj). Wg analizy `getCategoryByBaselinkerId` w `categories.ts` był importowany TYLKO przez usunięty `baselinker-sync.ts`, więc zostaje jako martwy eksport (usuwany w T3) — nie powoduje błędu tsc.
Run: `npm run lint` → 0. `npm run build` → przechodzi.
Run: `npm test` → zielony (znikło 7 plików testów; reszta przechodzi).

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(bl): usun moduly/API/cron/panel/testy BaseLinkera"
```

---

### Task 3: Usuń BL z kategorii

`baselinker_category_id` znika z lib kategorii, edytora i akcji. Kolumna DB zostaje do migracji T6 (kod jej już nie czyta).

**Files:**
- Modify: `app/_lib/categories.ts`
- Modify: `app/admin/kategorie/KategorieEditor.tsx`
- Modify: `app/admin/kategorie/actions.ts`

- [ ] **Step 1: `categories.ts`**

- Usuń pole z typu `CategoryDef` (linia ~60): `baselinkerCategoryId: number | null;`
- W wewnętrznym typie wiersza DB (linia ~125) usuń: `baselinker_category_id: number | null;`
- W mapowaniu (`deCat`/`getData`, linia ~137) usuń: `baselinkerCategoryId: c.baselinker_category_id,`
- Jeśli `getData()` selektuje kolumny jawnie i zawiera `baselinker_category_id` — usuń je z `.select(...)`. (Jeśli używa `select("*")` — bez zmian, nadmiarowa kolumna jest ignorowana, a po migracji T6 zniknie.)
- Usuń całą funkcję `getCategoryByBaselinkerId` (linie ~233-238) — jedyny jej importer (`baselinker-sync.ts`) został usunięty w T2.

- [ ] **Step 2: `KategorieEditor.tsx`**

- Usuń blok wyświetlania (linie ~180-182):
```tsx
                                {cat.baselinkerCategoryId !== null && (
                                  <> · BL: {cat.baselinkerCategoryId}</>
                                )}
```
- Usuń pole formularza „ID kategorii w BaseLinker" w `CategoryForm` (linie ~461-472): cały `<Field label="ID kategorii w BaseLinker" …>…<input name="baselinker_category_id" …/></Field>`.

- [ ] **Step 3: `kategorie/actions.ts`**

- W akcji create (linie ~164, 179) usuń: parsowanie `const baselinkerCategoryId = parseOptionalBigInt(formData.get("baselinker_category_id"));` oraz pole `baselinker_category_id: baselinkerCategoryId,` z obiektu insert.
- W akcji update (linie ~206, 221) analogicznie usuń parsowanie i pole z obiektu update.
- Jeśli `parseOptionalBigInt` przestaje być używany po tych usunięciach — usuń jego import/definicję (lint to wykaże).

- [ ] **Step 4: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/categories.ts app/admin/kategorie/KategorieEditor.tsx app/admin/kategorie/actions.ts
git commit -m "chore(bl): usun mapowanie baselinker_category_id z kategorii"
```

---

### Task 4: Usuń BL z produktów + typu `Product`

`baselinker_id` znika z typu, kreatora produktu, karty produktu (SKU) i edytora (akordeon diagnostyczny). Najpierw usuwamy WSZYSTKIE użycia, potem pole typu — żeby `tsc` był zielony.

**Files:**
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx`
- Modify: `app/produkt/[id]/page.tsx`
- Modify: `app/_lib/new-product.ts`
- Modify: `app/_lib/__tests__/new-product.test.ts`
- Modify: `app/_lib/types.ts`
- Modify: `app/admin/produkty/actions.ts`

- [ ] **Step 1: `ProductEditor.tsx` — usuń akordeon BL**

- Usuń blok renderujący (linie ~415-420):
```tsx
      {/* ============================================================
          Sekcja: Surowe dane z BaseLinker (debug / diagnostyka)
          ============================================================ */}
      {product.baselinker_id && (
        <BaseLinkerRawSection baselinkerId={product.baselinker_id} />
      )}
```
- Usuń całą funkcję `BaseLinkerRawSection` (linie ~425-506).
- Jeśli `useState` przestaje być używane w tym pliku po usunięciu funkcji — zostaw, jeśli używają go inne sekcje (lint wskaże, jeśli nie).

- [ ] **Step 2: `produkt/[id]/page.tsx` — SKU bez BL**

Linia ~178: zamień
```ts
    sku: product.baselinker_id ?? product.id,
```
na
```ts
    sku: product.id,
```

- [ ] **Step 3: `new-product.ts` — usuń `baselinker_id`**

- W typie payloadu (linia ~24) usuń `baselinker_id: null;`.
- W budowanym obiekcie (linia ~75) usuń `baselinker_id: null,`.

- [ ] **Step 4: `new-product.test.ts` — zdejmij asercję `baselinker_id`**

Usuń linię(e) testu asertujące `baselinker_id` (np. `expect(payload.baselinker_id).toBe(null)` / pole w `toEqual`). Reszta testu (nazwa/cena/kategoria/needs_translation/stock) bez zmian.

- [ ] **Step 5: `types.ts` — usuń pole + popraw komentarz**

- Linia ~113: usuń `baselinker_id: string | null;` z interfejsu `Product`.
- Linia ~145: w komentarzu przy `fullname` zamień „(potrzebne dla BaseLinker / kuriera)" na „(potrzebne dla wysyłki / przewoźnika)". Pole `fullname` ZOSTAJE.

- [ ] **Step 6: `admin/produkty/actions.ts` — komentarze**

Przeredaguj komentarze wspominające BaseLinkera (linie ~268, 271, 350, 352, 548), tak by nie odnosiły się do BL (np. „URL-e zewnętrzne (Unsplash itp.)", „Tworzenie nowego produktu (natywne)", usuń zdanie „nie usuwa produktu z BaseLinkera…"). Bez zmian funkcjonalnych.

- [ ] **Step 7: Bramki**

Run: `npx tsc --noEmit` → 0 (potwierdza brak pozostałych odniesień do `Product.baselinker_id`). `npm run lint` → 0. `npm test` → zielony. `npm run build` → przechodzi.

- [ ] **Step 8: Commit**

```bash
git add app/admin/produkty/[id]/ProductEditor.tsx app/produkt/[id]/page.tsx app/_lib/new-product.ts app/_lib/__tests__/new-product.test.ts app/_lib/types.ts app/admin/produkty/actions.ts
git commit -m "chore(bl): usun baselinker_id z typu Product, kreatora, SKU i edytora produktu"
```

---

### Task 5: Widoczne stringi BL + sweep komentarzy + grep-clean

Usuwamy ostatnie WIDOCZNE wzmianki BL (copy w edytorach) i komentarze, aż `grep -ri baselinker app/` jest czyste.

**Files:**
- Modify: `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx`
- Modify: `app/admin/polecane/FeaturedEditor.tsx`
- Modify: `app/admin/_shared.tsx`
- Modify: `app/_lib/de-content-maps.ts`
- Modify: `app/_lib/product-html.ts`

- [ ] **Step 1: `DescriptionSectionsEditor.tsx` — copy bez BL**

- Linie ~156-158 (tekst dla admina): zamień wzmiankę „sync z BaseLinkerem ich nie zmienia… Sekcje zaimportowane kiedyś z BL możesz nadpisać" na wersję bez BL, np.: „Wszystkie sekcje opisu są zarządzane **tutaj**. Sekcje pochodzące z dawnego importu możesz **nadpisać**."
- Linia ~369 (etykieta): zamień „Z BaseLinkera (import) — edytuj przez override" na „Z importu — edytuj przez override".
- Linie ~197, 290 (komentarze odsyłające do `baselinker-sync.ts`): przeredaguj/usuń odniesienie (plik nie istnieje) — opisz logikę override bez wzmianki o BL.
- Mechanizm override (`admin_title`/`admin_body`) BEZ zmian — tylko copy/komentarze.

- [ ] **Step 2: `FeaturedEditor.tsx` — komunikat bez BL**

Linia ~182: zamień „zsynchronizuj nowy produkt z BaseLinkera (Admin → BaseLinker)" na np.: „dodaj nowy produkt (Admin → Produkty → Nowy produkt)".

- [ ] **Step 3: Komentarze w `_shared.tsx`, `de-content-maps.ts`, `product-html.ts`**

- `_shared.tsx` (~linia 6): usuń/przeredaguj komentarz o `BaseLinkerSyncPanel` (panel nie istnieje). Jeśli `ToastView` jest „bogatszy" tylko z powodu BL i nie jest już używany w tym kształcie — zostaw kod, popraw tylko komentarz.
- `de-content-maps.ts` (~linia 3): przeredaguj komentarz „wartości pochodzą z BaseLinkera /…" → bez BL.
- `product-html.ts` (~linia 2): „Sanitize HTML opisu produktu (z BaseLinkera lub admina)" → „…(opisu produktu)".

- [ ] **Step 4: Weryfikacja grep-clean**

Run (z `sklep-meblowy/`): `grep -rin baselinker app/`
Expected: brak trafień. Jeśli coś zostało — dokończ. (Dozwolone trafienia tylko poza `app/`: `docs/`, historyczne migracje.)

- [ ] **Step 5: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.

- [ ] **Step 6: Commit**

```bash
git add app/admin/produkty/[id]/DescriptionSectionsEditor.tsx app/admin/polecane/FeaturedEditor.tsx app/admin/_shared.tsx app/_lib/de-content-maps.ts app/_lib/product-html.ts
git commit -m "chore(bl): usun widoczne stringi i komentarze BaseLinkera (grep-clean app/)"
```

---

### Task 6: Migracja drop kolumn + czyszczenie `.env.example`

**Files:**
- Create: `supabase/migrations/34_drop_baselinker.sql`
- Modify: `.env.example`

- [ ] **Step 1: Utwórz migrację**

```sql
-- supabase/migrations/34_drop_baselinker.sql
-- Pelne wyciecie BaseLinkera: usuniecie kolumn i tabeli logu BL.
-- DESTRUKCYJNE: traci historyczne odniesienia baselinker_* na zamowieniach/produktach.
-- Uruchomic PO deployu kodu bez BL (kod juz nie czyta tych kolumn).
alter table public.products  drop column if exists baselinker_id;
alter table public.orders    drop column if exists baselinker_order_id;
alter table public.orders    drop column if exists baselinker_push_error;
alter table public.categories drop column if exists baselinker_category_id;
drop table if exists public.baselinker_sync_log;
-- Indeksy na powyzszych kolumnach/tabeli znikaja automatycznie.
```

- [ ] **Step 2: Wyczyść `.env.example`**

Usuń blok zmiennych BL wraz z komentarzami: `BASELINKER_API_TOKEN`, `BASELINKER_DEFAULT_STATUS_ID`, `BASELINKER_SYNC_SECRET`, `BL_STATUS_PROCESSING_IDS`, `BL_STATUS_SHIPPED_IDS`, `BL_STATUS_DELIVERED_IDS`, `BL_STATUS_CANCELLED_IDS` (i ewentualny `CRON_SECRET`, jeśli był tylko dla cronu BL — jeśli używany gdzie indziej, zostaw).

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi. (Migracji NIE uruchamiamy — odpala człowiek po deployu.)

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/34_drop_baselinker.sql .env.example
git commit -m "chore(bl): migracja 34 drop kolumn/tabeli BL + czyszczenie .env.example"
```

---

### Task 7: Pełne bramki + smoke końcowy

**Files:** brak zmian (chyba że bramki coś wykażą).

- [ ] **Step 1: Pełny zestaw bramek (z `sklep-meblowy/`)**

```bash
npx tsc --noEmit      # 0
npm run lint          # 0
npm test              # vitest — zielony (mniej testów: -7 plików BL)
npm run build         # Turbopack przechodzi
grep -rin baselinker app/   # brak trafień w kodzie aplikacji
```

- [ ] **Step 2: Smoke (ręcznie, `npm run dev`)**

- [ ] `/admin/baselinker` → 404 (strona nie istnieje).
- [ ] `/admin` → dashboard pokazuje sekcję „Czeka na tłumaczenie DE: X" z linkiem do produktów (gdy są zaległości).
- [ ] `/admin/produkty/[id]` → edytor otwiera się bez sekcji „Surowe dane z BaseLinker" (także dla starego produktu z importu).
- [ ] `/admin/kategorie` → lista i formularz bez pól/etykiet BL.
- [ ] `/admin/polecane` → komunikat „brak produktów" bez wzmianki o BL.
- [ ] Sklep, koszyk, checkout, `/konto/zamowienia` → działają (brak regresji).

- [ ] **Step 3: Commit (jeśli bramki coś poprawiły)**

```bash
git add -A
git commit -m "chore(bl): domkniecie bramek wyciecia BaseLinkera"
```

> **DEPLOY (człowiek, po merge):** uruchomić `supabase/migrations/34_drop_baselinker.sql` w Supabase SQL Editorze. Niezależne od migracji 32/33.

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:** moduły/API/cron/panel/testy (T2), kategorie (T3), produkty + typ (T4), widoczne stringi + komentarze + grep-clean (T5), migracja drop + env (T6), licznik tłumaczeń zachowany i przeniesiony (T1), bramki/smoke (T7). Spec §3 był niepełny (4 testy) — plan obejmuje pełny ślad z audytu (7 testów, SKU, new-product, copy w edytorach, komentarze) zgodnie z intencją §2/§7. Migracja idempotentna + kolejność „kod→migracja" (§5). Pokryte.

**Placeholder scan:** brak TBD/„handle errors". Każdy krok ma realny kod/komendę lub konkretną instrukcję usunięcia z kotwicą (numery linii `~` + cytat fragmentu). Brak „similar to".

**Type consistency:** `getPendingTranslationCount(): Promise<number>` spójne (T1 definicja, T2 usuwa starą lokalną kopię wraz z panelem). Usunięcia `baselinker_id`/`baselinkerCategoryId` skoordynowane: wszystkie użycia usuwane przed/wraz z polem typu (T3 kategorie, T4 produkty), `tsc` jako bramka spójności na każdym kroku. Kolumny DB usuwane dopiero w T6 (kod już ich nie czyta), bez hazardu kolejności (select("*") toleruje brak/obecność kolumny).

## Execution Handoff

Plan zapisany w `docs/superpowers/plans/2026-06-24-usun-baselinker.md`. Dwie opcje wykonania:

1. **Subagent-Driven (zalecane)** — świeży subagent na task + recenzja między taskami.
2. **Inline Execution** — wykonanie w tej sesji (executing-plans), batch z checkpointami.
