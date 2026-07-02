# Intuicyjne łączenie rozmiarów w adminie — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Zamienić ręczne wpisywanie klucza `size_group` na panel „Rozmiary tego mebla" w edytorze produktu — łączenie rozmiarów przez wyszukanie i zaznaczenie rodzeństwa, z widokiem całej grupy.

**Architecture:** Zostaje model danych (`size_group`/`size_label`, bez migracji) i cały storefront. Klucz `size_group` staje się wewnętrzny i generowany automatycznie. Czysta logika wyboru klucza trafia do `size-groups.ts` (testowana jednostkowo, jak istniejące `buildSizeOptions`). Mutacje robią nowe server actions (admin-only), które przepisują klucz na wszystkich członkach grup i rewalidują ich strony. Panel to nowy komponent kliencki wpięty w istniejący `ProductEditor`.

**Tech Stack:** Next.js 16 App Router, React (client components + `useTransition`, `useRouter().refresh()`), server actions (`"use server"`), Supabase (admin client / service role), Vitest.

## Global Constraints

- **Brak migracji** — reużywamy kolumn `size_group` (text) i `size_label` (text) z migracji `35_size_groups.sql`.
- **Storefront bez zmian** — `getSizeSiblings`, `buildSizeOptions`, `SizeSelector`, strona produktu pozostają nietknięte.
- **Wszystkie akcje admin-only** — każda zaczyna się `await requireAdmin();` (wzorzec z `actions.ts`).
- **Klucz i etykieta ≤ 100 znaków** — przez `sanitize(x, 100)` (istniejący helper: `trim().slice(0, max)`), puste → `null` przez `emptyToNull`.
- **`size_group`/`size_label` to pass-through PL/DE** — brak kolumn `_de`, nie tłumaczymy.
- **Testy jednostkowe tylko dla czystej logiki** (wzorzec repo: funkcje dostępu do DB, akcje i komponenty nie mają unit-testów — weryfikacja przez `npm run lint` + `npm test` + `npm run build` + smoke). Nie dokładamy infrastruktury testów DB/komponentów.
- **Commity: celowany `git add <ścieżki>`** — NIGDY `git add -A`/`.`. W repo są niezacommitowane pliki `public/naroznik-*.svg` (grafiki generowane przez użytkownika) — nie wolno ich ruszać.
- Gałąź robocza: `feat/size-group-admin-linker` (już istnieje, spec zacommitowany).
- Copy po polsku. Co-Authored-By w commitach: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

## Struktura plików

