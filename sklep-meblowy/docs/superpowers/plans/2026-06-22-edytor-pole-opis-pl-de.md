# Edytor WYSIWYG dla pojedynczego pola opisu (PL+DE) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Objąć pojedynczy opis produktu (`description` PL + `description_de` DE) tym samym edytorem WYSIWYG co sekcje, żeby nie wpisywać HTML ręcznie.

**Architecture:** Reuse istniejącego `RichTextEditor`. PL dostaje nowy, samodzielnie-zapisujący blok `DescriptionFieldEditor` (jak zdjęcia/sekcje/warianty) + akcję `updateProductDescription`. DE: zamiana textarea „Opis (DE)" na `RichTextEditor`. Oba pola sanityzowane przy zapisie. Render bez zmian (pojedynczy opis to fallback przy braku sekcji).

**Tech Stack:** Next.js 16.2.4 (App Router, Server Actions), React 19.2.4, TipTap (już zainstalowany), TypeScript, Vitest, Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-22-edytor-pole-opis-pl-de-design.md`

## Global Constraints

- **Reuse `RichTextEditor`** (`app/admin/produkty/[id]/RichTextEditor.tsx`, props `{ value, onChange, ariaLabel, placeholder? }`) — BEZ zmian w komponencie.
- **Render bez zmian** — pojedynczy opis renderuje się jako fallback tylko gdy produkt nie ma sekcji (`app/produkt/[id]/page.tsx:279-296`). NIE zmieniać layoutu/renderu.
- **Sanitize-on-save** dla obu pól przez `sanitizeProductHtml` (`app/_lib/product-html.ts`).
- **`updateProductBasics` zostaje BEZ zmian** — nadal pomija `description`. Opis ma własny zapis.
- **PL — własny przycisk zapisu** „Zapisz opis" (wzorzec self-save jak `DescriptionSectionsEditor`).
- **Bez migracji bazy. Bez zmian whitelisty.** Format = HTML string.
- **Panel admina PL-only**; komentarze po polsku.
- **Brak nowej czystej logiki** do testów jednostkowych (sanityzacja = istniejący, otestowany `sanitizeProductHtml`). Akcje (DB) nie są testowane jednostkowo w tym repo — wzorzec jak inne akcje. Weryfikacja: `tsc`/`lint`/`build` + smoke ręczny. NIE pisać testów komponentów (env node, brak DOM).

## File Structure

- **Modify** `app/admin/produkty/actions.ts` — dodać akcję `updateProductDescription`; w `saveProductDe` sanityzować `description_de` przez `sanitizeProductHtml`; dodać `sanitizeProductHtml` do istniejącego importu z `product-html`.
- **Create** `app/admin/produkty/[id]/DescriptionFieldEditor.tsx` — blok edycji pojedynczego opisu PL (stan + dirty + toast + „Zapisz opis"), używa `RichTextEditor`.
- **Modify** `app/admin/produkty/[id]/ProductEditor.tsx` — wyrenderować `<DescriptionFieldEditor>` nad `<DescriptionSectionsEditor>`.
- **Modify** `app/admin/produkty/[id]/TranslationEditor.tsx` — pole „Opis (DE)": textarea → `RichTextEditor` + hint.

Kolejność: backend (akcja + sanitize DE) → PL UI (konsumuje akcję) → DE UI → bramki.

---

### Task 1: Backend — akcja `updateProductDescription` + sanitize-on-save DE

**Files:**
- Modify: `app/admin/produkty/actions.ts` (import z `product-html` ~linia 5-13; `saveProductDe` ~474-511, pole `description_de` ~489; dodać nową akcję np. po `updateProductDescriptionSections`)

**Interfaces:**
- Consumes: `sanitizeProductHtml(html: string | null | undefined): string` z `@/app/_lib/product-html`; `requireAdmin`, `createAdminClient`, `ActionResult` (już w pliku).
- Produces: `updateProductDescription(productId: string, html: string): Promise<ActionResult>` — sanityzuje `html` i zapisuje do `products.description`.

- [ ] **Step 1: Dodaj `sanitizeProductHtml` do importu z product-html**

W `actions.ts` istnieje już `import { sanitizeSectionsHtml } from "@/app/_lib/product-html";`. Zmień na:
```ts
import { sanitizeSectionsHtml, sanitizeProductHtml } from "@/app/_lib/product-html";
```

- [ ] **Step 2: Sanityzuj `description_de` w `saveProductDe`**

W `saveProductDe`, w obiekcie `updates`, linia zapisu `description_de` (dziś `description_de: sanitize(fields.description_de, 20000),`) zamień na:
```ts
    description_de: sanitizeProductHtml(fields.description_de ?? ""),
