# Wartości parametrów wybierane z listy — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Strzałka ▾ przy polu wartości parametru w edytorze produktu, otwierająca listę wartości już użytych dla tej nazwy parametru w dowolnym produkcie.

**Architecture:** Czysta funkcja `collectFeatureValueSuggestions` buduje mapę „nazwa parametru (trim+lowercase) → użyte wartości" z surowych kolumn `features`; istniejący helper serwerowy od nazw zostaje rozszerzony do `getFeatureSuggestionsAdmin` (to samo jedno zapytanie), a `ProductEditor` dostaje nowy prop i renderuje per-wiersz dropdown wartości bliźniaczy do istniejącego pickera nazw. Spec: `docs/superpowers/specs/2026-07-26-wartosci-parametrow-lista-design.md`.

**Tech Stack:** Next.js App Router (⚠️ przeczytaj `node_modules/next/dist/docs/` przy wątpliwościach — wersja z breaking changes), React 19, TypeScript, vitest.

## Global Constraints

- Komentarze w kodzie po polsku, w stylu istniejących plików (zwięzłe „why", nie „what").
- Zero migracji DB, zero zmian w `parseFeatureRows`, akcjach admina, karcie produktu, i18n.
- Limity długości jak w `parseFeatureRows`: klucz ≤100 zn., wartość ≤300 zn.
- Klucze wynikowej mapy wartości są **lowercase po trim**; lookup w UI: `row.key.trim().toLowerCase()`.
- Sort wartości: `localeCompare(b, "pl", { numeric: true })` („9 cm" przed „10 cm").
- `DEDICATED_FEATURE_KEYS` NIE są filtrowane z mapy wartości (świadomie — spec).
- Katalog roboczy: `C:\Users\wood1\sklep-meblowy` (⚠️ root gita = katalog domowy; ścieżki w `git add` względem cwd działają normalnie).
- Gałąź: `feat/wartosci-parametrow-lista` (już utworzona od `main`, spec zacommitowany).
- ⚠️ Gotcha: stale `.next` potrafi psuć `tsc` po przełączeniu gałęzi — przy dziwnych błędach typów z `.next/types` usuń katalog `.next` i powtórz.

---

### Task 1: Czysta funkcja `collectFeatureValueSuggestions`

**Files:**
- Modify: `app/_lib/product-features.ts` (dopisać funkcję na końcu pliku)
- Test: `app/_lib/__tests__/product-features.test.ts` (nowy `describe` na końcu + import)

**Interfaces:**
- Consumes: nic nowego (moduł czysty, bez zależności).
- Produces: `collectFeatureValueSuggestions(featuresLists: unknown[]): Record<string, string[]>` — klucze mapy = nazwy parametrów po trim+lowercase; wartości = zdeduplikowane (trim + case-insensitive, pierwsza pisownia wygrywa), posortowane `localeCompare("pl", { numeric: true })`. Task 2 importuje ją z `./product-features`.

- [ ] **Step 1: Napisz failujące testy**

W `app/_lib/__tests__/product-features.test.ts` rozszerz import z `../product-features` o `collectFeatureValueSuggestions`:

```ts
import {
  parseFeatureRows,
  MAX_FEATURES,
  collectFeatureKeySuggestions,
  collectFeatureValueSuggestions,
  SEED_FEATURE_KEYS,
  DEDICATED_FEATURE_KEYS,
} from "../product-features";
```

Na końcu pliku (po `describe("collectFeatureKeySuggestions", …)`) dopisz:

