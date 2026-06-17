# Natywne tworzenie produktów + wygaszenie syncu BL — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać adminowi tworzenie produktów natywnie (minimalny formularz → istniejący edytor) i wyłączyć wykonywanie syncu produktów z BaseLinkera.

**Architecture:** Nowy minimalny formularz `/admin/produkty/nowy` + akcja `createProduct` (insert z domyślnymi przez czystą, testowaną funkcję `buildNewProductPayload`) → redirect do istniejącego edytora `/admin/produkty/[id]` (niezmienianego). Sync BL wygaszony: akcja i endpoint odmawiają, panel `/admin/baselinker` staje się read-only archiwum. Kod i kolumny BL (`baselinker-sync.ts`, `baselinker_id`) zostają jako legacy.

**Tech Stack:** Next.js 16.2.4 (App Router, Server Components, Server Actions), React 19, Supabase (service-role insert), TypeScript, vitest 4, ESLint 9, Tailwind 4.

**Spec:** `docs/superpowers/specs/2026-06-17-produkty-natywne-design.md`

## Global Constraints

- **Katalog aplikacji:** komendy `npm`/`git`/`tsc` z `sklep-meblowy/` (tam `package.json`). Ścieżki `git add` względem korzenia repo (`sklep-meblowy/app/...`).
- **Next.js 16 to NIE Next.js z treningu** (`AGENTS.md`): przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. Server action zwraca dane do redirectu po stronie klienta (NIE `redirect()` w akcji — formularz musi pokazać błędy walidacji). `searchParams`/`params` to Promise.
- **Panel admina PL-only.** Komponenty klienckie używają `_shared` (`Card`, `Field`, `ToastView`, `inputCls`, `Toast`) + wzorca `useTransition` + `ActionResult`/toast.
- **Wzorce repo:** server actions → `"use server"`, `await requireAdmin()`, `createAdminClient()`, `revalidatePath`; insert/update castowane `as never` (zgodnie z istniejącym kodem — `Product` type nie zawiera kolumn `_de`/`needs_translation`, więc payload idzie przez `as never`).
- **Domyślne nowego produktu (DOSŁOWNIE):** `description:''`, `images:[]`, `stock:0`, `features:[]`, `description_sections:[]`, `variants:null`, `color:null`, `material:null`, `dimensions:null`, `weight:null`, `construction:null`, `delivery_time:null`, `warranty:null`, `collection_id:null`, `baselinker_id:null`, `is_active:true`, `needs_translation:true`.
- **Bramki:** `npx tsc --noEmit` = 0, `npm run lint` = 0, `npm test` zielony, `npm run build` przechodzi.
- **Nie zmieniamy** istniejącego edytora `/admin/produkty/[id]` ani plików `baselinker-sync.ts` / kolumn BL.

---

### Task 1: Czysta logika `buildNewProductPayload` (TDD)

**Files:**
- Create: `sklep-meblowy/app/_lib/new-product.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/new-product.test.ts`

**Interfaces:**
- Produces:
  - `type NewProductPayload` (pola jak w Global Constraints).
  - `buildNewProductPayload(input: { name: unknown; price: unknown; category: unknown }): { ok: true; payload: NewProductPayload } | { ok: false; error: string }`
- Pure — bez importu supabase/next.

- [ ] **Step 1: Napisz failujący test**

