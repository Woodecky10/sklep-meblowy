# Kategorie tkanin + picker „szukaj-first" — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uporządkować wybór tkanin przy edycji wariantów produktu — pole `category` na tkaninie + przebudowa `FabricPicker` (grupowanie po kategorii, szukanie, zaznaczanie hurtem, przegląd zaznaczonych), koniec ze scrollem 200 tkanin.

**Architecture:** Dodajemy nullable kolumnę `category` do tabeli `fabrics` (bez zmiany zapisu wariantów — te dalej trzymają wartości-stringi). Czysta logika grupowania trafia do nowego `app/_lib/fabric-groups.ts` (testowana jak `size-groups.ts`). Formularz tkanin dostaje pole kategorii z autouzupełnianiem. `FabricPicker` w `VariantsEditor.tsx` przechodzi z płaskiej listy na zwijane sekcje po kategorii z szukaniem i akcjami hurtem. Storefront i klient bez zmian.

**Tech Stack:** Next.js 16 App Router, React (client component, `useState`), server actions, Supabase (admin client / service role), Vitest.

## Global Constraints

- **Migracja NIE idzie automatycznie z deployem** — `42_fabric_category.sql` aplikuje na produkcję ręcznie kontroler przez Supabase MCP (podłączony projekt = produkcja). Implementer tylko TWORZY plik migracji, nie aplikuje.
- **Kolejność bezpieczna:** kod działa przed i po migracji — gdy kolumny brak, `select("*")` nie zwraca `category`, `f.category` = `undefined` → `f.category?.trim()` → grupa „Bez kategorii". Żadnego 500.
- **Zapis wariantów bez zmian** — `product.variants` dalej trzyma wartości-stringi „Nazwa Numer"; `category` NIE wchodzi do wariantów; `expandFabrics`/`applyFabricSelection`/`fabricValueBelongsTo` (`app/_lib/variants.ts`) i storefront bez zmian.
- **`category`**: free-text, ≤ 100 znaków, puste → `null` (`emptyToNull(sanitize(x, 100))`); w formularzu `<datalist>` z istniejącymi kategoriami (autouzupełnianie).
- **Etykieta grupy bez kategorii** = `"Bez kategorii"`; kategorie sortowane alfabetycznie `localeCompare(…, "pl")`, „Bez kategorii" ZAWSZE na końcu.
- **Testy jednostkowe tylko dla czystej logiki** (`fabric-groups.ts`); migracja/formularz/picker — lint + build + ręczny smoke (wzorzec repo).
- **Commity: celowany `git add <ścieżki>`** — NIGDY `git add -A`/`.`. W repo są niezacommitowane `public/naroznik-*.svg` (grafiki użytkownika) — nie ruszać.
- Gałąź: `feat/fabric-picker-categories` (istnieje, spec zacommitowany). Copy po polsku. Trailer: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Struktura plików

- **Nowy:** `app/_lib/fabric-groups.ts` — czyste `groupFabricsByCategory`, `groupSelectionState`, `NO_CATEGORY_LABEL`.
- **Nowy:** `app/_lib/__tests__/fabric-groups.test.ts` — testy powyższych.
- **Nowy:** `supabase/migrations/42_fabric_category.sql` — kolumna `category`.
- **Edycja:** `app/_lib/types.ts` — `Fabric.category`.
- **Edycja:** `app/admin/tkaniny/actions.ts` — zapis `category` w create/update.
- **Edycja:** `app/admin/tkaniny/FabricsEditor.tsx` — pole „Kategoria" + datalist + kategoria na karcie.
- **Edycja:** `app/admin/produkty/[id]/VariantsEditor.tsx` — przebudowa `FabricPicker` + import.

---

### Task 1: Czysta logika grupowania (`fabric-groups.ts`)

**Files:**
- Create: `app/_lib/fabric-groups.ts`
- Test: `app/_lib/__tests__/fabric-groups.test.ts`

