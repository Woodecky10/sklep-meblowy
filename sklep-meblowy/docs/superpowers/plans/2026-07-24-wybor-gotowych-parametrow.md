# Wybór gotowych parametrów w edytorze produktu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** W bloku „Parametry produktu" edytora admina dodać przycisk „+ Wybierz z listy" z rozwijaną listą nazw parametrów (auto z wszystkich produktów ∪ stała lista startowa), obok zachowanego dodawania własnej nazwy.

**Architecture:** Czysta funkcja `collectFeatureKeySuggestions` w istniejącym module `app/_lib/product-features.ts` (seed + klucze z bazy, dedupe, filtr, sort pl) → helper serwerowy `getFeatureKeySuggestionsAdmin` w `app/_lib/products.ts` → prop do klienckiego `ProductEditor.tsx`, gdzie prosty dropdown dodaje wiersz z prefilled nazwą. Zero zmian w zapisie (`features_json`/`parseFeatureRows`) i DB.

**Tech Stack:** Next.js (App Router), React 19, TypeScript, Supabase (admin client), Vitest.

**Spec:** `docs/superpowers/specs/2026-07-24-wybor-gotowych-parametrow-design.md`

## Global Constraints

- Katalog roboczy poleceń: `C:\Users\wood1\sklep-meblowy` (npm, tsc, vitest). ⚠️ Root repo git to `C:\Users\wood1` (projekt siedzi w podfolderze `sklep-meblowy/` — tak jest też na GitHubie); polecenia `git` uruchamiane z cwd projektu działają normalnie na ścieżkach względnych.
- To NIE jest znany Ci Next.js — przy wątpliwościach czytaj `node_modules/next/dist/docs/` (AGENTS.md).
- Teksty UI po polsku, w stylu istniejących (cudzysłowy „…", &bdquo;&rdquo; w JSX tam gdzie sąsiedni kod tak robi).
- NIE zmieniać: `parseFeatureRows`, `MAX_FEATURES` (30), akcji `updateProductBasics`, schematu DB.
- Weryfikacja każdego taska: `npm test` (vitest, wszystkie zielone) + `npx tsc --noEmit`.
- Commity na branchu `feat/wybor-gotowych-parametrow` (już istnieje, jest na nim commit ze spec-iem).

---

### Task 1: Czysta logika — seed, dedicated, collectFeatureKeySuggestions (+ testy, TDD)

**Files:**
- Modify: `app/_lib/product-features.ts` (dopisać na końcu)
- Test: `app/_lib/__tests__/product-features.test.ts` (dopisać describe)

**Interfaces:**
- Consumes: nic nowego (moduł istnieje, ma `parseFeatureRows`, `MAX_FEATURES`).
- Produces (Task 2 i 3 polegają na dokładnie tych nazwach):
  - `export const SEED_FEATURE_KEYS: string[]`
  - `export const DEDICATED_FEATURE_KEYS: string[]`
  - `export function collectFeatureKeySuggestions(featuresLists: unknown[]): string[]`

- [ ] **Step 1: Dopisz failujące testy**

Na końcu `app/_lib/__tests__/product-features.test.ts` (poza istniejącym `describe("parseFeatureRows")`), rozszerzając import:

```ts
import {
  parseFeatureRows,
  MAX_FEATURES,
  collectFeatureKeySuggestions,
  SEED_FEATURE_KEYS,
  DEDICATED_FEATURE_KEYS,
} from "../product-features";

describe("collectFeatureKeySuggestions", () => {
  it("bez danych z bazy zwraca seed posortowany po polsku", () => {
    const out = collectFeatureKeySuggestions([]);
    expect(out).toHaveLength(SEED_FEATURE_KEYS.length);
    expect(out).toEqual([...SEED_FEATURE_KEYS].sort((a, b) => a.localeCompare(b, "pl")));
    expect(out).toContain("Wysokość nóżek");
  });

  it("dokłada klucze z produktów i sortuje po polsku razem z seedem (ł między l i m)", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "Łączenie modułów", value: "x" }],
      [{ key: "Lampki LED", value: "x" }],
      [{ key: "Moduł USB", value: "x" }],
    ]);
    const iL = out.indexOf("Lampki LED");
    const iLl = out.indexOf("Łączenie modułów");
    const iM = out.indexOf("Moduł USB");
    expect(iL).toBeGreaterThanOrEqual(0);
    expect(iL).toBeLessThan(iLl);
    expect(iLl).toBeLessThan(iM);
  });

  it("dedupe trim + case-insensitive — pisownia seeda wygrywa z bazą", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "  wysokość nóżek ", value: "12 cm" }],
      [{ key: "WYSOKOŚĆ NÓŻEK", value: "10 cm" }],
    ]);
    expect(out.filter((k) => k.toLowerCase() === "wysokość nóżek")).toEqual([
      "Wysokość nóżek",
    ]);
  });

  it("dedupe case-insensitive między produktami — pierwsza pisownia z bazy wygrywa", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "Stelaż", value: "x" }],
      [{ key: "stelaż", value: "y" }],
    ]);
    expect(out.filter((k) => k.toLowerCase() === "stelaż")).toEqual(["Stelaż"]);
  });

  it("filtruje DEDICATED_FEATURE_KEYS case-insensitive", () => {
    const out = collectFeatureKeySuggestions([
      [{ key: "Kolor", value: "szary" }, { key: "Waga", value: "80 kg" }],
      [{ key: "MATERIAŁ", value: "welur" }, { key: "Stelaż", value: "buk" }],
    ]);
    expect(out).toContain("Stelaż");
    for (const dedicated of DEDICATED_FEATURE_KEYS) {
      expect(out.map((k) => k.toLowerCase())).not.toContain(dedicated.toLowerCase());
    }
  });

  it("pomija śmieci: nie-tablice, elementy bez key, nie-stringi, puste po trim, >100 zn.", () => {
    const out = collectFeatureKeySuggestions([
      null,
      "tekst",
      42,
      [{ value: "bez klucza" }, { key: 7, value: "x" }, { key: "   ", value: "x" }],
      [{ key: "a".repeat(101), value: "x" }],
      [{ key: "Poprawny", value: "x" }],
    ]);
    expect(out).toContain("Poprawny");
    expect(out).toHaveLength(SEED_FEATURE_KEYS.length + 1);
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować na braku eksportów**

Run: `npx vitest run app/_lib/__tests__/product-features.test.ts`
Expected: FAIL (np. `collectFeatureKeySuggestions is not a function` / brak eksportu).

- [ ] **Step 3: Implementacja w `app/_lib/product-features.ts`**

Dopisz na końcu pliku:

```ts
// Lista startowa sugestii nazw parametrów (edytor produktu) — kanoniczna
// pisownia: przy dedupe wygrywa z pisownią spotkaną w bazie.
export const SEED_FEATURE_KEYS: string[] = [
  "Głębokość siedziska",
  "Grubość boczka",
  "Materac wbudowany",
  "Pojemnik na pościel",
  "Powierzchnia spania",
  "Szerokość dwójki",
  "Szerokość otomany",
  "Tył mebla tapicerowany",
  "Wysokość boczka",
  "Wysokość materaca",
  "Wysokość nóżek",
  "Wysokość poduszki",
  "Wysokość siedziska",
  "Wysokość skrzyni",
];

// Klucze pomijane na karcie produktu (mają dedykowane pola) — jedno źródło
// prawdy dla renderu specyfikacji (produkt/[id]/page.tsx) i filtra sugestii.
export const DEDICATED_FEATURE_KEYS: string[] = [
  "kolor",
  "materiał",
  "material",
  "wymiary",
  "konstrukcja",
  "czas realizacji",
  "gwarancja",
  "waga",
];

// Sugestie nazw parametrów dla edytora: SEED_FEATURE_KEYS ∪ klucze z surowych
// kolumn `features` (jsonb) wielu produktów. Wejście defensywne (unknown[]).
// Dedupe po trim + lowercase (pierwszy wygrywa — seed idzie pierwszy), filtr
// DEDICATED_FEATURE_KEYS, klucz nie-string/pusty/>100 zn. pomijany, wynik
// sortowany po polsku.
export function collectFeatureKeySuggestions(featuresLists: unknown[]): string[] {
  const dedicated = new Set(DEDICATED_FEATURE_KEYS.map((k) => k.toLowerCase()));
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (raw: unknown) => {
    if (typeof raw !== "string") return;
    const key = raw.trim();
    if (!key || key.length > 100) return;
    const lower = key.toLowerCase();
    if (dedicated.has(lower) || seen.has(lower)) return;
    seen.add(lower);
    out.push(key);
  };
  for (const k of SEED_FEATURE_KEYS) push(k);
  for (const list of featuresLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      push((item as { key?: unknown }).key);
    }
  }
  return out.sort((a, b) => a.localeCompare(b, "pl"));
}
```

- [ ] **Step 4: Testy zielone**

Run: `npx vitest run app/_lib/__tests__/product-features.test.ts`
Expected: PASS (wszystkie, także istniejące `parseFeatureRows`).

- [ ] **Step 5: Pełna weryfikacja + commit**

Run: `npm test && npx tsc --noEmit`
Expected: wszystkie testy PASS, tsc bez błędów.

```bash
git add app/_lib/product-features.ts app/_lib/__tests__/product-features.test.ts
git commit -m "feat(admin): collectFeatureKeySuggestions — seed + klucze z produktów (sugestie nazw parametrów)"
```

---

### Task 2: Serwer — helper admin + prop do edytora + wspólna stała na karcie

**Files:**
- Modify: `app/_lib/products.ts` (nowy helper na końcu, obok `getSizeGroupMembersAdmin`)
- Modify: `app/admin/produkty/[id]/page.tsx` (fetch + prop)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (tylko przyjęcie propa — UI w Task 3)
- Modify: `app/produkt/[id]/page.tsx` (inline DEDICATED_KEYS → import wspólnej stałej)

**Interfaces:**
- Consumes (Task 1): `collectFeatureKeySuggestions(featuresLists: unknown[]): string[]`, `DEDICATED_FEATURE_KEYS: string[]` z `@/app/_lib/product-features`.
- Produces (Task 3 polega na tym): `ProductEditor` ma prop `featureKeySuggestions: string[]`.

- [ ] **Step 1: Helper w `app/_lib/products.ts`**

Dopisz import `collectFeatureKeySuggestions` do istniejącego importu z `./product-features` (jeśli products.ts nic stamtąd nie importuje — nowa linia importu) i dodaj na końcu pliku:

```ts
// Sugestie nazw parametrów dla edytora produktu — klucze `features` ze
// WSZYSTKICH produktów (też ukrytych, stąd admin client) ∪ SEED_FEATURE_KEYS.
// Błąd zapytania → [] (edytor działa, tylko bez podpowiedzi).
export async function getFeatureKeySuggestionsAdmin(): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from("products").select("features");
  if (error) return [];
  return collectFeatureKeySuggestions(
    (data ?? []).map((r) => (r as { features: unknown }).features)
  );
}
```

(`createAdminClient` jest już importowany w products.ts — używa go `getSizeGroupMembersAdmin`.)

- [ ] **Step 2: Fetch + prop w `app/admin/produkty/[id]/page.tsx`**

Do importu z `@/app/_lib/products` dołóż `getFeatureKeySuggestionsAdmin`, rozszerz `Promise.all` i przekaż prop:

```ts
const [product, categories, de, fabrics, fabricGroups, featureKeySuggestions] =
  await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
    getAllFabrics(),
    getFabricPriceGroups(),
    getFeatureKeySuggestionsAdmin(),
  ]);
