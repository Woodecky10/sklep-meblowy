# Zestawy: opis → WYSIWYG (Etap 2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) tracking.

**Goal:** Opis zestawu (`description`/`description_de`) redagowany wspólnym edytorem WYSIWYG i renderowany jako sanityzowany HTML — jak blok „Tekst" z Etapu 1.

**Architecture:** Reużycie `RichTextEditor` (`@/app/admin/_shared/RichTextEditor`, `enableImage` domyślnie false) i `sanitizeRichHtml`. Formularz zestawu jest uncontrolled (`<form action={submit}>` + `FormData`), więc kontrolowany edytor mostkujemy przez `<input type="hidden" name="description">` zsynchronizowany ze stanem. Sanityzacja przy zapisie (server action) i renderze (strona zestawu). SEO meta = czysty tekst.

**Tech Stack:** Next 16, React 19, TypeScript, TipTap (istniejący edytor), Tailwind v4.

## Global Constraints
- Ta praca leży na gałęzi `feat/wysiwyg-bloki-tresci` (kontynuacja; zależy od wspólnego edytora i `sanitizeRichHtml` z Etapu 1, których NIE ma na main).
- Komendy z `sklep-meblowy/sklep-meblowy`. Weryfikacja: `npx tsc --noEmit`, `npx eslint <pliki>`, `npm run build`.
- HTML z edytora ZAWSZE sanityzowany `sanitizeRichHtml` (whitelist) przy zapisie i renderze. Cap 20000 znaków.
- Dwujęzyczność PL + DE (para `description` + `description_de`, fallback PL — realizuje `getBundleBySlug`, bez zmian).
- Render używa klasy `.rich-text` (istnieje z Etapu 1) + `dangerouslySetInnerHTML`.
- Bez zmian w DB (kolumny text `description`/`description_de` już są; RPC `save_bundle` przyjmuje string).
- Brak testów jednostkowych dla tych plików (server action / client form / page) — dowód = tsc + eslint + build; wizualną weryfikację robi kontroler/user.

---

## Task 1: Opis zestawu → WYSIWYG (formularz + zapis + render)

**Files:**
- Modify: `sklep-meblowy/app/admin/zestawy/BundlesEditor.tsx` (formularz: textarea → RichTextEditor + hidden inputs)
- Modify: `sklep-meblowy/app/admin/zestawy/actions.ts` (sanityzacja HTML opisu przy zapisie)
- Modify: `sklep-meblowy/app/zestaw/[slug]/page.tsx` (render HTML + SEO meta plain text + snippet składnika)

**Interfaces:**
- Consumes: `RichTextEditor` default export (`enableImage` off → brak przycisku obrazka), `sanitizeRichHtml` i `extractShortDescription` z `@/app/_lib/product-html`.

- [ ] **Step 1: actions.ts — sanityzacja HTML opisu**

W `app/admin/zestawy/actions.ts`:
1. Dodaj import u góry:
```ts
import { sanitizeRichHtml } from "@/app/_lib/product-html";
```
2. Dodaj helper obok `emptyToNull`:
```ts
const MAX_RICH = 20000;
// Sanityzuje HTML z edytora, obcina do limitu, zwraca null gdy po usunięciu
// tagów nie ma treści (np. puste <p></p>).
function cleanRich(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const html = sanitizeRichHtml(input).slice(0, MAX_RICH);
  const text = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
  return text.length > 0 ? html : null;
}
```
3. W `parseBundleForm` zamień dwie linie opisu:
```ts
// było:
//   description: emptyToNull(sanitize(formData.get("description"), 2000)),
//   descriptionDe: emptyToNull(sanitize(formData.get("description_de"), 2000)),
    description: cleanRich(formData.get("description")),
    descriptionDe: cleanRich(formData.get("description_de")),
```
(`emptyToNull` zostaje — nadal używane dla `name_de`.)

