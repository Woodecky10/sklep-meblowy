# Selektor rozmiaru przez grupę produktów — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na stronie produktu pokazać kompaktowy selektor rozmiaru, w którym kliknięcie w inny rozmiar przenosi do odpowiedniej aukcji (osobnego produktu w tym sklepie).

**Architecture:** Wspólny klucz `size_group` + `size_label` na produkcie (2 nowe kolumny). Strona produktu pobiera „rodzeństwo" z tym samym kluczem (mirror `getCollectionSiblings`) i renderuje selektor nad istniejącym selektorem wariantów. Silnik kombinacji (`ProductVariants`) nietknięty. Czysta logika sortowania/budowania opcji wydzielona do testowalnego modułu bez zależności server-only.

**Tech Stack:** Next.js (App Router, wersja w `node_modules/next/dist/docs` — patrz Global Constraints), TypeScript, Supabase (Postgres + RLS), Vitest, Tailwind (zmienne CSS `var(--…)`).

**Spec:** `docs/superpowers/specs/2026-06-24-selektor-rozmiaru-grupa-design.md`

## Global Constraints

- **Next.js inny niż znany** — przed pisaniem kodu Next-specyficznego przeczytaj odpowiedni guide w `node_modules/next/dist/docs/`; heed deprecation notices (z `AGENTS.md`).
- **i18n PL/DE** — każdy nowy string widoczny dla klienta MUSI mieć wpis PL i DE w słownikach; `de.ts` zgodny z typem z `pl.ts` (tsc to wymusza).
- **Admin UX trywialny** — pola dla nietechnicznej osoby: zwykłe inputy tekstowe + jasny hint, zero HTML/JSON.
- **Migracje stosowane ręcznie** — Mikołaj aplikuje pliki migracji na Supabase (dev + prod) sam; plan tworzy tylko plik. Feature działa end-to-end dopiero po zastosowaniu migracji na bazie.
- **BaseLinker wycięty** — nie dodawać żadnych odwołań do BL.
- **Etykiety rozmiaru bez tłumaczenia** — `size_label` (np. „140×200 cm") jest pass-through PL/DE; brak kolumn `_de`.

---

### Task 1: Model danych — migracja 35 + typ `Product`

**Files:**
- Create: `supabase/migrations/35_size_groups.sql`
- Modify: `app/_lib/types.ts:116` (typ `Product`, po `collection_id`)

**Interfaces:**
- Produces: kolumny `products.size_group text`, `products.size_label text`; pola `Product.size_group: string | null`, `Product.size_label: string | null`.

- [ ] **Step 1: Utwórz plik migracji**

`supabase/migrations/35_size_groups.sql`:
```sql
-- Migracja 35: grupy rozmiarów — łączą osobne produkty/aukcje tego samego
-- mebla w różnych rozmiarach. Strona produktu pokazuje selektor rozmiaru
-- pobierając produkty z tym samym size_group (mirror collection siblings).
--
-- size_group  — wspólny klucz grupy (np. 'loze-vegas'), ten sam na każdym rozmiarze.
-- size_label  — etykieta tego rozmiaru (np. '140×200 cm') pokazywana na chipie.
alter table products
  add column if not exists size_group text,
  add column if not exists size_label text;

-- Indeks częściowy pod lookup rodzeństwa (where size_group is not null).
create index if not exists products_size_group_idx
  on products (size_group)
  where size_group is not null;
```

- [ ] **Step 2: Dodaj pola do typu `Product`**

W `app/_lib/types.ts`, w typie `Product`, zaraz po linii `collection_id: string | null;` dodaj:
```ts
  // Grupa rozmiarów (migracja 35) — łączy osobne produkty tego samego mebla
  // w różnych rozmiarach. size_group: wspólny klucz; size_label: etykieta tego
  // rozmiaru ("140×200 cm"). Selektor rozmiaru na karcie produktu pokazuje
  // rodzeństwo z tym samym size_group. Pass-through PL/DE (brak kolumn _de).
  size_group: string | null;
  size_label: string | null;
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS (brak błędów). Nowe pola dziedziczą się do `Database['products']` przez istniejące `Omit<Product, …>`.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/35_size_groups.sql app/_lib/types.ts
git commit -m "feat(size): migracja 35 (size_group/size_label) + pola w typie Product

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Czysty helper `buildSizeOptions` (TDD)

**Files:**
- Create: `app/_lib/size-groups.ts`
- Test: `app/_lib/__tests__/size-groups.test.ts`

**Interfaces:**
- Produces:
  - `type SizeOption = { id: string; label: string; current: boolean }`
  - `buildSizeOptions(siblings: { id: string; size_label: string | null; name: string }[], currentId: string): SizeOption[]`
- Konsumowane później przez `SizeSelector` (Task 4) i `page.tsx` (Task 4).

- [ ] **Step 1: Napisz failing test**

`app/_lib/__tests__/size-groups.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildSizeOptions } from "@/app/_lib/size-groups";