Create `sklep-meblowy/app/_lib/__tests__/new-product.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildNewProductPayload } from "@/app/_lib/new-product";

const valid = { name: "Sofa Mollien", price: "1999.99", category: "sofy" };

describe("buildNewProductPayload", () => {
  it("happy path: payload z domyślnymi (needs_translation=true, baselinker_id=null, stock=0, is_active=true)", () => {
    const r = buildNewProductPayload(valid);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.payload.name).toBe("Sofa Mollien");
      expect(r.payload.price).toBe(1999.99);
      expect(r.payload.category).toBe("sofy");
      expect(r.payload.needs_translation).toBe(true);
      expect(r.payload.baselinker_id).toBeNull();
      expect(r.payload.stock).toBe(0);
      expect(r.payload.is_active).toBe(true);
      expect(r.payload.images).toEqual([]);
      expect(r.payload.variants).toBeNull();
      expect(r.payload.description).toBe("");
    }
  });

  it("normalizuje przecinek w cenie", () => {
    const r = buildNewProductPayload({ ...valid, price: "1999,50" });
    expect(r.ok && r.payload.price).toBe(1999.5);
  });

  it("przycina nazwę i odrzuca pustą/whitespace", () => {
    expect(buildNewProductPayload({ ...valid, name: "   " }).ok).toBe(false);
    const r = buildNewProductPayload({ ...valid, name: "  Fotel  " });
    expect(r.ok && r.payload.name).toBe("Fotel");
  });

  it("odrzuca cenę ujemną, NaN, pustą", () => {
    expect(buildNewProductPayload({ ...valid, price: "-5" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, price: "abc" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, price: "" }).ok).toBe(false);
  });

  it("odrzuca brak kategorii", () => {
    expect(buildNewProductPayload({ ...valid, category: "" }).ok).toBe(false);
    expect(buildNewProductPayload({ ...valid, category: "   " }).ok).toBe(false);
  });

  it("odrzuca nazwę dłuższą niż 300 znaków", () => {
    expect(buildNewProductPayload({ ...valid, name: "x".repeat(301) }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Uruchom test — ma failować**

Run (z `sklep-meblowy/`): `npm test -- app/_lib/__tests__/new-product.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/new-product"`.

- [ ] **Step 3: Zaimplementuj `new-product.ts`**

Create `sklep-meblowy/app/_lib/new-product.ts`:

```ts
// Czysta walidacja + payload nowego produktu (bez importu supabase/next),
// żeby logika tworzenia była testowalna w izolacji. Akcja createProduct
// woła to i robi sam insert. Payload castowany `as never` przy insercie
// (Product type nie zawiera kolumn needs_translation/_de).

export type NewProductPayload = {
  name: string;
  price: number;
  category: string;
  description: string;
  images: string[];
  stock: number;
  features: { key: string; value: string }[];
  description_sections: unknown[];
  variants: null;
  color: null;
  material: null;
  dimensions: null;
  weight: null;
  construction: null;
  delivery_time: null;
  warranty: null;
  collection_id: null;
  baselinker_id: null;
  is_active: boolean;
  needs_translation: boolean;
};

export function buildNewProductPayload(input: {
  name: unknown;
  price: unknown;
  category: unknown;
}): { ok: true; payload: NewProductPayload } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Podaj nazwę produktu" };
  if (name.length > 300)
    return { ok: false, error: "Nazwa jest za długa (max 300 znaków)" };

  const category =
    typeof input.category === "string" ? input.category.trim() : "";
  if (!category) return { ok: false, error: "Wybierz kategorię" };

  let price: number;
  if (typeof input.price === "number") {
    price = input.price;
  } else if (typeof input.price === "string" && input.price.trim() !== "") {
    price = Number(input.price.replace(",", "."));
  } else {
    return { ok: false, error: "Podaj cenę" };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Cena musi być liczbą ≥ 0" };
  }

  return {
    ok: true,
    payload: {
      name,
      price,
      category,
      description: "",
      images: [],
      stock: 0,
      features: [],
      description_sections: [],
      variants: null,
      color: null,
      material: null,
      dimensions: null,
      weight: null,
      construction: null,
      delivery_time: null,
      warranty: null,
      collection_id: null,
      baselinker_id: null,
      is_active: true,
      needs_translation: true,
    },
  };
}
```

- [ ] **Step 4: Uruchom test — ma przejść**