- [ ] **Step 2: BundlesEditor.tsx — edytor WYSIWYG opisu**

W `app/admin/zestawy/BundlesEditor.tsx`:
1. Dodaj import:
```ts
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
```
2. W `BundleForm` dodaj stan (obok `selectedIds`):
```ts
  const [description, setDescription] = useState(bundle?.description ?? "");
  const [descriptionDe, setDescriptionDe] = useState(bundle?.description_de ?? "");
```
3. Zamień oba pola opisu (obecnie `<textarea name="description" …>` i `…_de`) na:
```tsx
        <Field label="Opis" hint="Opcjonalny. Obsługuje formatowanie." className="md:col-span-2">
          <input type="hidden" name="description" value={description} />
          <RichTextEditor value={description} onChange={setDescription} ariaLabel="Opis zestawu (PL)" placeholder="Opis zestawu…" />
        </Field>
        <Field label="Opis (DE)" hint="Puste → na /de pokaże się opis PL." className="md:col-span-2">
          <input type="hidden" name="description_de" value={descriptionDe} />
          <RichTextEditor value={descriptionDe} onChange={setDescriptionDe} ariaLabel="Opis zestawu (DE)" />
        </Field>
```
(Hidden input niesie wartość do `FormData` — reszta submitu bez zmian.)

- [ ] **Step 3: zestaw/[slug]/page.tsx — render HTML + meta + snippet**

W `app/zestaw/[slug]/page.tsx`:
1. Dodaj import:
```ts
import { sanitizeRichHtml, extractShortDescription } from "@/app/_lib/product-html";
```
2. `generateMetadata` — meta opis jako czysty tekst (SEO nie może zawierać tagów):
```ts
// było: description: bundle.description ?? undefined,
    description: bundle.description ? extractShortDescription(bundle.description, 200) : undefined,
```
3. Render opisu (obecnie `<p …>{bundle.description}</p>`):
```tsx
      {bundle.description && (
        <div
          className="rich-text text-[var(--muted)] mb-10 max-w-2xl"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(bundle.description) }}
        />
      )}
```
4. Snippet składnika (obecnie `{p.description?.slice(0, 120)}` — opis produktu to HTML, więc surowe cięcie pokazuje tagi). Zamień na czysty tekst:
```tsx
                <p className="text-sm text-[var(--muted)]">{p.description ? extractShortDescription(p.description, 120) : null}</p>
```

- [ ] **Step 4: Weryfikacja**

Run: `npx tsc --noEmit` → clean.
Run: `npx eslint app/admin/zestawy/BundlesEditor.tsx app/admin/zestawy/actions.ts app/zestaw/[slug]/page.tsx` → brak błędów.
Run: `npx vitest run` → cały zestaw zielony (regresja).
Run: `npm run build` → sukces.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/admin/zestawy/BundlesEditor.tsx sklep-meblowy/app/admin/zestawy/actions.ts sklep-meblowy/app/zestaw/[slug]/page.tsx
git commit -m "feat(zestawy): opis zestawu na edytorze WYSIWYG (HTML sanityzowany, render + SEO plain)"
```

## Notes
- Istniejące opisy w DB to czysty tekst — `sanitizeRichHtml(plainText)` przepuszcza je, renderują się poprawnie; przy pierwszej edycji stają się HTML. Bez migracji danych.
- `.rich-text` i `sanitizeRichHtml`/`extractShortDescription` już istnieją (Etap 1 / product-html) — brak nowych zależności.

## Self-Review
- Pokrycie: zapis (Step 1) + edytor (Step 2) + render/meta/snippet (Step 3) = pełna ścieżka opisu HTML. Sanityzacja na zapisie i renderze. PL/DE zachowane (getBundleBySlug bez zmian). Meta = plain text. Brak placeholderów. Nazwy: `cleanRich`, `sanitizeRichHtml`, `extractShortDescription` spójne z użyciem.