```

oraz w JSX:

```tsx
<ProductEditor
  product={product}
  categories={categories}
  de={de}
  sizeGroupMembers={sizeGroupMembers}
  fabrics={fabrics}
  fabricGroups={fabricGroups}
  featureKeySuggestions={featureKeySuggestions}
/>
```

- [ ] **Step 3: Prop w `ProductEditor.tsx` (bez UI)**

W sygnaturze komponentu (destrukturyzacja + typ):

```ts
export default function ProductEditor({
  product,
  categories,
  de,
  sizeGroupMembers,
  fabrics,
  fabricGroups,
  featureKeySuggestions,
}: {
  product: Product;
  categories: CategoryDef[];
  de: ProductDeFields;
  sizeGroupMembers: SizeGroupMember[];
  fabrics: Fabric[];
  fabricGroups: FabricPriceGroup[];
  featureKeySuggestions: string[];
}) {
```

- [ ] **Step 4: Wspólna stała w `app/produkt/[id]/page.tsx`**

Dodaj import:

```ts
import { DEDICATED_FEATURE_KEYS } from "@/app/_lib/product-features";
```

i zastąp inline literał (linie ~171-182, blok `const DEDICATED_KEYS = new Set([...].map(...))`) przez:

```ts
const DEDICATED_KEYS = new Set(
  DEDICATED_FEATURE_KEYS.map((s) => s.toLowerCase())
);
```

Komentarz nad blokiem zostaje. Zachowanie identyczne (ta sama lista — porównaj z Task 1).

- [ ] **Step 5: Weryfikacja + commit**

Run: `npm test && npx tsc --noEmit`
Expected: PASS / bez błędów. (UI użyje propa dopiero w Task 3 — destrukturyzowany prop komponentu nie łamie no-unused-vars; gdyby lint jednak zgłosił unused, zostaw pole w typie propsów, a nazwę usuń z destrukturyzacji do Task 3.)

```bash
git add app/_lib/products.ts "app/admin/produkty/[id]/page.tsx" "app/admin/produkty/[id]/ProductEditor.tsx" "app/produkt/[id]/page.tsx"
git commit -m "feat(admin): sugestie nazw parametrów — fetch do edytora + wspólna stała DEDICATED_FEATURE_KEYS"
```

---

### Task 3: UI — przycisk „+ Wybierz z listy" z dropdownem + fokus wartości

**Files:**
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (blok „Parametry produktu", linie ~347-417)

**Interfaces:**
- Consumes (Task 2): prop `featureKeySuggestions: string[]`; istniejące `featureRows`, `addFeatureRow`, `MAX_FEATURES`.
- Produces: tylko UI (nic nowego dla innych plików).

- [ ] **Step 1: Stan, refy i logika dropdownu**

Zmień import Reacta na:

```ts
import { useEffect, useRef, useState, useTransition } from "react";
```

Po istniejących funkcjach `setFeatureValue` (ok. linii 59) dodaj:

```ts
// Dropdown „+ Wybierz z listy": nazwy z featureKeySuggestions minus już
// obecne w wierszach (trim + case-insensitive). Wybór dodaje wiersz z nazwą
// i fokusuje pole wartości (pendingFocusIdx odczytywany w ref callbacku).
const [pickerOpen, setPickerOpen] = useState(false);
const pickerRef = useRef<HTMLDivElement | null>(null);
const pendingFocusIdx = useRef<number | null>(null);
const usedFeatureKeys = new Set(
  featureRows.map((r) => r.key.trim().toLowerCase())
);
const availableSuggestions = featureKeySuggestions.filter(
  (k) => !usedFeatureKeys.has(k.toLowerCase())
);
function addFeatureRowFromList(key: string) {
  pendingFocusIdx.current = featureRows.length;
  setFeatureRows((r) => [...r, { key, value: "" }]);
  setPickerOpen(false);
}
useEffect(() => {
  if (!pickerOpen) return;
  function onKeyDown(e: KeyboardEvent) {
    if (e.key === "Escape") setPickerOpen(false);
  }
  function onMouseDown(e: MouseEvent) {
    if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
      setPickerOpen(false);
    }
  }
  document.addEventListener("keydown", onKeyDown);
  document.addEventListener("mousedown", onMouseDown);
  return () => {
    document.removeEventListener("keydown", onKeyDown);
    document.removeEventListener("mousedown", onMouseDown);
  };
}, [pickerOpen]);
```

- [ ] **Step 2: Fokus pola wartości nowego wiersza**

W istniejącym inpucie wartości wiersza (ten w `<div className="flex-1 min-w-0">`) dodaj ref callback:

```tsx
<input
  ref={(el) => {
    if (el && pendingFocusIdx.current === i) {
      pendingFocusIdx.current = null;
      el.focus();
    }
  }}
  value={row.value}
  onChange={(e) => setFeatureValue(i, e.target.value)}
  placeholder="np. Pianka HR"
  maxLength={300}
  className={inputClass}