**Interfaces:**
- Consumes: `Fabric` (type, from `./types`).
- Produces:
  - `NO_CATEGORY_LABEL: "Bez kategorii"`
  - `type FabricGroup = { category: string; fabrics: Fabric[] }`
  - `groupFabricsByCategory(fabrics: Fabric[]): FabricGroup[]` — grupy po `category` (trim; puste/null/undefined → `NO_CATEGORY_LABEL`); kategorie alfabetycznie (pl), `NO_CATEGORY_LABEL` na końcu; kolejność tkanin w grupie zachowana z wejścia.
  - `groupSelectionState(group: FabricGroup, selectedNames: Set<string>): "none" | "some" | "all"`.

- [ ] **Step 1: Write the failing test**

Create `app/_lib/__tests__/fabric-groups.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  groupFabricsByCategory,
  groupSelectionState,
  NO_CATEGORY_LABEL,
  type FabricGroup,
} from "@/app/_lib/fabric-groups";
import type { Fabric } from "@/app/_lib/types";

// Minimalna fabryka tkaniny — tylko pola używane przez grupowanie.
function fab(name: string, category: string | null): Fabric {
  return {
    id: name,
    name,
    name_de: null,
    colors: [],
    color_images: {},
    price: 0,
    sort_order: 0,
    category,
    created_at: "",
  };
}

describe("groupFabricsByCategory", () => {
  it("grupuje po kategorii, sortuje kategorie alfabetycznie (pl)", () => {
    const out = groupFabricsByCategory([
      fab("Welur A", "Welur"),
      fab("Sztruks A", "Sztruks"),
      fab("Welur B", "Welur"),
    ]);
    expect(out.map((g) => g.category)).toEqual(["Sztruks", "Welur"]);
    expect(out.find((g) => g.category === "Welur")!.fabrics.map((f) => f.name)).toEqual([
      "Welur A",
      "Welur B",
    ]);
  });

  it("null/puste/whitespace → grupa 'Bez kategorii' ZAWSZE na końcu", () => {
    const out = groupFabricsByCategory([
      fab("X", null),
      fab("Y", "   "),
      fab("Aaa", "Aaa"),
    ]);
    expect(out.map((g) => g.category)).toEqual(["Aaa", NO_CATEGORY_LABEL]);
    expect(out[1].fabrics.map((f) => f.name)).toEqual(["X", "Y"]);
  });

  it("puste wejście → []", () => {
    expect(groupFabricsByCategory([])).toEqual([]);
  });

  it("category z białymi znakami jest trymowane do wspólnej grupy", () => {
    const out = groupFabricsByCategory([fab("A", "Welur"), fab("B", "  Welur  ")]);
    expect(out).toHaveLength(1);
    expect(out[0].category).toBe("Welur");
  });
});

describe("groupSelectionState", () => {
  const group: FabricGroup = { category: "Welur", fabrics: [fab("A", "Welur"), fab("B", "Welur")] };
  it("żadna zaznaczona → none", () => {
    expect(groupSelectionState(group, new Set())).toBe("none");
  });
  it("część zaznaczona → some", () => {
    expect(groupSelectionState(group, new Set(["A"]))).toBe("some");
  });
  it("wszystkie zaznaczone → all", () => {
    expect(groupSelectionState(group, new Set(["A", "B"]))).toBe("all");
  });
  it("pusta grupa → none", () => {
    expect(groupSelectionState({ category: "X", fabrics: [] }, new Set())).toBe("none");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run app/_lib/__tests__/fabric-groups.test.ts`
Expected: FAIL — `Cannot find module '@/app/_lib/fabric-groups'` / exports not defined.

- [ ] **Step 3: Write the implementation**

Create `app/_lib/fabric-groups.ts`:

```ts
// Czysta logika grupowania tkanin po kategorii — bez zależności server-only,
// testowalna bez mockowania Supabase (wzorzec jak size-groups.ts). Używane przez
// FabricPicker w edytorze wariantów.
import type { Fabric } from "./types";

export const NO_CATEGORY_LABEL = "Bez kategorii";

export type FabricGroup = { category: string; fabrics: Fabric[] };

// Grupuje tkaniny po `category` (po trim). Puste/null/undefined → NO_CATEGORY_LABEL.
// Kategorie sortowane alfabetycznie (pl); NO_CATEGORY_LABEL zawsze na końcu.
// Kolejność tkanin w grupie zachowana z wejścia (już posortowane sort_order/name).
export function groupFabricsByCategory(fabrics: Fabric[]): FabricGroup[] {
  const map = new Map<string, Fabric[]>();
  for (const f of fabrics) {
    const cat = f.category?.trim() || NO_CATEGORY_LABEL;
    const arr = map.get(cat);
    if (arr) arr.push(f);
    else map.set(cat, [f]);
  }
  const named = [...map.keys()]
    .filter((c) => c !== NO_CATEGORY_LABEL)
    .sort((a, b) => a.localeCompare(b, "pl"));
  const ordered = map.has(NO_CATEGORY_LABEL) ? [...named, NO_CATEGORY_LABEL] : named;
  return ordered.map((category) => ({ category, fabrics: map.get(category)! }));
}

// Stan zaznaczenia grupy względem zbioru zaznaczonych nazw tkanin.
export function groupSelectionState(
  group: FabricGroup,
  selectedNames: Set<string>
): "none" | "some" | "all" {
  if (group.fabrics.length === 0) return "none";
  let sel = 0;
  for (const f of group.fabrics) if (selectedNames.has(f.name)) sel++;
  if (sel === 0) return "none";
  if (sel === group.fabrics.length) return "all";
  return "some";
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run app/_lib/__tests__/fabric-groups.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/fabric-groups.ts app/_lib/__tests__/fabric-groups.test.ts
git commit -m "feat(tkaniny): czysta logika grupowania tkanin po kategorii

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Kategoria w katalogu (migracja + typ + formularz + zapis)

**Files:**
- Create: `supabase/migrations/42_fabric_category.sql`
- Modify: `app/_lib/types.ts` (`Fabric` type)
- Modify: `app/admin/tkaniny/actions.ts` (`createFabric`, `updateFabric`)
- Modify: `app/admin/tkaniny/FabricsEditor.tsx` (`FabricForm` pole + datalist; karta; przekazanie `categories`)

**Interfaces:**
- Consumes: nic z Task 1.
- Produces: `Fabric.category: string | null` (czytane przez Task 3 i grupowanie).

- [ ] **Step 1: Utwórz plik migracji**

Create `supabase/migrations/42_fabric_category.sql`:

```sql
-- Migracja 42: kategoria/typ tkaniny (grupowanie w pickerze wariantów).
-- Nullable — istniejące tkaniny trafiają do grupy "Bez kategorii" do czasu ustawienia.
alter table fabrics
  add column if not exists category text;
```

(Nie aplikuj — kontroler zrobi to na produkcji przez Supabase MCP.)

- [ ] **Step 2: Dodaj `category` do typu `Fabric`**

W `app/_lib/types.ts`, w typie `Fabric`, po linii `sort_order: number;` dodaj:

```ts
  sort_order: number;
  // Kategoria/typ do grupowania w pickerze wariantów (np. "welur"). Null = bez kategorii.
  category: string | null;
  created_at: string;
```

- [ ] **Step 3: Zapis `category` w akcjach**

W `app/admin/tkaniny/actions.ts`:

W `createFabric`, po `const price = parsePrice(formData.get("price"));` dodaj:
```ts
  const category = emptyToNull(sanitize(formData.get("category"), 100));
```
i w obiekcie `.insert({ ... })` dopisz `category`:
```ts
    .insert({ name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category } as never)
```

W `updateFabric`, analogicznie po `const price = parsePrice(formData.get("price"));` dodaj:
```ts
  const category = emptyToNull(sanitize(formData.get("category"), 100));