```ts
describe("collectFeatureValueSuggestions", () => {
  it("grupuje wartości po kluczu trim + case-insensitive; klucze mapy lowercase", () => {
    const out = collectFeatureValueSuggestions([
      [{ key: "Wysokość nóżek", value: "12 cm" }],
      [{ key: "  wysokość nóżek ", value: "10 cm" }],
      [{ key: "WYSOKOŚĆ NÓŻEK", value: "15 cm" }],
    ]);
    expect(Object.keys(out)).toEqual(["wysokość nóżek"]);
    expect(out["wysokość nóżek"]).toEqual(["10 cm", "12 cm", "15 cm"]);
  });

  it("dedupe wartości trim + case-insensitive — pierwsza spotkana pisownia wygrywa", () => {
    const out = collectFeatureValueSuggestions([
      [{ key: "Pojemnik na pościel", value: "Tak" }],
      [{ key: "pojemnik na pościel", value: " tak " }],
      [{ key: "Pojemnik na pościel", value: "TAK" }],
    ]);
    expect(out["pojemnik na pościel"]).toEqual(["Tak"]);
  });

  it("sortuje numerycznie po polsku — 9 cm przed 10 cm, ł między l i m", () => {
    const out = collectFeatureValueSuggestions([
      [{ key: "Wysokość nóżek", value: "10 cm" }],
      [{ key: "Wysokość nóżek", value: "9 cm" }],
      [{ key: "Nóżki", value: "metal" }],
      [{ key: "Nóżki", value: "łuk drewniany" }],
      [{ key: "Nóżki", value: "lite drewno" }],
    ]);
    expect(out["wysokość nóżek"]).toEqual(["9 cm", "10 cm"]);
    expect(out["nóżki"]).toEqual(["lite drewno", "łuk drewniany", "metal"]);
  });

  it("nie filtruje DEDICATED_FEATURE_KEYS — wartości dla „Kolor" dostępne", () => {
    const out = collectFeatureValueSuggestions([
      [{ key: "Kolor", value: "szary" }],
    ]);
    expect(out["kolor"]).toEqual(["szary"]);
  });

  it("pomija śmieci: nie-tablice, elementy bez pól, nie-stringi, puste po trim, limity długości", () => {
    const out = collectFeatureValueSuggestions([
      null,
      "tekst",
      42,
      [{ value: "bez klucza" }, { key: "K" }, { key: 7, value: "x" }, { key: "K", value: 9 }],
      [{ key: "K", value: "   " }, { key: "   ", value: "x" }],
      [{ key: "a".repeat(101), value: "x" }],
      [{ key: "K", value: "b".repeat(301) }],
      [{ key: "K", value: "ok" }],
    ]);
    expect(out).toEqual({ k: ["ok"] });
  });

  it("puste wejście → {}", () => {
    expect(collectFeatureValueSuggestions([])).toEqual({});
  });
});
```

- [ ] **Step 2: Uruchom testy — mają failować**

Run: `npx vitest run app/_lib/__tests__/product-features.test.ts`
Expected: FAIL — `collectFeatureValueSuggestions` nie jest eksportowane (SyntaxError/undefined).

- [ ] **Step 3: Implementacja**

Na końcu `app/_lib/product-features.ts` dopisz:

```ts
// Mapa: nazwa parametru (trim + lowercase) → wartości już użyte w produktach
// (podpowiedzi w polu wartości edytora). Wejście defensywne jak wyżej
// (unknown[] — surowe kolumny `features`). Klucz/wartość nie-string, puste po
// trim, klucz >100 zn., wartość >300 zn. → pomijane. Dedupe wartości per klucz
// trim + case-insensitive — pierwsza spotkana pisownia wygrywa. Sort wartości
// numeryczny polski („9 cm" przed „10 cm"). DEDICATED_FEATURE_KEYS świadomie
// nie są filtrowane (ręcznie wpisana taka nazwa też dostaje podpowiedzi).
export function collectFeatureValueSuggestions(
  featuresLists: unknown[]
): Record<string, string[]> {
  const byKey = new Map<string, { seen: Set<string>; values: string[] }>();
  for (const list of featuresLists) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const rec = item as { key?: unknown; value?: unknown };
      if (typeof rec.key !== "string" || typeof rec.value !== "string") continue;
      const key = rec.key.trim();
      const value = rec.value.trim();
      if (!key || key.length > 100 || !value || value.length > 300) continue;
      const keyLower = key.toLowerCase();
      let entry = byKey.get(keyLower);
      if (!entry) {
        entry = { seen: new Set(), values: [] };
        byKey.set(keyLower, entry);
      }
      const valueLower = value.toLowerCase();
      if (entry.seen.has(valueLower)) continue;
      entry.seen.add(valueLower);
      entry.values.push(value);
    }
  }
  const out: Record<string, string[]> = {};
  for (const [keyLower, entry] of byKey) {
    out[keyLower] = entry.values.sort((a, b) =>
      a.localeCompare(b, "pl", { numeric: true })
    );
  }
  return out;
}
```