```
(Pole jest teraz bogatym HTML z edytora — sanityzujemy jak resztę opisu; usuwamy crude cap 20000, bo cięcie HTML po znakach rwie tagi — spójnie z sekcjami, które też nie cappują.)

- [ ] **Step 3: Dodaj akcję `updateProductDescription`**

Wklej (np. zaraz po `updateProductDescriptionSections`):
```ts
// ============================================================
// updateProductDescription — pojedynczy opis produktu (PL)
// ============================================================
// Opis renderuje sie na karcie jako fallback TYLKO gdy produkt nie ma sekcji.
// Ma wlasny zapis (jak zdjecia/sekcje/warianty); updateProductBasics go pomija.
export async function updateProductDescription(
  productId: string,
  html: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!productId) return { ok: false, error: "Brak id produktu" };
  if (typeof html !== "string") return { ok: false, error: "Opis musi być tekstem" };

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ description: sanitizeProductHtml(html) } as never)
    .eq("id", productId);

  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/produkty/${productId}`);
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  return { ok: true, message: "Zapisano opis produktu" };
}
```

- [ ] **Step 4: Bramka typów + regresja**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npx vitest run app/_lib/__tests__/product-html.test.ts` → PASS (regresja sanitizera, bez zmian).

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/actions.ts
git commit -m "feat(produkty): akcja updateProductDescription + sanitize-on-save opisu DE"
```

---

### Task 2: PL — komponent `DescriptionFieldEditor` + wpięcie w `ProductEditor`

**Files:**
- Create: `app/admin/produkty/[id]/DescriptionFieldEditor.tsx`
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx` (import + render nad `<DescriptionSectionsEditor>` ~linia 394)

**Interfaces:**
- Consumes: `updateProductDescription` (Task 1); `RichTextEditor` (`./RichTextEditor`); `Toast` (`./_shared`); `product.description` (typ `Product`, pole używane w `page.tsx`).
- Produces: domyślny export `DescriptionFieldEditor` o propsach `{ productId: string; initial: string; onToast: (t: Toast) => void }`.

- [ ] **Step 1: Utwórz komponent**

```tsx
// app/admin/produkty/[id]/DescriptionFieldEditor.tsx
"use client";

import { useState, useTransition } from "react";
import { updateProductDescription } from "../actions";
import RichTextEditor from "./RichTextEditor";
import type { Toast } from "./_shared";