```
i w obiekcie `.update({ ... })` dopisz `category`:
```ts
    .update({ name, name_de: nameDe, sort_order: sortOrder, colors, color_images, price, category } as never)
```

- [ ] **Step 4: Formularz — pole „Kategoria" + datalist, i przekazanie listy kategorii**

W `app/admin/tkaniny/FabricsEditor.tsx`:

**(a)** W komponencie `FabricsEditor` (ma `fabrics` w stanie) policz listę kategorii do podpowiedzi — wstaw tuż przed `return (` (po `function handleResult(...) { ... }`):
```tsx
  const categories = [
    ...new Set(
      fabrics.map((f) => f.category?.trim()).filter((c): c is string => !!c)
    ),
  ].sort((a, b) => a.localeCompare(b, "pl"));
```

**(b)** Przekaż `categories` do OBU użyć `<FabricForm ...>` (create i update) — dodaj prop `categories={categories}`:
```tsx
          <FabricForm
            mode="create"
            categories={categories}
            onCancel={() => setCreating(false)}
```
oraz:
```tsx
                  <FabricForm
                    mode="update"
                    initial={f}
                    categories={categories}
                    onCancel={() => setEditingId(null)}
```

**(c)** Karta tkaniny — pokaż kategorię w linii meta. Zmień:
```tsx
                    DE: {f.name_de ?? "—"} · kolejność: {f.sort_order} ·{" "}
                    {f.colors?.length ? `${f.colors.length} kolor${f.colors.length < 5 ? "y" : "ów"}` : "bez kolorów"}
                    {f.price > 0 && ` · +${f.price.toFixed(2)} zł`}
```
na (dodana jedna linia z kategorią):
```tsx
                    DE: {f.name_de ?? "—"} · kolejność: {f.sort_order} ·{" "}
                    {f.colors?.length ? `${f.colors.length} kolor${f.colors.length < 5 ? "y" : "ów"}` : "bez kolorów"}
                    {f.category && ` · ${f.category}`}
                    {f.price > 0 && ` · +${f.price.toFixed(2)} zł`}
```

**(d)** Zmień sygnaturę `FabricForm` — dodaj prop `categories`:
```tsx
function FabricForm({
  mode,
  initial,
  categories,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Fabric;
  categories: string[];
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
```

**(e)** W formularzu dodaj pole „Kategoria" + `<datalist>`. Zmień blok dopłaty:
```tsx
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Dopłata (zł)" hint="Doliczana do ceny, gdy wybrana ta tkanina. 0 = bez dopłaty.">
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.price ?? 0}
            className={inputCls}
          />
        </Field>
      </div>
```
na:
```tsx
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Dopłata (zł)" hint="Doliczana do ceny, gdy wybrana ta tkanina. 0 = bez dopłaty.">
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.price ?? 0}
            className={inputCls}
          />
        </Field>
        <Field label="Kategoria / typ" hint="Do grupowania przy wyborze (np. welur, sztruks). Puste = bez kategorii." className="md:col-span-2">
          <input
            name="category"
            list="fabric-categories"
            defaultValue={initial?.category ?? ""}
            maxLength={100}
            placeholder="np. welur"
            className={inputCls}
          />
          <datalist id="fabric-categories">
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>
```

- [ ] **Step 5: Weryfikacja lint + build**

Run: `npm run lint && npm run build`
Expected: bez błędów; build EXIT 0. (Bez migracji w bazie kod dalej działa — `category` będzie `undefined` w istniejących wierszach.)

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/42_fabric_category.sql app/_lib/types.ts app/admin/tkaniny/actions.ts app/admin/tkaniny/FabricsEditor.tsx
git commit -m "feat(tkaniny): pole kategorii tkaniny (migracja + formularz + zapis)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Przebudowa `FabricPicker` (grupowanie + szukanie + hurtem)

**Files:**
- Modify: `app/admin/produkty/[id]/VariantsEditor.tsx` (import + funkcja `FabricPicker`, obecnie linie 824-952)

**Interfaces:**
- Consumes: `groupFabricsByCategory`, `groupSelectionState` (Task 1); `Fabric.category` (Task 2); istniejące `expandFabrics`, `fabricValueBelongsTo`, `inputClass`, `useState`.
- Produces: nic (interfejs `onApply(selectedFabrics, keptOrphans)` bez zmian — `applyFabrics` w VariantsEditor zostaje).

- [ ] **Step 1: Dodaj import czystej logiki**

W `app/admin/produkty/[id]/VariantsEditor.tsx`, po imporcie z linii 24 (`import { findInvalidVariantSale } from "@/app/_lib/pricing";`) dodaj:

```tsx
import { groupFabricsByCategory, groupSelectionState } from "@/app/_lib/fabric-groups";
```

- [ ] **Step 2: Zastąp całą funkcję `FabricPicker`**

Zamień CAŁĄ funkcję `FabricPicker` (od `function FabricPicker({` do jej zamykającego `}` — obecnie linie 824-952) na poniższą:

```tsx
function FabricPicker({
  fabrics,
  initiallySelectedValues,
  onApply,
  onCancel,
}: {
  fabrics: Fabric[];
  initiallySelectedValues: string[];
  onApply: (selectedFabrics: Fabric[], keptOrphanValues: string[]) => void;
  onCancel: () => void;
}) {
  const toLite = (f: Fabric) => ({ name: f.name, colors: f.colors ?? [], price: f.price ?? 0 });

  const [selectedNames, setSelectedNames] = useState<string[]>(() =>
    fabrics
      .filter((f) => initiallySelectedValues.some((v) => fabricValueBelongsTo(v, toLite(f))))
      .map((f) => f.name)
  );
  // Wartości spoza katalogu (żadna kolekcja ich nie obejmuje) — zachowywane, można odznaczyć.
  const orphanValues = initiallySelectedValues.filter(
    (v) => !fabrics.some((f) => fabricValueBelongsTo(v, toLite(f)))
  );
  const [keptOrphans, setKeptOrphans] = useState<string[]>(orphanValues);
  const [search, setSearch] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  // Rozwinięte sekcje (domyślnie wszystkie zwinięte; przy szukaniu i tak rozwinięte).
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());

  function toggle(name: string) {
    setSelectedNames((prev) =>
      prev.includes(name) ? prev.filter((n) => n !== name) : [...prev, name]
    );
  }
  function toggleOrphan(v: string) {
    setKeptOrphans((prev) => (prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]));
  }
  function toggleExpand(cat: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }

  const q = search.trim().toLowerCase();
  const base = onlySelected ? fabrics.filter((f) => selectedNames.includes(f.name)) : fabrics;
  const filtered = q ? base.filter((f) => f.name.toLowerCase().includes(q)) : base;
  const groups = groupFabricsByCategory(filtered);
  const selectedSet = new Set(selectedNames);
  const searching = q.length > 0;
  // Przy szukaniu / gdy jest tylko jedna grupa — rozwijamy automatycznie.
  const autoExpandAll = searching || groups.length === 1;

  function toggleGroup(group: (typeof groups)[number]) {
    const names = group.fabrics.map((f) => f.name);
    const state = groupSelectionState(group, selectedSet);
    setSelectedNames((prev) => {
      if (state === "all") {
        const rm = new Set(names);
        return prev.filter((n) => !rm.has(n));
      }
      return [...new Set([...prev, ...names])];
    });
  }
  function selectAllFiltered() {
    const names = filtered.map((f) => f.name);
    setSelectedNames((prev) => [...new Set([...prev, ...names])]);
  }
  function deselectAllFiltered() {
    const rm = new Set(filtered.map((f) => f.name));
    setSelectedNames((prev) => prev.filter((n) => !rm.has(n)));
  }

  const selectedFabrics = fabrics.filter((f) => selectedNames.includes(f.name));
  const { values: previewValues } = expandFabrics(selectedFabrics.map(toLite));
  const totalValues =
    previewValues.length + keptOrphans.filter((v) => !previewValues.includes(v)).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" role="dialog" aria-modal="true">
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl max-w-lg w-full max-h-[85vh] flex flex-col p-6 gap-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-[var(--fg)]">
            Wybierz tkaniny (wybrano: {selectedNames.length} → {totalValues} wart.)
          </h3>
          <input
            type="text"
            autoFocus
            placeholder="Szukaj…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputClass} max-w-[10rem]`}
          />
        </div>

        <div className="flex items-center gap-3 flex-wrap text-xs">
          <label className="flex items-center gap-1.5 cursor-pointer text-[var(--fg)]">
            <input
              type="checkbox"
              checked={onlySelected}
              onChange={() => setOnlySelected((v) => !v)}
              className="h-4 w-4 accent-[var(--color-gold)]"
            />
            tylko zaznaczone
          </label>
          <button
            type="button"
            onClick={selectAllFiltered}
            className="px-2 py-1 border border-[var(--border)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            Zaznacz pasujące
          </button>
          <button
            type="button"
            onClick={deselectAllFiltered}
            className="px-2 py-1 border border-[var(--border)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            Odznacz pasujące
          </button>
        </div>

        {fabrics.length === 0 && orphanValues.length === 0 ? (
          <p className="text-sm text-[var(--muted)] italic py-6 text-center">
            Brak tkanin w katalogu. Dodaj je w &bdquo;Tkaniny&rdquo; (menu admina).
          </p>
        ) : (
          <div className="flex-1 overflow-y-auto border border-[var(--border)] rounded-xl">
            {orphanValues.length > 0 && (
              <ul className="divide-y divide-[var(--border)] border-b border-[var(--border)]">
                {orphanValues.map((v) => (
                  <li key={`orphan-${v}`}>
                    <label className="flex items-center gap-3 p-2 cursor-pointer bg-amber-50 dark:bg-amber-950/30">
                      <input
                        type="checkbox"
                        checked={keptOrphans.includes(v)}
                        onChange={() => toggleOrphan(v)}
                        className="h-4 w-4 accent-[var(--color-gold)]"
                      />
                      <span className="text-sm text-[var(--fg)]">{v}</span>
                      <span className="text-[10px] font-sans uppercase tracking-widest text-amber-600 dark:text-amber-400 ml-auto">
                        spoza katalogu
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            {groups.length === 0 && (
              <p className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</p>
            )}
            {groups.map((group) => {
              const state = groupSelectionState(group, selectedSet);
              const open = autoExpandAll || expanded.has(group.category);
              return (
                <div key={group.category}>
                  <div className="flex items-center gap-2 p-2 bg-[var(--bg)] border-b border-[var(--border)] sticky top-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(group.category)}
                      className="w-5 text-[var(--muted)] hover:text-[var(--fg)]"
                      aria-label={open ? "Zwiń" : "Rozwiń"}
                    >
                      {open ? "▾" : "▸"}
                    </button>
                    <input
                      type="checkbox"
                      ref={(el) => {
                        if (el) el.indeterminate = state === "some";
                      }}
                      checked={state === "all"}
                      onChange={() => toggleGroup(group)}
                      className="h-4 w-4 accent-[var(--color-gold)]"
                      title="Zaznacz/odznacz całą grupę"
                    />
                    <span className="text-sm font-semibold text-[var(--fg)]">{group.category}</span>
                    <span className="text-[10px] text-[var(--muted)] ml-auto">{group.fabrics.length}</span>
                  </div>
                  {open && (
                    <ul className="divide-y divide-[var(--border)]">
                      {group.fabrics.map((f) => {
                        const active = selectedNames.includes(f.name);
                        const colorCount = (f.colors ?? []).length;
                        return (
                          <li key={f.id}>
                            <label className={`flex items-center gap-3 p-2 pl-7 cursor-pointer transition-colors ${active ? "bg-[var(--color-gold)]/10" : "hover:bg-[var(--bg)]"}`}>
                              <input
                                type="checkbox"
                                checked={active}
                                onChange={() => toggle(f.name)}
                                className="h-4 w-4 accent-[var(--color-gold)]"
                              />
                              <span className="text-sm text-[var(--fg)]">{f.name}</span>
                              <span className="text-[10px] text-[var(--muted)] ml-auto text-right">
                                {colorCount > 0 ? `${colorCount} kol.` : "bez kolorów"}
                                {f.price > 0 && ` · +${f.price.toFixed(2)} zł`}
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div className="flex gap-2 justify-end pt-2 border-t border-[var(--border)]">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
          >
            Anuluj
          </button>
          <button
            type="button"
            onClick={() => onApply(selectedFabrics, keptOrphans)}
            className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            Zastosuj ({totalValues})
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Weryfikacja lint + test + build**

Run: `npm run lint && npm test && npm run build`
Expected: lint czysty; wszystkie testy PASS (łącznie z Task 1); build EXIT 0.

- [ ] **Step 4: Smoke test manualny (deferowany, wykonuje kontroler/użytkownik po merge)**

W adminie: edytuj produkt → „Wybierz z katalogu tkanin" → sekcje po kategorii (domyślnie zwinięte), „Szukaj" rozwija trafienia, „zaznacz grupę" (tri-state) bierze całą kategorię, „Zaznacz/Odznacz pasujące" działa na wynik szukania, „tylko zaznaczone" pokazuje wybrane. „Zastosuj" generuje warianty jak dotąd.

- [ ] **Step 5: Commit**

```bash
git add "app/admin/produkty/[id]/VariantsEditor.tsx"
git commit -m "feat(tkaniny): FabricPicker grupowany po kategorii + szukanie/hurtem

Zwijane sekcje po kategorii (tri-state „zaznacz grupę"), szukanie rozwija
trafienia, zaznacz/odznacz pasujące, „tylko zaznaczone". Koniec ze scrollem
płaskiej listy ~200 tkanin. Interfejs onApply bez zmian.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (autor planu)

**1. Pokrycie spec:**
- Migracja `42_fabric_category.sql` (nullable, MCP) → Task 2 Step 1 + Global Constraints. ✅
- `Fabric.category` → Task 2 Step 2. ✅
- Formularz „Kategoria" + datalist istniejących kategorii → Task 2 Step 4. ✅
- Zapis `category` (`emptyToNull(sanitize(…,100))`) → Task 2 Step 3. ✅
- Kategoria na karcie tkaniny → Task 2 Step 4c. ✅
- Picker: grupowanie po kategorii, zwijane sekcje domyślnie zwinięte, tri-state „zaznacz grupę", szukanie rozwija trafienia, „zaznacz/odznacz pasujące", „tylko zaznaczone", orphany osobno → Task 3 Step 2. ✅
- „Bez kategorii" na końcu, kategorie alfabetycznie (pl) → `groupFabricsByCategory` (Task 1). ✅
- Zapis wariantów / storefront bez zmian → `onApply` i `applyFabrics` nietknięte; tylko `FabricPicker` przepisany. ✅
- Czysta logika testowana; reszta lint/build/smoke → Task 1 testy; Task 2/3 lint+build. ✅

**2. Placeholdery:** brak „TBD/TODO/handle edge cases" — każdy krok ma realny kod/komendę. ✅

**3. Spójność typów:** `groupFabricsByCategory(Fabric[]) → FabricGroup[]` i `groupSelectionState(FabricGroup, Set<string>)` zdefiniowane w Task 1, użyte identycznie w Task 3; `Fabric.category` z Task 2 czytane w `groupFabricsByCategory` i (pośrednio) w Task 3; prop `categories: string[]` w `FabricForm` spójny między definicją a użyciem (Task 2). `onApply(selectedFabrics: Fabric[], keptOrphanValues: string[])` — sygnatura niezmieniona względem istniejącego `applyFabrics`. ✅