Run: `npm test -- app/_lib/__tests__/new-product.test.ts`
Expected: PASS (6 testów).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/new-product.ts sklep-meblowy/app/_lib/__tests__/new-product.test.ts
git commit -m "feat(produkty): czysta logika buildNewProductPayload + testy"
```

---

### Task 2: Akcja `createProduct`

**Files:**
- Modify: `sklep-meblowy/app/admin/produkty/actions.ts` (dodaj akcję + import)

**Interfaces:**
- Consumes: `buildNewProductPayload` (z `@/app/_lib/new-product`), `requireAdmin`, `createAdminClient`, `revalidatePath` (już importowane w pliku).
- Produces: `createProduct(formData: FormData): Promise<{ ok: true; productId: string } | { ok: false; error: string }>`

- [ ] **Step 1: Dodaj import**

W `sklep-meblowy/app/admin/produkty/actions.ts` dodaj do bloku importów:

```ts
import { buildNewProductPayload } from "@/app/_lib/new-product";
```

- [ ] **Step 2: Dodaj akcję `createProduct`**

Dopisz na końcu `sklep-meblowy/app/admin/produkty/actions.ts`:

```ts
// ============================================================
// Tworzenie nowego produktu (natywne — bez BaseLinkera)
// ============================================================
// Minimalny szkic (nazwa/cena/kategoria). Resztę admin uzupełnia w edytorze
// /admin/produkty/[id]. Zwraca productId do redirectu po stronie klienta.
export async function createProduct(
  formData: FormData
): Promise<{ ok: true; productId: string } | { ok: false; error: string }> {
  await requireAdmin();

  const built = buildNewProductPayload({
    name: formData.get("name"),
    price: formData.get("price"),
    category: formData.get("category"),
  });
  if (!built.ok) return { ok: false, error: built.error };

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("products")
    .insert(built.payload as never)
    .select("id")
    .single();

  if (error || !data) {
    return {
      ok: false,
      error: error?.message ?? "Nie udało się utworzyć produktu",
    };
  }

  revalidatePath("/admin/produkty");
  revalidatePath("/sklep");
  return { ok: true, productId: (data as { id: string }).id };
}
```

- [ ] **Step 3: Sprawdź typy + lint**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run lint` → 0 błędów.

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/app/admin/produkty/actions.ts
git commit -m "feat(produkty): akcja createProduct (insert szkicu + redirect productId)"
```

---

### Task 3: Strona/formularz tworzenia + przycisk na liście

**Files:**
- Create: `sklep-meblowy/app/admin/produkty/nowy/page.tsx`
- Create: `sklep-meblowy/app/admin/produkty/nowy/NewProductForm.tsx`
- Modify: `sklep-meblowy/app/admin/produkty/page.tsx` (przycisk „+ Nowy produkt” + aktualizacja copy)

**Interfaces:**
- Consumes: `createProduct` (z `../actions`), `getAllCategories` (z `@/app/_lib/categories`), `_shared` (`Card`, `Field`, `ToastView`, `inputCls`, `Toast`).
- Produces: trasa `/admin/produkty/nowy`.

- [ ] **Step 1: Utwórz kliencki `NewProductForm`**

Create `sklep-meblowy/app/admin/produkty/nowy/NewProductForm.tsx`:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { createProduct } from "../actions";

type Props = { categories: { slug: string; label: string }[] };

export default function NewProductForm({ categories }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  if (categories.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Nowy produkt</h1>
        <Card>
          <p className="text-sm text-[var(--muted)]">
            Najpierw dodaj kategorię w{" "}
            <Link href="/admin/kategorie" className="text-[var(--color-gold)] hover:underline">
              /admin/kategorie
            </Link>
            , a potem wróć tu, żeby utworzyć produkt.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/produkty" className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors">
          ← Produkty
        </Link>
      </div>

      <div>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Nowy produkt</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-xl">
          Podaj podstawowe dane — po utworzeniu przejdziesz do edytora, gdzie dodasz zdjęcia,
          warianty, opis i tłumaczenie DE.
        </p>
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await createProduct(fd);
              if (res.ok) {
                showToast({ type: "success", message: "Produkt utworzony — przechodzę do edytora" });
                router.push(`/admin/produkty/${res.productId}`);
              } else {
                showToast({ type: "error", message: res.error });
              }
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Nazwa" required>
            <input name="name" required maxLength={300} className={inputCls} placeholder="np. Sofa Mollien 3-osobowa" />
          </Field>
          <Field label="Cena (zł)" required>
            <input name="price" type="number" step="0.01" min="0" required className={inputCls} />
          </Field>
          <Field label="Kategoria" required>
            <select name="category" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                — wybierz kategorię —
              </option>
              {categories.map((c) => (
                <option key={c.slug} value={c.slug}>
                  {c.label}
                </option>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={isPending}
            className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {isPending ? "Tworzę..." : "Utwórz produkt"}
          </button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Utwórz stronę `/admin/produkty/nowy`**

Create `sklep-meblowy/app/admin/produkty/nowy/page.tsx`:

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories } from "@/app/_lib/categories";
import NewProductForm from "./NewProductForm";

export const metadata = { title: "Nowy produkt — Admin" };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await getAllCategories();
  return (
    <NewProductForm
      categories={categories.map((c) => ({ slug: c.slug, label: c.label }))}
    />
  );
}
```

- [ ] **Step 3: Dodaj przycisk „+ Nowy produkt” na liście + popraw copy**