/>
```

- [ ] **Step 3: Przyciski — „+ Wybierz z listy" + rename istniejącego**

Zastąp istniejący pojedynczy przycisk `+ Dodaj parametr` (linie ~409-416) blokiem:

```tsx
<div className="flex items-center gap-2">
  <div className="relative" ref={pickerRef}>
    <button
      type="button"
      onClick={() => setPickerOpen((o) => !o)}
      disabled={featureRows.length >= MAX_FEATURES || availableSuggestions.length === 0}
      aria-expanded={pickerOpen}
      aria-haspopup="listbox"
      title={
        availableSuggestions.length === 0
          ? "Wszystkie nazwy z listy są już dodane"
          : undefined
      }
      className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
    >
      + Wybierz z listy ▾
    </button>
    {pickerOpen && (
      <ul
        role="listbox"
        aria-label="Gotowe nazwy parametrów"
        className="absolute z-20 top-full mt-1 left-0 w-72 max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-lg py-1"
      >
        {availableSuggestions.map((k) => (
          <li key={k} role="option" aria-selected={false}>
            <button
              type="button"
              onClick={() => addFeatureRowFromList(k)}
              className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-gold)]/10"
            >
              {k}
            </button>
          </li>
        ))}
      </ul>
    )}
  </div>
  <button
    type="button"
    onClick={addFeatureRow}
    disabled={featureRows.length >= MAX_FEATURES}
    className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
  >
    + Dodaj własny parametr
  </button>
</div>
```

(Usuwany przycisk miał `self-start` na sobie — teraz układ trzyma zewnętrzny `div.flex`; klasy przycisków są identyczne jak dotychczasowe.)

- [ ] **Step 4: Weryfikacja**

Run: `npm test && npx tsc --noEmit && npm run lint`
Expected: PASS / bez błędów.

Run: `npm run build`
Expected: build zielony (łapie split client/server — gotcha z pamięci projektu).

- [ ] **Step 5: Commit**

```bash
git add "app/admin/produkty/[id]/ProductEditor.tsx"
git commit -m "feat(admin): przycisk „+ Wybierz z listy” — dodawanie parametru z gotowych nazw"
```

---

## Po ukończeniu tasków

1. Push brancha + PR do main (konto Woodecky10, `gh pr create`), w opisie: link do spec, lista klik-testów dla Mikołaja (dodanie parametru z listy → fokus w wartości; dodanie własnego; duplikat znika z listy; zapis; nazwa na karcie produktu w „Specyfikacji"; limit 30 — oba przyciski disabled).
2. Klik-testy Mikołaja na prodzie po auto-deployu (jak przy poprzednich PR).