- [ ] **Step 4: Testy zielone**

Run: `npx vitest run app/_lib/__tests__/product-features.test.ts`
Expected: PASS (wszystkie, w tym stare `parseFeatureRows`/`collectFeatureKeySuggestions`).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/product-features.ts app/_lib/__tests__/product-features.test.ts
git commit -m "feat(admin): collectFeatureValueSuggestions — mapa wartości parametrów z produktów"
```

---

### Task 2: Helper serwerowy + prop + strzałka ▾ w edytorze

**Files:**
- Modify: `app/_lib/products.ts:492-502` (rename + rozszerzenie helpera; import w linii 12)
- Modify: `app/admin/produkty/[id]/page.tsx` (import :6, `Promise.all` :25-34, props :43-52)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (props :22-41, stan/handlery :50-101, JSX pola wartości :429-443)

**Interfaces:**
- Consumes: `collectFeatureValueSuggestions` z `@/app/_lib/product-features` (Task 1).
- Produces: `getFeatureSuggestionsAdmin(): Promise<{ keys: string[]; valuesByKey: Record<string, string[]> }>` w `app/_lib/products.ts` (zastępuje `getFeatureKeySuggestionsAdmin` — jedyny konsument to `page.tsx`, sprawdzone grepem). Prop `ProductEditor`: `featureValueSuggestions: Record<string, string[]>`.

- [ ] **Step 1: `app/_lib/products.ts` — rozszerz helper**

Import (linia 12): `import { collectFeatureKeySuggestions } from "./product-features";` → 

```ts
import {
  collectFeatureKeySuggestions,
  collectFeatureValueSuggestions,
} from "./product-features";
```

Funkcję `getFeatureKeySuggestionsAdmin` (linie 492-502) zastąp:

```ts
// Sugestie parametrów dla edytora produktu — z kolumn `features` WSZYSTKICH
// produktów (też ukrytych, stąd admin client): keys = nazwy (∪ SEED_FEATURE_KEYS),
// valuesByKey = nazwa (trim+lowercase) → użyte wartości. Błąd zapytania →
// puste (edytor działa, tylko bez podpowiedzi). Typ zwrotki inline — bez
// export type (gotcha Turbopack w plikach akcji; tu nie ma "use server",
// ale konsument i tak potrzebuje tylko destrukturyzacji).
export async function getFeatureSuggestionsAdmin(): Promise<{
  keys: string[];
  valuesByKey: Record<string, string[]>;
}> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.from("products").select("features");
  if (error) return { keys: [], valuesByKey: {} };
  const lists = (data ?? []).map((r) => (r as { features: unknown }).features);
  return {
    keys: collectFeatureKeySuggestions(lists),
    valuesByKey: collectFeatureValueSuggestions(lists),
  };
}
```

- [ ] **Step 2: `app/admin/produkty/[id]/page.tsx` — nowy prop**

Import (linie 3-7): `getFeatureKeySuggestionsAdmin` → `getFeatureSuggestionsAdmin`.

`Promise.all` (linie 25-34): zmienna `featureKeySuggestions` → `featureSuggestions`, wywołanie `getFeatureKeySuggestionsAdmin()` → `getFeatureSuggestionsAdmin()`:

```ts
  const [product, categories, de, fabrics, fabricGroups, variantInfo, featureSuggestions] =
    await Promise.all([
      getProduct(id),
      getAllCategories(),
      getProductDe(id),
      getAllFabrics(),
      getFabricPriceGroups(),
      getVariantInfoMap(),
      getFeatureSuggestionsAdmin(),
    ]);