- **Nowy:** `app/admin/produkty/[id]/SizeGroupEditor.tsx` — panel kliencki (lista członków + wyszukiwarka „Dodaj rozmiar").
- **Edycja:** `app/_lib/size-groups.ts` — dodanie czystych funkcji `pickGroupKey`, `groupKeyBase`, `buildGroupKey`.
- **Edycja:** `app/_lib/__tests__/size-groups.test.ts` — testy nowych funkcji.
- **Edycja:** `app/_lib/products.ts` — dodanie `getSizeGroupMembersAdmin` + typu `SizeGroupMember`; usunięcie martwej `getSizeGroupKeys` (Task 5).
- **Edycja:** `app/admin/produkty/actions.ts` — 4 nowe akcje; usunięcie `size_group`/`size_label` z `updateProductBasics`.
- **Edycja:** `app/admin/produkty/[id]/ProductEditor.tsx` — usunięcie 2 pól tekstowych, render panelu, zmiana propsów.
- **Edycja:** `app/admin/produkty/[id]/page.tsx` — loader członków grupy zamiast `getSizeGroupKeys`.

---

### Task 1: Czysta logika klucza grupy (`size-groups.ts`)

**Files:**
- Modify: `app/_lib/size-groups.ts`
- Test: `app/_lib/__tests__/size-groups.test.ts`

**Interfaces:**
- Produces:
  - `groupKeyBase(name: string): string` — slug bazowy (lowercase, `[a-z0-9-]`, bez skrajnych myślników; pusty → `"grupa"`).
  - `buildGroupKey(name: string, suffix: string): string` — `` `${groupKeyBase(name)}-${suffix}` ``.
  - `pickGroupKey(currentKey: string | null, targetKey: string | null, newKey: string): string`.

- [ ] **Step 1: Dopisz testy do istniejącego pliku**

W `app/_lib/__tests__/size-groups.test.ts` zmień pierwszą linię importu i dopisz bloki na końcu pliku:

```ts
import { buildSizeOptions, pickGroupKey, groupKeyBase, buildGroupKey } from "@/app/_lib/size-groups";
```

```ts
describe("pickGroupKey", () => {
  it("oba puste → nowy klucz", () => {
    expect(pickGroupKey(null, null, "nowy-123")).toBe("nowy-123");
  });
  it("tylko bieżący ma grupę → jego klucz", () => {
    expect(pickGroupKey("aktualny", null, "nowy-123")).toBe("aktualny");
  });
  it("tylko target ma grupę → klucz targetu (bieżący adoptuje)", () => {
    expect(pickGroupKey(null, "target-grp", "nowy-123")).toBe("target-grp");
  });
  it("oba mają różne grupy → wygrywa bieżący (merge do niego)", () => {
    expect(pickGroupKey("aktualny", "target-grp", "nowy-123")).toBe("aktualny");
  });
  it("oba mają tę samą grupę → ta sama (no-op)", () => {
    expect(pickGroupKey("wspolny", "wspolny", "nowy-123")).toBe("wspolny");
  });
});

describe("groupKeyBase / buildGroupKey", () => {
  it("slug z nazwy: lowercase, spacje → myślnik", () => {
    expect(groupKeyBase("Marbella Boxspring")).toBe("marbella-boxspring");
  });
  it("cyfry zachowane, znaki specjalne → myślnik, bez skrajnych myślników", () => {
    expect(groupKeyBase("Vegas 120x200!")).toBe("vegas-120x200");
  });
  it("polskie znaki → poprawny slug (tylko [a-z0-9-], bez skrajnych myślników)", () => {
    expect(groupKeyBase("Łóżko Gold")).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });
  it("sam separator → 'grupa'", () => {
    expect(groupKeyBase("———")).toBe("grupa");
  });
  it("buildGroupKey łączy bazę i sufiks", () => {
    expect(buildGroupKey("Marbella", "7f3a")).toBe("marbella-7f3a");
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAIL**

Run: `npx vitest run app/_lib/__tests__/size-groups.test.ts`
Expected: FAIL — `pickGroupKey is not exported` / `groupKeyBase is not a function`.

- [ ] **Step 3: Zaimplementuj funkcje**

Dopisz na końcu `app/_lib/size-groups.ts`:

```ts
// ── Łączenie grup rozmiarów (panel admina) ─────────────────────────────
// Klucz size_group jest wewnętrzny (niewidoczny dla klienta) — generowany
// automatycznie, więc czytelny slug tylko ułatwia debug.

// Slug bazowy z nazwy produktu: lowercase, bez diakrytyków, nie-alfanumeryczne
// → "-", bez wielokrotnych/skrajnych myślników. Pusty wynik → "grupa".
export function groupKeyBase(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // usuń łączące znaki diakrytyczne
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
  return slug || "grupa";
}

// Składa klucz z bazy nazwy + sufiksu. Sufiks wstrzykiwany, żeby funkcja była
// deterministyczna (losowanie robi warstwa akcji).
export function buildGroupKey(name: string, suffix: string): string {
  return `${groupKeyBase(name)}-${suffix}`;
}

// Wybiera wspólny klucz size_group przy łączeniu dwóch produktów:
//  - bieżący ma grupę → jego klucz wygrywa (członkowie targetu dołączą do niego),
//  - tylko target ma grupę → bieżący ją adoptuje,
//  - żaden nie ma → nowy klucz (newKey).
export function pickGroupKey(
  currentKey: string | null,
  targetKey: string | null,
  newKey: string
): string {
  if (currentKey) return currentKey;
  if (targetKey) return targetKey;
  return newKey;
}
```

- [ ] **Step 4: Uruchom test — ma PASS**

Run: `npx vitest run app/_lib/__tests__/size-groups.test.ts`
Expected: PASS (wszystkie, łącznie z dotychczasowymi `buildSizeOptions`).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/size-groups.ts app/_lib/__tests__/size-groups.test.ts
git commit -m "feat(tkaniny): czysta logika klucza grupy rozmiarów (pickGroupKey/buildGroupKey)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Dostęp do członków grupy dla admina (`products.ts`)

**Files:**
- Modify: `app/_lib/products.ts`

**Interfaces:**
- Consumes: `createAdminClient` (już importowany w `products.ts:1`).
- Produces:
  - `type SizeGroupMember = { id: string; name: string; size_label: string | null }`
  - `getSizeGroupMembersAdmin(sizeGroup: string): Promise<SizeGroupMember[]>` — członkowie grupy, admin client (także nieaktywni), posortowani naturalnie po etykiecie (fallback nazwa).

- [ ] **Step 1: Dodaj typ i funkcję**

Wstaw w `app/_lib/products.ts` bezpośrednio po `getSizeGroupKeys` (po linii `285`):

```ts
// Członek grupy rozmiarów w widoku admina.
export type SizeGroupMember = { id: string; name: string; size_label: string | null };

// Członkowie grupy dla panelu admina. Admin client — pokazuje też produkty
// nieaktywne (admin musi widzieć całą grupę). Sort naturalny po etykiecie
// (numeric, pl) jak na sklepie; fallback do nazwy.
export async function getSizeGroupMembersAdmin(
  sizeGroup: string
): Promise<SizeGroupMember[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("id, name, size_label")
    .eq("size_group", sizeGroup);
  const rows = (data ?? []) as SizeGroupMember[];
  return rows.sort((a, b) =>
    (a.size_label ?? a.name).localeCompare(b.size_label ?? b.name, "pl", {
      numeric: true,
    })
  );
}
```

- [ ] **Step 2: Weryfikacja typów/lint**

Run: `npm run lint`
Expected: bez błędów. (Funkcja jest jeszcze nieużywana — to OK, wpięcie w Task 5.)

- [ ] **Step 3: Commit**

```bash
git add app/_lib/products.ts
git commit -m "feat(tkaniny): getSizeGroupMembersAdmin — członkowie grupy dla panelu admina

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Server actions łączenia + odpięcie pól z `updateProductBasics`

**Files:**
- Modify: `app/admin/produkty/actions.ts`

**Interfaces:**
- Consumes: `pickGroupKey`, `buildGroupKey` (Task 1); `requireAdmin`, `createAdminClient`, `sanitize`, `emptyToNull`, `revalidatePath`, `randomUUID`, `ActionResult` (już w pliku).
- Produces (wszystkie `Promise<ActionResult>`):
  - `searchProductsForSizeGroup(currentId: string, query: string)` — `data: { results: {id,name,size_group,size_label}[] }`.
  - `linkSizeSibling(currentId: string, targetId: string)`.
  - `unlinkSizeSibling(productId: string)`.
  - `updateSizeLabel(productId: string, label: string)`.

- [ ] **Step 1: Dodaj import czystej logiki**

Na górze `app/admin/produkty/actions.ts` (po istniejących importach, np. po linii `18`):

```ts
import { buildGroupKey, pickGroupKey } from "@/app/_lib/size-groups";
```

- [ ] **Step 2: Usuń `size_group`/`size_label` z `updateProductBasics`**

W obiekcie `updates` (obecnie `actions.ts:186-187`) USUŃ dwie linie:

```ts
    size_group: emptyToNull(sanitize(formData.get("size_group"), 100)),
    size_label: emptyToNull(sanitize(formData.get("size_label"), 100)),
```

Te pola zarządza teraz panel (osobne akcje) — zostawienie ich tu nadpisywałoby wartości panelu przy zapisie „Podstawowych danych".

- [ ] **Step 3: Dodaj nowe akcje**

Dopisz na końcu `app/admin/produkty/actions.ts`:

```ts
// ============================================================
// Grupy rozmiarów — łączenie osobnych produktów tego samego mebla
// ============================================================

// Rewaliduje strony wszystkich podanych produktów + listing sklepu.
function revalidateProducts(ids: string[]): void {
  for (const id of ids) {
    revalidatePath(`/admin/produkty/${id}`);
    revalidatePath(`/produkt/${id}`);
  }
  revalidatePath("/sklep");
}

// id-ki wszystkich produktów w danej grupie (admin client — także nieaktywne).
async function sizeGroupMemberIds(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  key: string
): Promise<string[]> {
  const { data } = await supabase
    .from("products")
    .select("id")
    .eq("size_group", key);
  return ((data ?? []) as { id: string }[]).map((r) => r.id);
}

// Wyszukiwarka produktów do dołączenia (po nazwie). Wyklucza bieżący produkt.
// Zwraca size_group/size_label, by UI wiedziało o ew. scaleniu grup.
export async function searchProductsForSizeGroup(
  currentId: string,
  query: string
): Promise<ActionResult> {
  await requireAdmin();
  const q = sanitize(query, 100);
  if (q.length < 2) return { ok: true, data: { results: [] } };
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, size_group, size_label")
    .ilike("name", `%${q}%`)
    .neq("id", sanitize(currentId))
    .limit(10);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { results: data ?? [] } };
}

// Łączy target z grupą bieżącego produktu (pełne scalenie obu grup).
export async function linkSizeSibling(
  currentId: string,
  targetId: string
): Promise<ActionResult> {
  await requireAdmin();
  const cid = sanitize(currentId);
  const tid = sanitize(targetId);
  if (!cid || !tid) return { ok: false, error: "Brak id produktu" };
  if (cid === tid) return { ok: false, error: "Nie można połączyć produktu ze sobą" };

  const supabase = await createAdminClient();
  const { data: rows, error: readErr } = await supabase
    .from("products")
    .select("id, name, size_group")
    .in("id", [cid, tid]);
  if (readErr) return { ok: false, error: readErr.message };
  type Row = { id: string; name: string; size_group: string | null };
  const current = ((rows ?? []) as Row[]).find((r) => r.id === cid);
  const target = ((rows ?? []) as Row[]).find((r) => r.id === tid);
  if (!current || !target) return { ok: false, error: "Produkt nie istnieje" };

  // Nowy klucz (gdy obie grupy puste): slug z nazwy bieżącego + krótki sufiks;
  // regeneracja przy mało prawdopodobnej kolizji.
  let newKey = buildGroupKey(current.name, randomUUID().slice(0, 4));
  for (let i = 0; i < 5; i++) {
    const { data: clash } = await supabase
      .from("products")
      .select("id")
      .eq("size_group", newKey)
      .limit(1);
    if (!clash?.length) break;
    newKey = buildGroupKey(current.name, randomUUID().slice(0, 4));
  }

  const key = pickGroupKey(current.size_group, target.size_group, newKey);

  // Do przepisania: bieżący, target + wszyscy członkowie obu grup (scalenie).
  const affected = new Set<string>([cid, tid]);
  for (const gk of [current.size_group, target.size_group]) {
    if (gk && gk !== key) {
      for (const id of await sizeGroupMemberIds(supabase, gk)) affected.add(id);
    }
  }

  const ids = Array.from(affected);
  const { error: updErr } = await supabase
    .from("products")
    .update({ size_group: key } as never)
    .in("id", ids);
  if (updErr) return { ok: false, error: updErr.message };

  revalidateProducts(ids);
  return { ok: true, message: "Połączono rozmiary" };
}

// Odłącza produkt od grupy; jeśli zostaje 1 członek — czyści też jego klucz.
export async function unlinkSizeSibling(productId: string): Promise<ActionResult> {
  await requireAdmin();
  const pid = sanitize(productId);
  if (!pid) return { ok: false, error: "Brak id produktu" };

  const supabase = await createAdminClient();
  const { data: row } = await supabase
    .from("products")
    .select("size_group")
    .eq("id", pid)
    .maybeSingle();
  const key = (row as { size_group: string | null } | null)?.size_group ?? null;

  const affected = new Set<string>([pid]);
  const { error: clearErr } = await supabase
    .from("products")
    .update({ size_group: null } as never)
    .eq("id", pid);
  if (clearErr) return { ok: false, error: clearErr.message };

  if (key) {
    const remaining = await sizeGroupMemberIds(supabase, key);
    if (remaining.length === 1) {
      // Grupa jednoelementowa nie ma sensu — czyścimy ostatniego członka.
      await supabase
        .from("products")
        .update({ size_group: null } as never)
        .eq("id", remaining[0]);
    }
    for (const id of remaining) affected.add(id);
  }

  revalidateProducts(Array.from(affected));
  return { ok: true, message: "Odłączono rozmiar" };
}

// Zapis etykiety rozmiaru pojedynczego produktu.
export async function updateSizeLabel(
  productId: string,
  label: string
): Promise<ActionResult> {
  await requireAdmin();
  const pid = sanitize(productId);
  if (!pid) return { ok: false, error: "Brak id produktu" };
  const value = emptyToNull(sanitize(label, 100));
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ size_label: value } as never)
    .eq("id", pid);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/admin/produkty/${pid}`);
  revalidatePath(`/produkt/${pid}`);
  revalidatePath("/sklep");
  return { ok: true, message: "Zapisano etykietę" };
}
```

- [ ] **Step 4: Weryfikacja lint + build + testy**

Run: `npm run lint && npm test && npm run build`
Expected: lint bez błędów; 285 testów PASS; build EXIT 0. (Stare pola formularza `size_group`/`size_label` są teraz ignorowane przez `updateProductBasics` — usuniemy je z JSX w Task 5; do tego czasu nic nie psują.)

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/actions.ts
git commit -m "feat(tkaniny): akcje link/unlink/label/search dla grup rozmiarów

Panel zarządza size_group/size_label osobnymi akcjami; usunięto te pola z
updateProductBasics, by zapis podstawowych danych ich nie nadpisywał.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Panel kliencki `SizeGroupEditor`

**Files:**
- Create: `app/admin/produkty/[id]/SizeGroupEditor.tsx`

**Interfaces:**
- Consumes: `linkSizeSibling`, `unlinkSizeSibling`, `updateSizeLabel`, `searchProductsForSizeGroup` (Task 3); `SizeGroupMember` (Task 2, `import type`); `inputClass`, `Toast` (z `./_shared`); `ActionResult` (z types).
- Produces: `default` export `SizeGroupEditor({ currentId, members, onToast })`.
  - `currentId: string`
  - `members: SizeGroupMember[]` (zawiera bieżący produkt — patrz loader w Task 5)
  - `onToast: (t: Toast) => void`

- [ ] **Step 1: Utwórz komponent**

Pełna zawartość `app/admin/produkty/[id]/SizeGroupEditor.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  linkSizeSibling,
  unlinkSizeSibling,
  updateSizeLabel,
  searchProductsForSizeGroup,
} from "../actions";
import type { ActionResult } from "@/app/_lib/types";
import type { SizeGroupMember } from "@/app/_lib/products";
import { inputClass, type Toast } from "./_shared";