W `sklep-meblowy/app/admin/produkty/page.tsx`:

Zamień nagłówek (blok `<div>` z „Admin” / „Produkty” / akapitem) na wersję z przyciskiem:

```tsx
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Admin
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
            Produkty
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            Łącznie: {products.length}{" "}
            {products.length === 1 ? "produkt" : products.length < 5 ? "produkty" : "produktów"}.
            Kliknij &bdquo;Edytuj&rdquo; przy produkcie, żeby zmienić nazwę, cenę, opis, zdjęcia lub warianty.
          </p>
        </div>
        <Link
          href="/admin/produkty/nowy"
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          + Nowy produkt
        </Link>
      </div>
```

Zamień tekst pustego stanu:

- z: `Brak produktów. Dodaj je w BaseLinkerze i zsynchronizuj (Admin → BaseLinker).`
- na: `Brak produktów. Kliknij „+ Nowy produkt”, żeby dodać pierwszy.`

(`Link` jest już importowany w tym pliku.)

- [ ] **Step 4: Sprawdź typy, lint, build**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run lint` → 0 błędów.
Run: `npm run build` → przechodzi; trasa `/admin/produkty/nowy` skompilowana.

> Jeśli build pada na braku ENV / połączeniu z bazą (a nie na błędzie kodu) — zatrzymaj się i zgłoś BLOCKED.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/admin/produkty/nowy/page.tsx sklep-meblowy/app/admin/produkty/nowy/NewProductForm.tsx sklep-meblowy/app/admin/produkty/page.tsx
git commit -m "feat(produkty): formularz tworzenia /admin/produkty/nowy + przycisk na liście"
```

---

### Task 4: Wyłączenie wykonywania syncu BL (akcja + endpoint)

**Files:**
- Modify: `sklep-meblowy/app/admin/baselinker/actions.ts` (`syncProductsAction` → odmowa + cleanup importów)
- Modify: `sklep-meblowy/app/api/baselinker/sync-products/route.ts` (zastąp ciało stubem 410)

**Interfaces:**
- `syncProductsAction()` zachowuje sygnaturę `Promise<SyncActionResult>` (typ bez zmian), ale zawsze zwraca gałąź `ok:false`.
- `getSyncLog` (w tym samym pliku) — BEZ ZMIAN.

- [ ] **Step 1: Wyłącz `syncProductsAction` + posprzątaj importy**

W `sklep-meblowy/app/admin/baselinker/actions.ts` zamień blok importów:

```ts
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import {
  syncProductsFromBaseLinker,
  logSyncOutcome,
  type SyncOutcome,
} from "@/app/_lib/baselinker-sync";
```

na (usuwamy `revalidatePath`, `createClient`, `syncProductsFromBaseLinker`, `logSyncOutcome`; zostaje `createAdminClient` używany przez `getSyncLog`, `requireAdmin` oraz `type SyncOutcome` używany przez typ `SyncActionResult`):

```ts
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { type SyncOutcome } from "@/app/_lib/baselinker-sync";
```

Zamień całe ciało funkcji `syncProductsAction` (od `export async function syncProductsAction` do jej `}`) na:

```ts
export async function syncProductsAction(): Promise<SyncActionResult> {
  await requireAdmin();
  // Synchronizacja z BaseLinker WYŁĄCZONA — produkty zarządzane natywnie
  // w sklepie (Admin → Produkty → Nowy produkt). Kod syncu (baselinker-sync.ts)
  // zostaje jako legacy; tu tylko zwracamy odmowę w istniejącym kształcie typu.
  return {
    ok: false,
    error:
      "Synchronizacja z BaseLinker została wyłączona — produkty dodaje się teraz bezpośrednio w sklepie (Admin → Produkty → Nowy produkt).",
    duration_ms: 0,
  };
}
```

> Typ `SyncActionResult` (z gałęzią `ok:true` używającą `Extract<SyncOutcome, { ok: true }>`) zostaje BEZ ZMIAN — dlatego `type SyncOutcome` musi pozostać w imporcie.

- [ ] **Step 2: Zastąp endpoint stubem 410**

Zastąp CAŁĄ zawartość `sklep-meblowy/app/api/baselinker/sync-products/route.ts`:

```ts
import { NextResponse } from "next/server";

// ============================================================
// POST /api/baselinker/sync-products — WYŁĄCZONY
// ============================================================
// Synchronizacja produktów z BaseLinker została wyłączona — produkty są
// zarządzane natywnie w sklepie. Endpoint zachowany jako legacy (410 Gone).
// Pełna logika syncu zostaje w app/_lib/baselinker-sync.ts (nieużywana).

export function POST() {
  return NextResponse.json(
    {
      ok: false,
      error: "Synchronizacja z BaseLinker została wyłączona.",
    },
    { status: 410 }
  );
}
```

- [ ] **Step 3: Sprawdź typy + lint**

Run: `npx tsc --noEmit` → 0 błędów (brak osieroconych importów).
Run: `npm run lint` → 0 błędów (żaden usunięty import nie został bez użycia; żaden pozostawiony nie jest nieużywany).

- [ ] **Step 4: Commit**

```bash
git add sklep-meblowy/app/admin/baselinker/actions.ts sklep-meblowy/app/api/baselinker/sync-products/route.ts
git commit -m "feat(produkty): wygaszenie wykonywania syncu BL (akcja odmawia, endpoint 410)"
```

---

### Task 5: Panel `/admin/baselinker` read-only (archiwum historii)

**Files:**
- Modify: `sklep-meblowy/app/admin/baselinker/BaseLinkerSyncPanel.tsx`

**Interfaces:**
- `BaseLinkerSyncPanel({ initialLogs, pendingTranslations })` — props BEZ ZMIAN (strona `page.tsx` przekazuje to samo).

Cel: usunąć przycisk syncu i całą ścieżkę wyzwalania; zostawić licznik DE + archiwalną historię (read-only).

- [ ] **Step 1: Wymień blok importów + typ `Toast`**

Na górze pliku zamień obecne importy (linie ~1–16, do typu `Toast` włącznie):

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  syncProductsAction,
  type SyncActionResult,
  type SyncLogRow,
} from "./actions";
import type {
  SyncInventoryResult,
  SyncSkippedProduct,
  SyncedProduct,
} from "@/app/_lib/baselinker-sync";

type Toast = { type: "success" | "error" | "warning"; message: string } | null;
```

na (usuwamy `useTransition`, `useRouter`, `syncProductsAction`, `SyncActionResult` oraz typ `Toast` — przestają być używane po usunięciu ścieżki syncu):

```tsx
"use client";

import { useState } from "react";
import { type SyncLogRow } from "./actions";
import type {
  SyncInventoryResult,
  SyncSkippedProduct,
  SyncedProduct,
} from "@/app/_lib/baselinker-sync";
```

- [ ] **Step 2: Wymień główny komponent `BaseLinkerSyncPanel`**

Zamień CAŁĄ funkcję `export default function BaseLinkerSyncPanel(...) { ... }` (od jej `export default` do zamykającego `}` przed komentarzem `// ====... Wynik synchronizacji`) na poniższą wersję read-only. Zachowuje licznik DE (skopiowany 1:1 z oryginału) i listę historii (`LogRow`), usuwa przycisk/handleSync/lastResult:

```tsx
export default function BaseLinkerSyncPanel({
  initialLogs,
  pendingTranslations,
}: {
  initialLogs: SyncLogRow[];
  pendingTranslations: number;
}) {
  const logs = initialLogs;
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          BaseLinker (archiwum)
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl leading-relaxed">
          Synchronizacja produktów z BaseLinkera została wyłączona — produkty
          dodaje się teraz bezpośrednio w sklepie (Admin → Produkty → Nowy
          produkt). Poniżej zostaje archiwalna historia dawnych synchronizacji.
        </p>
      </div>

      {/* Tłumaczenia DE — licznik zaległych (tłumaczenie ręczne w edytorze produktu) */}
      <Card>
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--fg)] mb-1">
            Tłumaczenia niemieckie (DE)
          </h2>
          <p className="text-sm text-[var(--muted)] leading-relaxed max-w-xl">
            Nowe i zmienione produkty wymagają ręcznego tłumaczenia DE — wpisz je
            w edytorze produktu, sekcja „Tłumaczenie niemieckie (DE)”.
          </p>
          <p className="text-sm text-[var(--fg)] mt-3">
            Czeka na tłumaczenie:{" "}
            <strong
              className={
                pendingTranslations > 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-emerald-700 dark:text-emerald-300"
              }
            >
              {pendingTranslations}{" "}
              {pendingTranslations === 1 ? "produkt" : "produktów"}
            </strong>
          </p>
        </div>
      </Card>

      {/* Archiwalna historia synchronizacji */}
      <div>
        <h2 className="font-display text-2xl font-semibold text-[var(--fg)] mb-4">
          Historia synchronizacji (archiwum)
        </h2>

        {logs.length === 0 ? (
          <EmptyState message="Brak synchronizacji w historii." />
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expandedLogId === log.id}
                onToggle={() =>
                  setExpandedLogId(expandedLogId === log.id ? null : log.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Usuń funkcje pomocnicze obsługujące już-nieistniejącą ścieżkę syncu**

Usuń z pliku CAŁE definicje (stały się martwe po usunięciu przycisku/wyniku):
- `function ResultSummary(...) { ... }`
- `function Stat(...) { ... }` (używane było wyłącznie w `ResultSummary`)
- `function Spinner() { ... }`
- `function ToastView(...) { ... }`

ZOSTAW bez zmian (używane przez historię): `LogRow`, `InventoryResult`, `ProductList`, `SkippedRow`, `SyncReport`, `type SyncReportData`, `StatusBadge`, `Card`, `EmptyState`.

- [ ] **Step 4: Sprawdź typy, lint, build**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run lint` → 0 błędów (żadnej nieużywanej funkcji/importu/zmiennej — w szczególności po usunięciu `ResultSummary` nie zostało odwołanie do `Stat`, a `SyncReport`/`InventoryResult` nadal są używane przez `LogRow`).
Run: `npm run build` → przechodzi.

> Jeśli lint zgłosi nieużywany symbol — usuń właśnie ten symbol (był częścią ścieżki syncu). Jeśli zgłosi BRAK symbolu używanego przez historię — przywróć go (należał do gałęzi „keep”).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/admin/baselinker/BaseLinkerSyncPanel.tsx
git commit -m "feat(produkty): panel BaseLinker read-only (archiwum historii, bez przycisku syncu)"
```

---

### Task 6: Bramki końcowe

**Files:** brak (weryfikacja całości).

- [ ] **Step 1: Pełny suite testów**

Run: `npm test`
Expected: wszystkie pliki zielone (w tym `new-product.test.ts`).

- [ ] **Step 2: Typy + lint + build**

Run: `npx tsc --noEmit` → 0.
Run: `npm run lint` → 0.
Run: `npm run build` → przechodzi (trasa `/admin/produkty/nowy` obecna).

- [ ] **Step 3: Smoke (opcjonalnie, lokalnie)**

`npm run dev`, zaloguj jako admin → `/admin/produkty` → „+ Nowy produkt” → wypełnij nazwę/cenę/kategorię → „Utwórz produkt” → powinno przekierować do `/admin/produkty/{id}` (edytor) i produkt jest widoczny na liście oraz w `/sklep`. Wejście na `/admin/baselinker` pokazuje archiwum bez przycisku syncu.

---

## Self-Review (wykonane przy pisaniu planu)

**Pokrycie specu:** Tworzenie produktu (flow) → T2+T3. Czysta logika/payload (TDD) → T1. Wygaszenie syncu (akcja+endpoint) → T4. Panel read-only → T5. Domyślne nowego produktu (needs_translation=true, stock=0, baselinker_id=null) → T1 (payload) + test. Aktualizacja copy listy → T3. Testy → T1 + bramki T6. Uwaga Next.js → Global Constraints. Wszystkie sekcje pokryte.

**Placeholdery:** brak — każdy krok z kodem ma pełny kod; komendy z oczekiwanym wynikiem.

**Spójność typów/nazw:** `buildNewProductPayload`/`NewProductPayload` (T1) zgodne z użyciem w `createProduct` (T2). `createProduct` zwraca `{ok,productId}` zgodnie z `NewProductForm` (T3). `getAllCategories().map(c => {slug,label})` zgodne z propsem `NewProductForm.categories`. `SyncActionResult`/`SyncOutcome` (T4) — zachowany typ, usunięte tylko nieużywane importy funkcji. Panel (T5) — keep/delete list spójna z grafem użyć (`Stat` tylko w `ResultSummary`, więc oba usuwane razem).

**Ryzyko (T5):** rewrite mocno sync-centrycznego pliku — keep/delete lista jest dokładna, ale implementer MUSI kierować się lintem (krok 4) przy granicznych symbolach.