// Pojedynczy opis produktu (PL). Renderuje sie na karcie TYLKO gdy produkt nie
// ma sekcji opisu (fallback) — stad hint. Ma wlasny zapis (jak zdjecia/sekcje/
// warianty); updateProductBasics tego pola nie dotyka.
export default function DescriptionFieldEditor({
  productId,
  initial,
  onToast,
}: {
  productId: string;
  initial: string;
  onToast: (t: Toast) => void;
}) {
  const [value, setValue] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const [saving, startSave] = useTransition();
  const dirty = value !== baseline;

  function save() {
    startSave(async () => {
      const res = await updateProductDescription(productId, value);
      if (res.ok) {
        setBaseline(value);
        onToast({ type: "success", message: res.message ?? "Zapisano opis" });
      } else {
        onToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <section className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4">
      <div>
        <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
          Opis produktu
        </h2>
        <p className="text-sm text-[var(--muted)] mt-1 max-w-2xl leading-relaxed">
          Pokazywany na karcie produktu <strong>tylko gdy nie dodasz sekcji opisu
          poniżej</strong>. Jeśli używasz sekcji, to pole jest ignorowane.
        </p>
      </div>

      <RichTextEditor
        value={value}
        onChange={setValue}
        ariaLabel="Opis produktu"
        placeholder="Napisz opis — użyj paska do pogrubień, list i nagłówków."
      />

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-[var(--border)]">
        <p className="text-xs text-[var(--muted)]">
          {dirty ? "Masz niezapisane zmiany." : "Opis zapisany."}
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving || !dirty}
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz opis"}
        </button>
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Wepnij w `ProductEditor`**

W `ProductEditor.tsx` dodaj import (do istniejących importów komponentów, obok `DescriptionSectionsEditor`):
```ts
import DescriptionFieldEditor from "./DescriptionFieldEditor";
```
Następnie **bezpośrednio przed** blokiem `<DescriptionSectionsEditor ... />` (komentarz „Sekcja: Edytor sekcji opisu" / ~linia 391-398) wstaw:
```tsx
      {/* ============================================================
          Sekcja: Pojedynczy opis (fallback gdy brak sekcji)
          ============================================================ */}
      <DescriptionFieldEditor
        productId={product.id}
        initial={product.description ?? ""}
        onToast={showToast}
      />

```
(`showToast` istnieje już w `ProductEditor`. Jeśli tsc zgłosi, że `product.description` może być `null`/`undefined` — `?? ""` to pokrywa.)

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit` → 0.
Run: `npm run lint` → 0.
Run: `npm run build` → przechodzi (Turbopack; kilka minut — duży timeout).

- [ ] **Step 4: Commit**

```bash
git add app/admin/produkty/[id]/DescriptionFieldEditor.tsx app/admin/produkty/[id]/ProductEditor.tsx
git commit -m "feat(produkty): blok 'Opis produktu' (PL) z edytorem WYSIWYG + wlasny zapis"
```

---

### Task 3: DE — zamiana textarea „Opis (DE)" → `RichTextEditor`

**Files:**
- Modify: `app/admin/produkty/[id]/TranslationEditor.tsx` (pole „Opis (DE)" ~linia 219-227)

**Interfaces:**
- Consumes: `RichTextEditor` (`./RichTextEditor`) — **import już istnieje** w pliku (dodany przy sekcjach DE); stan `descriptionDe`/`setDescriptionDe` (już istnieje).
- Produces: nic nowego.

- [ ] **Step 1: Zamień pole „Opis (DE)"**

Blok (dziś):
```tsx
        <Field label="Opis (DE)" className="md:col-span-2" hint="HTML dozwolony (jak w polskim opisie).">
          <textarea
            value={descriptionDe}
            onChange={(e) => setDescriptionDe(e.target.value)}
            rows={6}
            placeholder="Niemiecki opis produktu"
            className={`${inputClass} resize-y`}
          />
        </Field>
```
zamień na:
```tsx
        <Field label="Opis (DE)" className="md:col-span-2" hint="Pokazywany na /de tylko gdy produkt nie ma sekcji opisu DE.">
          <RichTextEditor
            value={descriptionDe}
            onChange={setDescriptionDe}
            ariaLabel="Niemiecki opis produktu"
            placeholder="Niemiecki opis produktu"
          />
        </Field>
```
(Jeśli `import RichTextEditor from "./RichTextEditor";` nie ma na górze pliku — dodaj go. Jeśli `inputClass` przestaje być używany po tej zamianie, sprawdź czy jest jeszcze potrzebny w innych polach DE — jest, w „Nazwa (DE)"/„Kolor (DE)"/„Materiał (DE)" — więc importu `inputClass` NIE usuwaj.)

- [ ] **Step 2: Bramki**

Run: `npx tsc --noEmit` → 0.
Run: `npm run lint` → 0.
Run: `npm run build` → przechodzi.

- [ ] **Step 3: Commit**

```bash
git add app/admin/produkty/[id]/TranslationEditor.tsx
git commit -m "feat(produkty): edytor WYSIWYG w pojedynczym opisie DE"
```

---

### Task 4: Pełne bramki jakości + smoke końcowy

**Files:** brak zmian (chyba że bramki coś wykażą).

- [ ] **Step 1: Pełny zestaw bramek**

```bash
npx tsc --noEmit      # 0
npm run lint          # 0
npm test              # vitest — zielony (207+ testów, bez regresji)
npm run build         # Turbopack przechodzi
```

- [ ] **Step 2: Smoke end-to-end (ręcznie, `npm run dev`)**

- [ ] `/admin/produkty/[id]` → blok „Opis produktu" (PL): napisz listę punktowaną + pogrubienie → „Zapisz opis".
- [ ] Produkt **bez sekcji** → `/produkt/[id]`: opis renderuje się jako lista (nie jedna linia).
- [ ] Produkt **z sekcjami** → `/produkt/[id]`: pojedynczy opis NIE pokazuje się (fallback); sekcje widoczne.
- [ ] Sekcja „Tłumaczenie DE" → „Opis (DE)": sformatuj → „Zapisz tłumaczenie DE"; produkt bez sekcji DE → `/de/produkt/[id]` pokazuje sformatowany opis DE.
- [ ] Pusty „Opis produktu" → po zapisie `/produkt/[id]` nie renderuje pustego bloku.

- [ ] **Step 3: Commit (jeśli bramki coś poprawiły)**

```bash
git add -A
git commit -m "chore(produkty): domkniecie bramek edytora pojedynczego opisu"
```

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:** akcja `updateProductDescription` (T1), sanitize-on-save DE (T1 Step 2), komponent `DescriptionFieldEditor` + wpięcie PL (T2), zamiana DE textarea→edytor + hint (T3), hinty fallbacku (T2 Step 1 PL, T3 Step 1 DE), render bez zmian (Global Constraints — nie tknięty), `updateProductBasics` nietknięte (Global Constraints), reuse RichTextEditor (T2/T3), bez migracji. Wszystko pokryte.

**Placeholder scan:** brak TBD/„handle errors"/„similar to". Każdy krok ma realny kod/komendę. Numery linii z `~` + kotwice kontekstowe (przesuwają się).

**Type consistency:** `updateProductDescription(productId: string, html: string): Promise<ActionResult>` spójne między T1 (definicja) a T2 (użycie). `DescriptionFieldEditor` props `{ productId, initial, onToast }` spójne między definicją (T2 Step 1) a wpięciem (T2 Step 2: `productId={product.id} initial={product.description ?? ""} onToast={showToast}`). `RichTextEditor` props `{ value, onChange, ariaLabel, placeholder }` użyte tak samo w T2 i T3 oraz jak w istniejącym komponencie. `Toast` z `./_shared`.
