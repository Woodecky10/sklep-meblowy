# Wyszukiwarka produktów w panelu admina — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pole „Szukaj" nad listą produktów w `/admin/produkty` filtrujące listę na żywo (nazwa + kategoria, odporne na polskie znaki i wielkość liter).

**Architecture:** Czysta funkcja `normalizeSearchText` (TDD) + nowy client component `ProductsList` przejmujący renderowanie listy z server page; page przekazuje lekką projekcję (bez pełnego JSON-a wariantów). Zero zmian w DB.

**Tech Stack:** Next.js 16 App Router (server page + client list), Tailwind v4 (zmienne motywu), vitest.

**Spec:** `docs/superpowers/specs/2026-07-07-admin-szukajka-produktow-design.md`

## Global Constraints

- Kolory wyłącznie ze zmiennych motywu; komentarze po polsku (wyjaśniają „dlaczego").
- Pole szukania w kontenerze z `data-guard-ignore` — wpisywanie frazy NIE może uzbrajać `UnsavedChangesGuard` (guard sprawdza `target.closest("[data-guard-ignore]")`).
- Markup wiersza produktu (miniatura, badge „ukryty", metadane, przyciski) przenosi się BEZ zmian wizualnych.
- Pusty katalog (`0` produktów) obsługuje page (istniejący komunikat); pusty WYNIK FILTRA obsługuje ProductsList.

---

### Task 1: `normalizeSearchText` (TDD)

**Files:**
- Create: `app/_lib/search-normalize.ts`
- Test: `app/_lib/__tests__/search-normalize.test.ts`

**Interfaces:**
- Produces: `export function normalizeSearchText(input: string): string` z `@/app/_lib/search-normalize` — Task 2 filtruje nim nazwę/kategorię/frazę.

- [ ] **Step 1: Failing test**

Create `app/_lib/__tests__/search-normalize.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { normalizeSearchText } from "@/app/_lib/search-normalize";

describe("normalizeSearchText — normalizacja frazy wyszukiwania", () => {
  it("zdejmuje polskie diakrytyki (w tym ł, które nie ma dekompozycji NFD)", () => {
    expect(normalizeSearchText("Łóżko")).toBe("lozko");
    expect(normalizeSearchText("ĄĘŚŻŹĆŃÓŁ")).toBe("aeszzcnol");
    expect(normalizeSearchText("Krzesło pikowane")).toBe("krzeslo pikowane");
  });
  it("obniża wielkość liter i tnie skrajne spacje", () => {
    expect(normalizeSearchText("  SOFA Modena  ")).toBe("sofa modena");
  });
  it("nie zmienia zwykłego ASCII i obsługuje pusty string", () => {
    expect(normalizeSearchText("fotel 123")).toBe("fotel 123");
    expect(normalizeSearchText("")).toBe("");
  });
});
```

- [ ] **Step 2: Run — musi FAILować**

Run: `npx vitest run app/_lib/__tests__/search-normalize.test.ts`
Expected: FAIL — `Cannot find module '@/app/_lib/search-normalize'` (lub równoważny).

- [ ] **Step 3: Implementacja**

Create `app/_lib/search-normalize.ts`:

```ts
// Normalizacja tekstu do porównań w wyszukiwarkach (filtr listy produktów
// w adminie): małe litery, bez diakrytyków, bez skrajnych spacji — „lozko"
// znajduje „Łóżko". NFD rozkłada ą/ę/ó/ś/ż/ź/ć/ń na literę + znak łączący
// (zdejmowany regexem), ale ł/Ł NIE ma dekompozycji w Unicode — mapujemy
// jawnie (po toLowerCase wystarczy „ł").
export function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .replace(/ł/g, "l")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();
}
```

- [ ] **Step 4: Run — musi przechodzić**

Run: `npx vitest run app/_lib/__tests__/search-normalize.test.ts`
Expected: PASS (3 testy).

- [ ] **Step 5: Pełna weryfikacja + commit**

Run: `npx tsc --noEmit` → 0 błędów. `npm run test` → wszystkie (409 + 3 = 412).

```bash
git add app/_lib/search-normalize.ts app/_lib/__tests__/search-normalize.test.ts
git commit -m "feat(admin): normalizeSearchText - normalizacja frazy (diakrytyki, l-z-kreska, case)"
```

---

### Task 2: ProductsList (filtr na żywo) + odchudzenie page

**Files:**
- Create: `app/admin/produkty/ProductsList.tsx`
- Modify: `app/admin/produkty/page.tsx` (całość — patrz Step 2)

**Interfaces:**
- Consumes: `normalizeSearchText` z `@/app/_lib/search-normalize` (Task 1); istniejące client componenty `DeleteProductButton`, `ToggleProductActiveButton` (z tego samego katalogu); `hasVariants`, `totalProductStock` z `@/app/_lib/variants` (tylko w page, serwerowo).
- Produces: `export default function ProductsList({ products }: { products: AdminProductRow[] })` + `export type AdminProductRow` — konsumowane tylko przez page.

- [ ] **Step 1: Nowy komponent ProductsList**

Create `app/admin/produkty/ProductsList.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { normalizeSearchText } from "@/app/_lib/search-normalize";
import DeleteProductButton from "./DeleteProductButton";
import ToggleProductActiveButton from "./ToggleProductActiveButton";

// Lekka projekcja z serwera — bez pełnego JSON-a wariantów (stock i liczba
// wariantów policzone w page, żeby nie wysyłać zbędnych danych do klienta).
export type AdminProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  variantCount: number;
  thumb: string | null;
  isActive: boolean;
};

function productsWord(n: number): string {
  return n === 1 ? "produkt" : n < 5 ? "produkty" : "produktów";
}

// Lista produktów z filtrem na żywo. Filtr działa w przeglądarce — wszystkie
// produkty i tak są załadowane na tę stronę (bez paginacji), więc zawężanie
// przy każdej literze jest natychmiastowe, bez podróży na serwer.
export default function ProductsList({ products }: { products: AdminProductRow[] }) {
  const [query, setQuery] = useState("");
  const q = normalizeSearchText(query);
  const visible = q
    ? products.filter(
        (p) =>
          normalizeSearchText(p.name).includes(q) ||
          normalizeSearchText(p.category).includes(q)
      )
    : products;

  return (
    <div className="flex flex-col gap-4">
      {/* data-guard-ignore: wpisywanie frazy to nie edycja danych — nie może
          uzbrajać guardu niezapisanych zmian (jak szukajka w zamówieniach). */}
      <div data-guard-ignore className="relative max-w-lg">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj: nazwa lub kategoria…"
          aria-label="Szukaj produktu"
          className="w-full px-4 py-2.5 pr-10 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Wyczyść wyszukiwanie"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--muted)]">
        {q
          ? `${visible.length} z ${products.length} ${productsWord(products.length)}`
          : `Łącznie: ${products.length} ${productsWord(products.length)}`}
      </p>

      {visible.length === 0 ? (
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl text-center text-[var(--muted)]">
          Brak produktów dla &bdquo;{query.trim()}&rdquo;.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-4 p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl hover:border-[var(--color-gold)] transition-colors"
            >
              <div className="relative w-20 h-20 shrink-0 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden">
                {p.thumb ? (
                  <Image
                    src={p.thumb}
                    alt={p.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">
                    brak
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-semibold text-[var(--fg)] truncate">
                  {p.name}
                  {!p.isActive && (
                    <span className="ml-2 align-middle px-2 py-0.5 text-[10px] font-sans uppercase tracking-widest rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      ukryty
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {p.category} · {p.price.toFixed(2)} zł · stock: {p.stock}
                  {p.variantCount > 0 &&
                    ` · ${p.variantCount} wariant${p.variantCount === 1 ? "" : p.variantCount < 5 ? "y" : "ów"}`}
                </p>
              </div>

              <Link
                href={`/admin/produkty/${p.id}`}
                className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] border border-[var(--color-gold)] rounded-lg hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
              >
                Edytuj
              </Link>
              <ToggleProductActiveButton productId={p.id} isActive={p.isActive} />
              <DeleteProductButton productId={p.id} productName={p.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Odchudzenie page.tsx**

Replace `app/admin/produkty/page.tsx` w całości:

```tsx
import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { createClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import { hasVariants, totalProductStock } from "@/app/_lib/variants";
import ProductsList, { type AdminProductRow } from "./ProductsList";

export const metadata = { title: "Produkty — Admin" };

export default async function AdminProductsPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  // Projekcja dla client componentu — stock/warianty liczone serwerowo,
  // pełny JSON wariantów nie jedzie do przeglądarki.
  const rows: AdminProductRow[] = ((data ?? []) as Product[]).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price),
    stock: hasVariants(p) ? totalProductStock(p) : p.stock,
    variantCount: p.variants?.options.length ?? 0,
    thumb: p.images[0] ?? null,
    isActive: p.is_active,
  }));

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Admin
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
            Produkty
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2">
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

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-300 text-sm">
          Błąd ładowania produktów: {error.message}
        </div>
      )}

      {rows.length === 0 ? (
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl text-center text-[var(--muted)]">
          Brak produktów. Kliknij &bdquo;+ Nowy produkt&rdquo;, żeby dodać pierwszy.
        </div>
      ) : (
        <ProductsList products={rows} />
      )}
    </div>
  );
}
```

(Licznik „Łącznie: N…" przeniósł się do ProductsList — w nagłówku zostaje samo zdanie instruktażowe. `import Image` znika z page — używa go tylko ProductsList.)

- [ ] **Step 3: Weryfikacja statyczna**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npm run test` → 412 passed.

- [ ] **Step 4: Smoke kompilacji strony**

`npm run dev` (background), poczekaj na 200, potem:

```bash
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/admin/produkty
```

Expected: `200` lub `307` (redirect do logowania — strona wymaga admina; chodzi o brak 500). Wizualną weryfikację filtra robi kontroler/Mikołaj po zalogowaniu. Zabij dev serwer.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/ProductsList.tsx app/admin/produkty/page.tsx
git commit -m "feat(admin): wyszukiwarka produktow - filtr na zywo po nazwie i kategorii"
```