type Candidate = {
  id: string;
  name: string;
  size_group: string | null;
  size_label: string | null;
};

export default function SizeGroupEditor({
  currentId,
  members,
  onToast,
}: {
  currentId: string;
  members: SizeGroupMember[];
  onToast: (t: Toast) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  // Lokalne edycje etykiet; fallback do wartości z propa members.
  const [labels, setLabels] = useState<Record<string, string>>({});

  function labelOf(m: SizeGroupMember): string {
    return labels[m.id] ?? m.size_label ?? "";
  }

  function handle(res: ActionResult) {
    if (res.ok) {
      onToast({ type: "success", message: res.message ?? "Zapisano" });
      router.refresh();
    } else {
      onToast({ type: "error", message: res.error });
    }
  }

  async function runSearch(q: string) {
    setQuery(q);
    if (q.trim().length < 2) {
      setCandidates([]);
      return;
    }
    const res = await searchProductsForSizeGroup(currentId, q);
    if (!res.ok) {
      onToast({ type: "error", message: res.error });
      return;
    }
    const memberIds = new Set(members.map((m) => m.id));
    const results = (res.data as { results: Candidate[] }).results;
    setCandidates(results.filter((c) => !memberIds.has(c.id)));
  }

  function add(c: Candidate) {
    // Kandydat nie jest członkiem bieżącej grupy (przefiltrowany), więc jego
    // niepusty size_group = INNA grupa → pytamy o scalenie.
    if (c.size_group) {
      const ok = window.confirm(
        "Ten produkt jest już w innej grupie rozmiarów — połączyć obie grupy?"
      );
      if (!ok) return;
    }
    startTransition(async () => {
      const res = await linkSizeSibling(currentId, c.id);
      setQuery("");
      setCandidates([]);
      handle(res);
    });
  }

  function unlink(id: string) {
    startTransition(async () => handle(await unlinkSizeSibling(id)));
  }

  function saveLabel(m: SizeGroupMember) {
    startTransition(async () => handle(await updateSizeLabel(m.id, labelOf(m))));
  }

  return (
    <div className="md:col-span-2 flex flex-col gap-3 rounded-lg border border-[var(--border)] p-4">
      <div>
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Rozmiary tego mebla
        </p>
        <p className="text-[11px] text-[var(--muted)]">
          Połącz osobne produkty tego samego mebla w różnych rozmiarach. Klient
          wybierając rozmiar przejdzie na odpowiedni produkt.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {members.map((m) => {
          const isCurrent = m.id === currentId;
          const empty = !labelOf(m).trim();
          return (
            <li key={m.id} className="flex items-center gap-2">
              <span
                className={`flex-1 text-sm truncate ${
                  isCurrent ? "font-semibold text-[var(--color-gold)]" : ""
                }`}
              >
                {isCurrent ? (
                  `» ${m.name}`
                ) : (
                  <Link href={`/admin/produkty/${m.id}`} className="hover:underline">
                    {m.name}
                  </Link>
                )}
              </span>
              <input
                value={labelOf(m)}
                onChange={(e) =>
                  setLabels((p) => ({ ...p, [m.id]: e.target.value }))
                }
                onBlur={() => saveLabel(m)}
                placeholder="np. 140×200 cm"
                maxLength={100}
                className={`${inputClass} max-w-[10rem]`}
              />
              {empty && (
                <span
                  className="text-[11px] text-amber-500"
                  title="Bez etykiety klient zobaczy nazwę produktu"
                >
                  ⚠
                </span>
              )}
              {members.length > 1 && (
                <button
                  type="button"
                  onClick={() => unlink(m.id)}
                  disabled={pending}
                  className="text-xs text-red-500 hover:underline disabled:opacity-40"
                >
                  Odłącz
                </button>
              )}
            </li>
          );
        })}
      </ul>

      <div className="flex flex-col gap-1">
        <input
          value={query}
          onChange={(e) => runSearch(e.target.value)}
          placeholder="Dodaj rozmiar — wpisz nazwę produktu…"
          className={inputClass}
        />
        {candidates.length > 0 && (
          <ul className="rounded-lg border border-[var(--border)] divide-y divide-[var(--border)]">
            {candidates.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => add(c)}
                  disabled={pending}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--color-gold)]/5 disabled:opacity-40"
                >
                  {c.name}
                  {c.size_group && (
                    <span className="text-[11px] text-amber-500"> (w innej grupie)</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Weryfikacja lint + build**

Run: `npm run lint && npm run build`
Expected: bez błędów; EXIT 0. (Komponent jeszcze nierenderowany — wpięcie w Task 5.)

- [ ] **Step 3: Commit**

```bash
git add "app/admin/produkty/[id]/SizeGroupEditor.tsx"
git commit -m "feat(tkaniny): panel SizeGroupEditor — lista rodzeństwa + wyszukiwarka

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Wpięcie panelu (ProductEditor + loader) i sprzątanie

**Files:**
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx`
- Modify: `app/admin/produkty/[id]/page.tsx`
- Modify: `app/_lib/products.ts` (usunięcie martwej `getSizeGroupKeys`)

**Interfaces:**
- Consumes: `SizeGroupEditor` (Task 4), `getSizeGroupMembersAdmin` + `SizeGroupMember` (Task 2).

- [ ] **Step 1: ProductEditor — import panelu i typu**

W `app/admin/produkty/[id]/ProductEditor.tsx` dodaj po istniejących importach (po linii `15`):

```tsx
import SizeGroupEditor from "./SizeGroupEditor";
import type { SizeGroupMember } from "@/app/_lib/products";
```

- [ ] **Step 2: ProductEditor — zmień propsy**

W typie propsów (obecnie `ProductEditor.tsx:23-29`) USUŃ `sizeGroupKeys: string[];` i DODAJ `sizeGroupMembers: SizeGroupMember[];`. Wynik:

```tsx
}: {
  product: Product;
  categories: CategoryDef[];
  de: ProductDeFields;
  sizeGroupMembers: SizeGroupMember[];
  fabrics: Fabric[];
}) {
```

- [ ] **Step 3: ProductEditor — zamień 2 pola na panel**

Zastąp cały blok dwóch `<Field>` (obecnie `ProductEditor.tsx:212-240` — „Grupa rozmiarów (klucz)" z `<datalist>` oraz „Etykieta rozmiaru") jednym:

```tsx
          <SizeGroupEditor
            currentId={product.id}
            members={sizeGroupMembers}
            onToast={showToast}
          />
```

- [ ] **Step 4: Loader — pobierz członków zamiast kluczy**

W `app/admin/produkty/[id]/page.tsx`:

Zmień import (linia `3`) na:

```tsx
import { getProduct, getSizeGroupMembersAdmin } from "@/app/_lib/products";
```

Zamień `Promise.all` (linie `20-26`) — usuń `getSizeGroupKeys()`:

```tsx
  const [product, categories, de, fabrics] = await Promise.all([
    getProduct(id),
    getAllCategories(),
    getProductDe(id),
    getAllFabrics(),
  ]);
  if (!product) notFound();

  // Panel zawsze pokazuje bieżący produkt; gdy jest w grupie — całe rodzeństwo.
  const sizeGroupMembers = product.size_group
    ? await getSizeGroupMembersAdmin(product.size_group)
    : [{ id: product.id, name: product.name, size_label: product.size_label }];
```

Zamień przekazanie propa w JSX (linie `30-37`) — `sizeGroupKeys={sizeGroupKeys}` → `sizeGroupMembers={sizeGroupMembers}`:

```tsx
    <ProductEditor
      product={product}
      categories={categories}
      de={de}
      sizeGroupMembers={sizeGroupMembers}
      fabrics={fabrics}
    />
```

- [ ] **Step 5: Usuń martwą `getSizeGroupKeys`**

Sprawdź, że nikt inny jej nie używa:

Run: `grep -rn "getSizeGroupKeys" app/`
Expected: brak wyników (po zmianie loadera). Jeśli tak — usuń definicję `getSizeGroupKeys` z `app/_lib/products.ts` (obecnie linie ~272-285, blok z komentarzem „Distinct klucze size_group…"). Jeśli grep pokaże inne użycia — ZOSTAW funkcję i pomiń ten krok.

- [ ] **Step 6: Weryfikacja lint + build + testy**

Run: `npm run lint && npm test && npm run build`
Expected: lint czysty; 285+ testów PASS (nowe z Task 1 doliczone); build EXIT 0.

- [ ] **Step 7: Smoke test manualny (admin)**

Run: `npm run dev` i w przeglądarce (zalogowany jako admin):
1. Otwórz produkt bez grupy → panel „Rozmiary tego mebla" pokazuje 1 wiersz (bieżący, „» nazwa"), pole etykiety, wyszukiwarkę; brak „Odłącz".
2. Wpisz w wyszukiwarce nazwę innego produktu (≥2 znaki) → lista kandydatów; kliknij → produkt dołącza, lista rośnie do 2, pojawia się „Odłącz".
3. Ustaw etykiety (np. „140×200 cm", „160×200 cm") — blur zapisuje (toast „Zapisano etykietę").
4. Otwórz stronę produktu na sklepie (`/produkt/{id}`) → selektor rozmiaru pokazuje oba, klik przenosi na rodzeństwo.
5. „Odłącz" jeden → jeśli zostaje 1, grupa znika (selektor na sklepie znika).
6. Dodanie produktu będącego już w innej grupie → `confirm` o scaleniu; po OK obie grupy łączą się.

Expected: wszystkie kroki jak opisano; brak błędów w konsoli.

- [ ] **Step 8: Commit**

```bash
git add "app/admin/produkty/[id]/ProductEditor.tsx" "app/admin/produkty/[id]/page.tsx" app/_lib/products.ts
git commit -m "feat(tkaniny): wpięcie panelu grup rozmiarów w edytor produktu

Zastępuje pola tekstowe size_group/size_label panelem SizeGroupEditor;
loader podaje członków grupy; usuwa martwą getSizeGroupKeys.

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Self-Review (autor planu)

**1. Pokrycie spec:**
- Model bez migracji → Global Constraints + Task 2/3 (reużycie kolumn). ✅
- Klucz wewnętrzny + auto-generacja (slug+sufiks, unikalność) → Task 1 (`buildGroupKey`/`groupKeyBase`) + Task 3 (`linkSizeSibling` pętla kolizji). ✅
- Panel „Rozmiary tego mebla" (lista + etykiety + Odłącz + wyszukiwarka) → Task 4. ✅
- Akcje link/unlink/updateLabel/search + rewalidacja rodzeństwa → Task 3 (`revalidateProducts`). ✅
- Scalenie grup z potwierdzeniem → Task 3 (`pickGroupKey` + zbiór `affected`) + Task 4 (`window.confirm`). ✅
- Odłączenie do 1 → czyszczenie → Task 3 (`unlinkSizeSibling`, `remaining.length === 1`). ✅
- Storefront bez zmian → nie dotykany żaden plik storefront. ✅
- Pusta/duplikat etykiety → ostrzeżenie „⚠" w Task 4 (nie blokuje). *Duplikat etykiety nie ma osobnego ostrzeżenia — świadomie pominięte (YAGNI); fallback i sort działają.* ✅
- Nie-cele (strona „Grupy rozmiarów", pola w formularzu tworzenia, auto-etykieta z wymiarów) → nie realizowane. ✅
- Testy: pure logika (`pickGroupKey`/slug) w Task 1; reszta przez lint/test/build/smoke wg wzorca repo. ✅

**2. Placeholdery:** brak „TBD/TODO/handle edge cases" — każdy krok ma realny kod/komendę. ✅

**3. Spójność typów:** `SizeGroupMember` zdefiniowany w Task 2, importowany (type-only) w Task 4/5; `pickGroupKey`/`buildGroupKey` sygnatury zgodne między Task 1 a Task 3; propsy `SizeGroupEditor` (`currentId`/`members`/`onToast`) zgodne między Task 4 a wpięciem w Task 5; loader podaje `members` w kształcie `SizeGroupMember`. ✅