const siblings = [
  { id: "c", size_label: "180×200 cm", name: "Łóżko 180" },
  { id: "a", size_label: "140×200 cm", name: "Łóżko 140" },
  { id: "b", size_label: "160×200 cm", name: "Łóżko 160" },
];

describe("buildSizeOptions", () => {
  it("sortuje naturalnie po etykiecie (140 < 160 < 180) niezależnie od kolejności wejścia", () => {
    const out = buildSizeOptions(siblings, "a");
    expect(out.map((o) => o.id)).toEqual(["a", "b", "c"]);
  });

  it("oznacza dokładnie jeden bieżący produkt flagą current", () => {
    const out = buildSizeOptions(siblings, "b");
    expect(out.find((o) => o.current)?.id).toBe("b");
    expect(out.filter((o) => o.current)).toHaveLength(1);
  });

  it("zwraca [] gdy mniej niż 2 pozycje (jedna aukcja = brak selektora)", () => {
    expect(
      buildSizeOptions([{ id: "a", size_label: "140×200 cm", name: "X" }], "a")
    ).toEqual([]);
  });

  it("fallback etykiety do nazwy gdy size_label puste/whitespace/null", () => {
    const out = buildSizeOptions(
      [
        { id: "a", size_label: "   ", name: "Łóżko A" },
        { id: "b", size_label: null, name: "Łóżko B" },
      ],
      "a"
    );
    expect(out.find((o) => o.id === "a")?.label).toBe("Łóżko A");
    expect(out.find((o) => o.id === "b")?.label).toBe("Łóżko B");
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAIL**

Run: `npx vitest run app/_lib/__tests__/size-groups.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/size-groups"` / `buildSizeOptions is not a function`.

- [ ] **Step 3: Zaimplementuj minimalny moduł**

`app/_lib/size-groups.ts`:
```ts
// Czysta logika selektora rozmiaru — bez zależności server-only, żeby była
// testowalna bez mockowania Supabase (wzorzec jak localize.ts / search-filter.ts).
// Server-owe pobranie rodzeństwa jest w products.ts (getSizeSiblings).

export type SizeOption = { id: string; label: string; current: boolean };

type SizeSibling = { id: string; size_label: string | null; name: string };

// Buduje opcje selektora rozmiaru z rodzeństwa (produktów z tym samym size_group).
// Etykieta = size_label (po trim) lub nazwa produktu jako fallback.
// Sortowanie naturalne po etykiecie (numeric) → "140×200" < "160×200" < "180×200".
// Zwraca [] gdy < 2 pozycji — jedna aukcja nie potrzebuje selektora.
export function buildSizeOptions(
  siblings: SizeSibling[],
  currentId: string
): SizeOption[] {
  const options: SizeOption[] = siblings.map((s) => ({
    id: s.id,
    label: s.size_label?.trim() || s.name,
    current: s.id === currentId,
  }));
  options.sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { numeric: true })
  );
  return options.length >= 2 ? options : [];
}
```

- [ ] **Step 4: Uruchom test — ma PASS**

Run: `npx vitest run app/_lib/__tests__/size-groups.test.ts`
Expected: PASS (4 testy).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/size-groups.ts app/_lib/__tests__/size-groups.test.ts
git commit -m "feat(size): czysty helper buildSizeOptions + testy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Server read `getSizeSiblings` + klucze i18n

**Files:**
- Modify: `app/_lib/products.ts` (dodaj funkcję na końcu modułu, po `getRelatedProducts`)
- Modify: `app/_lib/dictionaries/pl.ts` (typ `product` ~linia 40 + wartość ~linia 296)
- Modify: `app/_lib/dictionaries/de.ts` (wartość ~linia 46)

**Interfaces:**
- Consumes: `Product` (Task 1), `localizeProduct`, `createClient`, `Locale` (już importowane w products.ts).
- Produces: `getSizeSiblings(sizeGroup: string, locale?: Locale): Promise<Product[]>`; klucz słownika `product.sizeLabel: string`.

- [ ] **Step 1: Dodaj `getSizeSiblings` do `products.ts`**

Na końcu `app/_lib/products.ts` dodaj:
```ts
// ============================================================
// Rodzeństwo rozmiarowe — produkty z tym samym size_group
// ============================================================
// Używane przez selektor rozmiaru na karcie produktu. Anon client (createClient)
// respektuje RLS is_active, więc ukryte produkty nie pojawią się w selektorze.
// Zawiera też bieżący produkt — buildSizeOptions (size-groups.ts) go oznacza.
export async function getSizeSiblings(
  sizeGroup: string,
  locale: Locale = DEFAULT_LOCALE
): Promise<Product[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("size_group", sizeGroup);
  return ((data ?? []) as Product[]).map((p) => localizeProduct(p, locale));
}
```

- [ ] **Step 2: Dodaj klucz `sizeLabel` do typu Dictionary (pl.ts)**

W `app/_lib/dictionaries/pl.ts`, w bloku typu `product: { … }`, zaraz po `selectVariant: string;` dodaj:
```ts
    sizeLabel: string;
```

- [ ] **Step 3: Dodaj wartość PL**

W `app/_lib/dictionaries/pl.ts`, w obiekcie wartości `product: { … }`, zaraz po `selectVariant: "Wybierz wariant",` dodaj:
```ts
    sizeLabel: "Rozmiar",
```

- [ ] **Step 4: Dodaj wartość DE**

W `app/_lib/dictionaries/de.ts`, w obiekcie `product: { … }`, zaraz po `selectVariant: "Variante wählen",` dodaj:
```ts
    sizeLabel: "Größe",
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS. (Brak klucza w którymś słowniku → tsc zgłosi błąd zgodności typu — to celowy guard.)

- [ ] **Step 6: Commit**

```bash
git add app/_lib/products.ts app/_lib/dictionaries/pl.ts app/_lib/dictionaries/de.ts
git commit -m "feat(size): getSizeSiblings + klucz słownika sizeLabel (PL/DE)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Render — komponent `SizeSelector` + wpięcie w stronę produktu

**Files:**
- Create: `app/_components/ui/SizeSelector.tsx`
- Modify: `app/_components/ui/ProductMainSection.tsx` (prop + render nad `<ProductActions>`)
- Modify: `app/produkt/[id]/page.tsx` (fetch rodzeństwa + przekazanie `sizeOptions`)

**Interfaces:**
- Consumes: `SizeOption`, `buildSizeOptions` (Task 2), `getSizeSiblings` (Task 3), `LocalizedLink`, `useClientLocale`, `getDictionary`.
- Produces: `<SizeSelector options={SizeOption[]} />`; prop `ProductMainSection.sizeOptions: SizeOption[]`.

- [ ] **Step 1: Utwórz komponent `SizeSelector`**

`app/_components/ui/SizeSelector.tsx`:
```tsx
"use client";

import LocalizedLink from "./LocalizedLink";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { SizeOption } from "@/app/_lib/size-groups";

// Selektor rozmiaru: chipy w stylu VariantSelector. Bieżący rozmiar = podświetlony
// nieklikalny span; pozostałe = linki do /produkt/{id} (LocalizedLink zachowuje /de).
// Self-guard: < 2 opcji → nic nie renderuje.
export default function SizeSelector({ options }: { options: SizeOption[] }) {
  const locale = useClientLocale();
  const t = getDictionary(locale);
  if (options.length < 2) return null;

  return (
    <div>
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
        {t.product.sizeLabel}
      </p>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) =>
          opt.current ? (
            <span
              key={opt.id}
              aria-current="true"
              className="px-4 py-2 text-sm font-sans rounded-full border border-[var(--color-gold)] bg-[var(--color-gold)] text-[var(--color-navy)] font-semibold"
            >
              {opt.label}
            </span>
          ) : (
            <LocalizedLink
              key={opt.id}
              href={`/produkt/${opt.id}`}
              className="px-4 py-2 text-sm font-sans rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] transition-colors"
            >
              {opt.label}
            </LocalizedLink>
          )
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Dodaj prop `sizeOptions` i render do `ProductMainSection`**

W `app/_components/ui/ProductMainSection.tsx`:

(a) Po imporcie `ProductActions` (linia 11) dodaj importy:
```tsx
import SizeSelector from "./SizeSelector";
import type { SizeOption } from "@/app/_lib/size-groups";
```

(b) W sygnaturze propsów (po `specifications: { label: string; value: string }[];`, przed `}: {`-zamknięciem destrukturyzacji) dodaj pole. Konkretnie w bloku typu propsów dodaj:
```tsx
  sizeOptions: SizeOption[];
```
…oraz w liście destrukturyzowanych argumentów (`{ product, categoryLabel, rating, specifications }`) dodaj `sizeOptions`:
```tsx
}: {
  product: Product;
  categoryLabel: string | null;
  rating: ProductRating;
  specifications: { label: string; value: string }[];
  sizeOptions: SizeOption[];
}) {
```

(c) Tuż przed `<ProductActions` (linia ~108) wstaw:
```tsx
        <SizeSelector options={sizeOptions} />

```

- [ ] **Step 3: Pobierz rodzeństwo i przekaż w `page.tsx`**

W `app/produkt/[id]/page.tsx`:

(a) W imporcie z `@/app/_lib/products` (linie 4–8) dodaj `getSizeSiblings`:
```tsx
import {
  getProduct,
  getRelatedProducts,
  getCrossSellProducts,
  getSizeSiblings,
} from "@/app/_lib/products";
```

(b) Dodaj import helpera (np. po linii 31, obok innych importów `@/app/_lib/...`):
```tsx
import { buildSizeOptions } from "@/app/_lib/size-groups";
```

(c) Po `if (!product) notFound();` (linia 90) dodaj:
```tsx
  // Selektor rozmiaru: rodzeństwo z tym samym size_group (osobne aukcje per rozmiar).
  const sizeSiblings = product.size_group
    ? await getSizeSiblings(product.size_group, locale)
    : [];
  const sizeOptions = buildSizeOptions(sizeSiblings, product.id);
```

(d) W JSX `<ProductMainSection … />` (linie ~236–241) dodaj prop:
```tsx
      <ProductMainSection
        product={product}
        categoryLabel={categoryLabel ?? null}
        rating={rating}
        specifications={details}
        sizeOptions={sizeOptions}
      />
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add app/_components/ui/SizeSelector.tsx app/_components/ui/ProductMainSection.tsx app/produkt/[id]/page.tsx
git commit -m "feat(size): SizeSelector na karcie produktu (linki do innych rozmiarów)

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Admin — pola `size_group`/`size_label` + zapis + datalist

**Files:**
- Modify: `app/_lib/products.ts` (dodaj `getSizeGroupKeys`; rozszerz import o `createAdminClient`)
- Modify: `app/admin/produkty/[id]/page.tsx` (fetch kluczy + przekaż prop)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (prop `sizeGroupKeys` + 2 pola + datalist)
- Modify: `app/admin/produkty/actions.ts:144-156` (`updateProductBasics` — parse + save)

**Interfaces:**
- Consumes: `createAdminClient`, `getSizeGroupKeys`.
- Produces: `getSizeGroupKeys(): Promise<string[]>`; prop `ProductEditor.sizeGroupKeys: string[]`; zapis kolumn `size_group`/`size_label` w `updateProductBasics`.

- [ ] **Step 1: Dodaj import `createAdminClient` w `products.ts`**

W `app/_lib/products.ts` zmień pierwszą linię importu:
```ts
import { createClient, createAdminClient } from "./supabase/server";
```
(Jeśli `createClient` importowany osobno — dołącz `createAdminClient` do tego samego importu z `"./supabase/server"`.)

- [ ] **Step 2: Dodaj `getSizeGroupKeys` do `products.ts`**

Pod `getSizeSiblings` dodaj:
```ts
// Distinct klucze size_group (do podpowiedzi/datalist w adminie). Admin client —
// pokazujemy też klucze produktów nieaktywnych, żeby admin trafił w istniejący klucz.
export async function getSizeGroupKeys(): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("size_group")
    .not("size_group", "is", null);
  const keys = new Set<string>();
  for (const r of (data ?? []) as { size_group: string | null }[]) {
    if (r.size_group) keys.add(r.size_group);
  }
  return Array.from(keys).sort((a, b) => a.localeCompare(b));
}
```

- [ ] **Step 3: Pobierz klucze i przekaż w admin `page.tsx`**

W `app/admin/produkty/[id]/page.tsx`:

(a) Dodaj `getSizeGroupKeys` do importu z products (linia 3):
```tsx
import { getProduct, getSizeGroupKeys } from "@/app/_lib/products";
```

(b) Dołącz do `Promise.all` (linie 19–23):
```tsx
  const [product, categories, de, sizeGroupKeys] = await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
    getSizeGroupKeys(),
  ]);
```

(c) Przekaż prop do `ProductEditor` (linia 26):
```tsx
  return (
    <ProductEditor
      product={product}
      categories={categories}
      de={de}
      sizeGroupKeys={sizeGroupKeys}
    />
  );
```

- [ ] **Step 4: Dodaj prop + pola w `ProductEditor.tsx`**

W `app/admin/produkty/[id]/ProductEditor.tsx`:

(a) W sygnaturze komponentu (linie 21–29) dodaj prop:
```tsx
export default function ProductEditor({
  product,
  categories,
  de,
  sizeGroupKeys,
}: {
  product: Product;
  categories: CategoryDef[];
  de: ProductDeFields;
  sizeGroupKeys: string[];
}) {
```

(b) W formularzu „Podstawowe dane", zaraz po `<Field label="Materiał (do filtra)">…</Field>` (linie 214–216), dodaj:
```tsx
          <Field
            label="Grupa rozmiarów (klucz)"
            hint="Wpisz ten sam klucz na wszystkich rozmiarach tego mebla, np. loze-vegas. Zostaw puste, jeśli produkt nie ma innych rozmiarów."
          >
            <input
              name="size_group"
              list="size-group-keys"
              defaultValue={product.size_group ?? ""}
              maxLength={100}
              className={inputClass}
            />
            <datalist id="size-group-keys">
              {sizeGroupKeys.map((k) => (
                <option key={k} value={k} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Etykieta rozmiaru"
            hint="np. 140×200 cm — tekst na przycisku rozmiaru widoczny dla klienta."
          >
            <input
              name="size_label"
              defaultValue={product.size_label ?? ""}
              maxLength={100}
              className={inputClass}
            />
          </Field>
```

- [ ] **Step 5: Zapisz pola w `updateProductBasics`**

W `app/admin/produkty/actions.ts`, w obiekcie `updates` (linie 144–156), po `warranty: …` dodaj:
```ts
    size_group: emptyToNull(sanitize(formData.get("size_group"), 100)),
    size_label: emptyToNull(sanitize(formData.get("size_label"), 100)),
```

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add app/_lib/products.ts app/admin/produkty/[id]/page.tsx app/admin/produkty/[id]/ProductEditor.tsx app/admin/produkty/actions.ts
git commit -m "feat(size): pola grupy rozmiarów w adminie + zapis + datalist kluczy

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Weryfikacja end-to-end

**Files:** brak zmian (tylko uruchomienia + ewentualne poprawki).

- [ ] **Step 1: Pełny typecheck + lint + testy**

Run: `npx tsc --noEmit`
Expected: PASS.

Run: `npm run lint`
Expected: brak nowych błędów.

Run: `npm run test`
Expected: cały zestaw (w tym 4 nowe `buildSizeOptions`) PASS.

- [ ] **Step 2: Zastosuj migrację 35 na bazie dev**

⚠️ Wymaga ręcznego zastosowania `supabase/migrations/35_size_groups.sql` na bazie używanej przez dev (i później na prod — robi Mikołaj). Bez tego kolumny nie istnieją i smoke poniżej padnie na zapisie.

- [ ] **Step 3: Smoke manualny (PL)**

1. W `/admin` wejdź w dwa (lub więcej) produkty-rozmiary tego samego mebla. Każdemu ustaw ten sam **Grupa rozmiarów (klucz)** (np. `loze-test`) i różne **Etykieta rozmiaru** (np. `140×200 cm`, `160×200 cm`). Zapisz „Podstawowe dane".
2. Otwórz `/produkt/{id}` jednego z nich. Oczekiwane: nad selektorem koloru/strony widać sekcję „Rozmiar" z chipami; bieżący rozmiar podświetlony (gold), pozostałe klikalne.
3. Kliknij inny rozmiar → przenosi do `/produkt/{id}` tej aukcji; tam ten rozmiar jest podświetlony.
4. Produkt bez grupy (lub jedyny w grupie) → selektor się NIE pokazuje.

- [ ] **Step 4: Smoke manualny (DE)**

1. Otwórz `/de/produkt/{id}` tego samego produktu. Oczekiwane: nagłówek selektora to „Größe"; etykiety rozmiarów bez zmian („140×200 cm"); kliknięcie zostaje na `/de/...` (LocalizedLink).

- [ ] **Step 5: Commit ewentualnych poprawek**

Jeśli smoke ujawnił poprawki — commit z opisem. Jeśli czysto — brak commita.

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:**
- Model danych (kolumny + typ) → Task 1 ✓
- Warstwa odczytu (`getSizeSiblings` + `buildSizeOptions`) → Task 2 + Task 3 ✓ (helper wydzielony do `size-groups.ts` zamiast `products.ts` — udoskonalenie testowalności, zgodne z wzorcem `localize.ts`)
- Render (page → ProductMainSection → SizeSelector) → Task 4 ✓
- Admin (pola + datalist + `updateProductBasics` + `getSizeGroupKeys`) → Task 5 ✓
- i18n (`sizeLabel` PL/DE) → Task 3 ✓
- Edge cases (<2 ukryte, fallback nazwy, trim, RLS) → Task 2 (helper) + Task 5 (`emptyToNull(sanitize())`) + Task 3 (anon client/RLS) ✓
- Testy `buildSizeOptions` → Task 2 ✓
- Poza zakresem (cena per rozmiar, nowy produkt form, dwukierunkowość, `_de`) → niezaimplementowane celowo ✓

**Placeholder scan:** brak TBD/TODO/„obsłuż błędy" — każdy krok ma konkretny kod i komendę.

**Type consistency:** `SizeOption`/`buildSizeOptions` zdefiniowane w Task 2 i użyte tymi samymi nazwami/typami w Task 4; `getSizeSiblings` (Task 3) i `getSizeGroupKeys` (Task 5) zgodne z konsumentami; `sizeOptions` prop spójny page↔ProductMainSection.