```

Props (linie 43-52): `featureKeySuggestions={featureKeySuggestions}` → 

```tsx
      featureKeySuggestions={featureSuggestions.keys}
      featureValueSuggestions={featureSuggestions.valuesByKey}
```

- [ ] **Step 3: `ProductEditor.tsx` — prop + stan + handlery**

(a) Sygnatura komponentu (linie 22-41) — dołóż prop po `featureKeySuggestions`:

```tsx
  featureKeySuggestions,
  featureValueSuggestions,
}: {
  // …istniejące pola bez zmian…
  // Podpowiedzi nazw parametrów — dropdown „+ Wybierz z listy".
  featureKeySuggestions: string[];
  // Podpowiedzi wartości parametrów — mapa nazwa (trim+lowercase) → wartości
  // już użyte w produktach; zasila strzałkę ▾ przy polu wartości.
  featureValueSuggestions: Record<string, string[]>;
}
```

(b) Zaraz po `useState` z `featureRows` (po linii 53) dopisz:

```tsx
  // Dropdown wartości parametru: indeks wiersza z otwartą listą (najwyżej
  // jeden naraz; otwarcie zamyka picker nazw i odwrotnie). Strzałka ▾ tylko
  // gdy nazwa wiersza ma zapisane wartości (lookup trim + lowercase). Każda
  // edycja nazwy/wierszy zamyka listę (indeksy się przesuwają, strzałka może
  // zniknąć).
  const [valuePickerIdx, setValuePickerIdx] = useState<number | null>(null);
  const valuePickerRef = useRef<HTMLDivElement | null>(null);
  const valueSuggestionsFor = (key: string) =>
    featureValueSuggestions[key.trim().toLowerCase()] ?? [];
```

(c) Istniejące handlery — każdy dostaje zamknięcie listy wartości:

```tsx
  function addFeatureRow() {
    setPickerOpen(false);
    setValuePickerIdx(null);
    setFeatureRows((r) => [...r, { key: "", value: "" }]);
  }
  function removeFeatureRow(i: number) {
    setValuePickerIdx(null);
    setFeatureRows((r) => r.filter((_, idx) => idx !== i));
  }
  function setFeatureKey(i: number, key: string) {
    setValuePickerIdx(null);
    setFeatureRows((r) => r.map((row, idx) => (idx === i ? { ...row, key } : row)));
  }
```

(`setFeatureValue` bez zmian.) W `addFeatureRowFromList` dołóż `setValuePickerIdx(null);` przed `setPickerOpen(false);`.

(d) Przycisk „+ Wybierz z listy" (linia ~461): `onClick={() => setPickerOpen((o) => !o)}` → 

```tsx
  onClick={() => {
    setValuePickerIdx(null);
    setPickerOpen((o) => !o);
  }}
```

(e) Po istniejącym `useEffect` od `pickerOpen` (linie 85-101) dopisz bliźniaczy:

```tsx
  // Zamykanie dropdownu wartości: Esc / klik poza wierszem z otwartą listą.
  useEffect(() => {
    if (valuePickerIdx === null) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setValuePickerIdx(null);
    }
    function onMouseDown(e: MouseEvent) {
      if (valuePickerRef.current && !valuePickerRef.current.contains(e.target as Node)) {
        setValuePickerIdx(null);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [valuePickerIdx]);
```

- [ ] **Step 4: `ProductEditor.tsx` — JSX pola wartości**

Wrapper pola wartości (linie 429-443) — obecnie:

```tsx
                  <div className="flex-1 min-w-0">
                    <input
                      ref={(el) => { /* pendingFocusIdx… */ }}
                      value={row.value}
                      onChange={(e) => setFeatureValue(i, e.target.value)}
                      placeholder="np. Pianka HR"
                      maxLength={300}
                      className={inputClass}
                    />
                  </div>
```

zastąp (input z `ref`/`value`/`onChange`/`placeholder`/`maxLength` zostaje jak był — zmienia się tylko `className` i to, co wokół):

```tsx
                  <div
                    className="flex-1 min-w-0 relative"
                    ref={valuePickerIdx === i ? valuePickerRef : undefined}
                  >
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
                      className={
                        valueSuggestionsFor(row.key).length > 0
                          ? `${inputClass} pr-9`
                          : inputClass
                      }
                    />
                    {valueSuggestionsFor(row.key).length > 0 && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setPickerOpen(false);
                            setValuePickerIdx((v) => (v === i ? null : i));
                          }}
                          aria-label="Wybierz wartość z listy"
                          aria-expanded={valuePickerIdx === i}
                          aria-haspopup="listbox"
                          className="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-full text-[var(--color-gold-text)] hover:bg-[var(--color-gold)]/10"
                        >
                          ▾
                        </button>
                        {valuePickerIdx === i && (
                          <ul
                            role="listbox"
                            aria-label="Użyte wartości parametru"
                            className="absolute z-20 top-full mt-1 left-0 w-full max-h-64 overflow-y-auto rounded-xl border border-[var(--border)] bg-[var(--bg)] shadow-lg py-1"
                          >
                            {valueSuggestionsFor(row.key).map((v) => (
                              <li key={v} role="option" aria-selected={false}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setFeatureValue(i, v);
                                    setValuePickerIdx(null);
                                  }}
                                  className="w-full text-left px-4 py-2 text-sm hover:bg-[var(--color-gold)]/10"
                                >
                                  {v}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </>
                    )}
                  </div>
```

- [ ] **Step 5: Weryfikacja**

Run: `npx tsc --noEmit`
Expected: 0 błędów (⚠️ przy błędach z `.next/types` — usuń `.next`, powtórz).

Run: `npx vitest run`
Expected: wszystkie testy PASS (żadnych nowych failów względem `main`).

- [ ] **Step 6: Commit**

```bash
# ⚠️ [id] w pathspec gita to glob — stąd :(literal)
git add app/_lib/products.ts ':(literal)app/admin/produkty/[id]/page.tsx' ':(literal)app/admin/produkty/[id]/ProductEditor.tsx'
git commit -m "feat(admin): wartości parametrów wybierane z listy — strzałka przy polu wartości"
```

---

### Task 3: Pełna weryfikacja + PR

**Files:** brak zmian kodu (tylko weryfikacja i PR).

**Interfaces:**
- Consumes: całość Tasków 1-2 na gałęzi `feat/wartosci-parametrow-lista`.
- Produces: otwarty PR do `main`.

- [ ] **Step 1: Pełny zestaw weryfikacji**

Run (kolejno): `npx tsc --noEmit`, `npm test`, `npm run lint`, `npm run build`
Expected: wszystko zielone (build bez błędów; lint bez nowych błędów względem `main`).

- [ ] **Step 2: Push + PR**

```bash
git push -u origin feat/wartosci-parametrow-lista
gh pr create --base main --title "feat(admin): wartości parametrów wybierane z listy" --body "$(cat <<'EOF'
Rozszerzenie PR #91: przy polu **wartości** parametru strzałka ▾ z listą wartości już użytych dla tej nazwy w dowolnym produkcie (także ukrytym). Lista buduje się sama z danych — zero migracji, zero konfiguracji. Ręczne wpisywanie bez zmian.

Spec: `docs/superpowers/specs/2026-07-26-wartosci-parametrow-lista-design.md`
Makieta zatwierdzona: https://claude.ai/code/artifact/9c2f0e2b-b3df-43b6-9ddf-0d01c59d6626

## Klik-testy (Mikołaj, po deployu)
- [ ] Edytor produktu z parametrem mającym historię (np. „Wysokość nóżek") — strzałka ▾ przy polu wartości; klik → lista; klik pozycji wpisuje wartość.
- [ ] Wiersz z nową/własną nazwą bez historii — braku strzałki (wpisywanie ręczne działa).
- [ ] „+ Wybierz z listy" (nazwa z historią wartości) → nowy wiersz od razu ze strzałką.
- [ ] Esc / klik obok zamyka listę; otwarcie listy wartości zamyka listę nazw.
- [ ] Zapis + wartości widoczne na karcie produktu (sekcja „Specyfikacja").

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: link do PR.
