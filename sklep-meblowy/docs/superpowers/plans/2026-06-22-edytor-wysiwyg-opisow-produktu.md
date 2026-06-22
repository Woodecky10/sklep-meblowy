# Edytor WYSIWYG opisów produktu — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dać nietechnicznej osobie edytor WYSIWYG (jak w Wordzie) do pisania opisów produktu, żeby listy i akapity przestały zlewać się w jedną linię.

**Architecture:** Magazyn (HTML w JSONB `description_sections`), render (`dangerouslySetInnerHTML` po `sanitizeProductHtml`) i whitelist tagów już istnieją i zostają bez zmian. Dokładamy front-endowy komponent `RichTextEditor` (TipTap, client-only) produkujący ten sam HTML, wpinamy go w 3 pola edycji treści, i utwardzamy zapis (`sanitize-on-save`).

**Tech Stack:** Next.js 16.2.4 (App Router, Turbopack), React 19.2.4, TipTap 3.x (`@tiptap/react`, `@tiptap/starter-kit`, `@tiptap/extension-link`), TypeScript, Vitest (node env), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-22-edytor-wysiwyg-opisow-produktu-design.md`

## Global Constraints

- **Next 16 to NIE Next z treningu** — przed kodem Server/Client w Next sprawdź `node_modules/next/dist/docs/` (zwłaszcza `01-app/01-getting-started/05-server-and-client-components.md` i `01-app/03-api-reference/08-turbopack.md`). (Z `AGENTS.md`.)
- **TipTap musi działać z React 19.2 + Next 16.2/Turbopack** — render client-only, `useEditor({ immediatelyRender: false })`. Weryfikacja (build) jest bramką Taska 4, ZANIM wepniemy edytor w 3 miejsca.
- **Format treści bez zmian:** HTML string. Bez migracji bazy, bez zmian renderu, bez zmian whitelisty (`app/_lib/product-html.ts`).
- **Whitelist tagów (niezmienny):** `p, br, ul, ol, li, strong, em, b, i, a, h2, h3, h4, span`. Linki tylko http/https/mailto/tel.
- **Nagłówki w treści:** H2 + H3 (bez H4 w edytorze; sekcja ma już tytuł akordeonu).
- **Panel admina jest PL-only** (bez i18n stringów UI).
- **Testy = czyste funkcje, środowisko node** (`vitest.config.mts`: `environment: "node"`, `include: app/**/__tests__/**/*.test.ts`). Komponentów React (contentEditable) NIE testujemy jednostkowo — logikę nietrywialną wynosimy do czystych helperów i testujemy je. Komponent/wpięcie weryfikujemy `npm run build` + ręczny smoke.
- **Manager paczek:** npm. Praca na branchu `feat/edytor-wysiwyg-opisow-produktu` (już istnieje, spec scommitowany). Push do origin = osobno, za zgodą (konto Woodecky10).

## File Structure

- **Create** `app/_lib/rich-text.ts` — czysty helper `normalizeEditorHtml` (pusty HTML → `""`). Bez React, importowalny w node-teście.
- **Create** `app/_lib/__tests__/rich-text.test.ts` — testy `normalizeEditorHtml`.
- **Create** `app/_lib/__tests__/product-html.test.ts` — testy parytetu sanitizera + `sanitizeSectionsHtml`.
- **Modify** `app/_lib/product-html.ts` — dodać czysty helper `sanitizeSectionsHtml(sections)` (sanityzuje `body`/`admin_body` sekcji text).
- **Create** `app/admin/produkty/[id]/RichTextEditor.tsx` — komponent WYSIWYG (TipTap) + pasek narzędzi. Współdzielony przez 3 miejsca.
- **Modify** `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` — 2 pola: `body` (custom) i `admin_body` (override) → `RichTextEditor`.
- **Modify** `app/admin/produkty/[id]/TranslationEditor.tsx` — pole `body` sekcji DE → `RichTextEditor`.
- **Modify** `app/admin/produkty/actions.ts` — `updateProductDescriptionSections` i `saveProductDe` wołają `sanitizeSectionsHtml` przed zapisem.
- **Modify** `package.json` — dodać zależności TipTap (przez `npm install`).

Kolejność tasków jest celowa: najpierw czysta logika i backend (T1–T3, zero TipTap), potem ryzykowna zależność (T4 — bramka build), na końcu wpięcie i bramki. Gdyby TipTap nie przeszedł bramki T4 — T1–T3 zostają jako użyteczny, scommitowany dorobek.

---

### Task 1: Helper `normalizeEditorHtml`

Pusty edytor TipTap zwraca `"<p></p>"`. Logika override/dirty w UI sprawdza `admin_body?.trim()` i `section.body` — pusty edytor MUSI dawać `""`, inaczej sekcja z BL fałszywie pokaże „(treść override)" i dirty-tracking się rozjedzie.

**Files:**
- Create: `app/_lib/rich-text.ts`
- Test: `app/_lib/__tests__/rich-text.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces: `normalizeEditorHtml(html: string): string` — zwraca `""` gdy HTML nie ma żadnego tekstu (`<p></p>`, `<p><br></p>`, same spacje); w przeciwnym razie `html.trim()`.

- [ ] **Step 1: Napisz failing test**

```ts
// app/_lib/__tests__/rich-text.test.ts
import { describe, it, expect } from "vitest";
import { normalizeEditorHtml } from "@/app/_lib/rich-text";

describe("normalizeEditorHtml — pusty edytor → pusty string", () => {
  it("pusty string", () => {
    expect(normalizeEditorHtml("")).toBe("");
  });
  it("pusty paragraf TipTap", () => {
    expect(normalizeEditorHtml("<p></p>")).toBe("");
  });
  it("paragraf z samym <br>", () => {
    expect(normalizeEditorHtml("<p><br></p>")).toBe("");
  });
  it("same białe znaki i &nbsp;", () => {
    expect(normalizeEditorHtml("<p>  &nbsp; </p>")).toBe("");
  });
  it("treść z listą → zwraca przycięty HTML", () => {
    expect(normalizeEditorHtml("<ul><li>Sofa</li></ul>")).toBe(
      "<ul><li>Sofa</li></ul>"
    );
  });
  it("treść z nagłówkiem i akapitem → bez zmian (trim)", () => {
    const html = "<h2>Opis</h2><p>Wygodna sofa.</p>";
    expect(normalizeEditorHtml(`  ${html}  `)).toBe(html);
  });
});
```

- [ ] **Step 2: Uruchom test — ma FAILOWAĆ**

Run: `npx vitest run app/_lib/__tests__/rich-text.test.ts`
Expected: FAIL — `normalizeEditorHtml is not a function` / brak modułu.

- [ ] **Step 3: Implementacja minimalna**

```ts
// app/_lib/rich-text.ts
// Normalizacja wyjścia edytora WYSIWYG (TipTap).
// TipTap dla pustej treści zwraca "<p></p>" — a logika override/dirty w panelu
// traktuje pusty string jako "brak treści/override". Sprowadzamy więc treść
// bez żadnego tekstu do "". Bez React → importowalne w node-testach.
export function normalizeEditorHtml(html: string): string {
  if (!html) return "";
  const text = html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0 ? "" : html.trim();
}
```

- [ ] **Step 4: Uruchom test — ma PRZECHODZIĆ**

Run: `npx vitest run app/_lib/__tests__/rich-text.test.ts`
Expected: PASS (6 testów).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/rich-text.ts app/_lib/__tests__/rich-text.test.ts
git commit -m "feat(produkty): helper normalizeEditorHtml (pusty edytor -> pusty string)"
```

---

### Task 2: Test parytetu sanitizera (charakteryzujący)

Cały plan opiera się na tym, że istniejący `sanitizeProductHtml` przepuszcza HTML, który wyprodukuje TipTap. Lock-in tego kontraktu testem, ZANIM dołożymy edytor. To test charakteryzujący istniejący kod — nie zmieniamy `sanitizeProductHtml`.

**Files:**
- Create: `app/_lib/__tests__/product-html.test.ts`

**Interfaces:**
- Consumes: `sanitizeProductHtml(html: string | null | undefined): string` z `@/app/_lib/product-html`.
- Produces: nic (tylko test).

- [ ] **Step 1: Napisz test**

```ts
// app/_lib/__tests__/product-html.test.ts
import { describe, it, expect } from "vitest";
import { sanitizeProductHtml } from "@/app/_lib/product-html";

describe("sanitizeProductHtml — parytet z wyjściem TipTap", () => {
  it("przepuszcza akapity, listy, nagłówki H2/H3 i inline marks bez zmian", () => {
    const html =
      "<h2>Opis</h2><p>Wygodna <strong>sofa</strong> z <em>funkcją</em> spania.</p>" +
      "<ul><li>Tkanina wodoodporna</li><li>5 lat gwarancji</li></ul>" +
      "<h3>Detale</h3><ol><li>Punkt</li></ol>";
    expect(sanitizeProductHtml(html)).toBe(html);
  });

  it("przepuszcza bezpieczny link z rel/target", () => {
    const html = '<p><a href="https://mollien.pl" rel="noopener nofollow">Więcej</a></p>';
    expect(sanitizeProductHtml(html)).toBe(html);
  });

  it("wycina tag spoza whitelisty (div), zachowuje treść", () => {
    expect(sanitizeProductHtml("<div>Tekst</div>")).toBe("Tekst");
  });

  it("usuwa <script> wraz z zawartością", () => {
    const out = sanitizeProductHtml('<p>OK</p><script>alert(1)</script>');
    expect(out).toBe("<p>OK</p>");
  });

  it("dropuje link z niebezpiecznym schematem (javascript:)", () => {
    const out = sanitizeProductHtml('<a href="javascript:alert(1)">x</a>');
    expect(out).not.toContain("javascript:");
  });
});
```

- [ ] **Step 2: Uruchom test — ma PRZECHODZIĆ od razu**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: PASS (5 testów). To charakteryzuje istniejący kod.
> Jeśli któryś FAILuje — NIE zmieniaj `sanitizeProductHtml` na ślepo. Zatrzymaj się i zgłoś: założenie planu (render akceptuje wyjście TipTap) jest fałszywe i trzeba je zaadresować.

- [ ] **Step 3: Commit**

```bash
git add app/_lib/__tests__/product-html.test.ts
git commit -m "test(produkty): parytet sanitizera z wyjsciem edytora WYSIWYG"
```

---

### Task 3: Sanitize-on-save (`sanitizeSectionsHtml` + wpięcie w actions)

Dziś zapis sekcji NIE sanityzuje HTML (sanityzacja tylko na renderze). Dokładamy obronną sanityzację przy zapisie — w bazie zawsze whitelistowany HTML, niezależnie od edytora.

**Files:**
- Modify: `app/_lib/product-html.ts` (dodać `sanitizeSectionsHtml` na końcu pliku)
- Modify: `app/admin/produkty/actions.ts` (`updateProductDescriptionSections` ~383, `saveProductDe` ~474)
- Test: `app/_lib/__tests__/product-html.test.ts` (dopisać blok)

**Interfaces:**
- Consumes: `sanitizeProductHtml` (z product-html.ts), typ `ProductDescriptionSection` (z `@/app/_lib/types`).
- Produces: `sanitizeSectionsHtml(sections: ProductDescriptionSection[]): ProductDescriptionSection[]` — zwraca nową tablicę; dla sekcji `kind:"text"` sanityzuje `body` i (gdy string) `admin_body`; sekcje `image` bez zmian.

- [ ] **Step 1: Dopisz failing test do `product-html.test.ts`**

```ts
import { sanitizeSectionsHtml } from "@/app/_lib/product-html";
import type { ProductDescriptionSection } from "@/app/_lib/types";

describe("sanitizeSectionsHtml — sanityzacja body sekcji przy zapisie", () => {
  it("sanityzuje body i admin_body sekcji text", () => {
    const sections: ProductDescriptionSection[] = [
      {
        kind: "text",
        title: "Opis",
        body: '<p>OK</p><script>alert(1)</script>',
        admin_body: "<div>nadpis</div>",
      },
    ];
    const out = sanitizeSectionsHtml(sections);
    expect(out[0].kind).toBe("text");
    if (out[0].kind === "text") {
      expect(out[0].body).toBe("<p>OK</p>");
      expect(out[0].admin_body).toBe("nadpis");
      expect(out[0].title).toBe("Opis"); // tytuł nietknięty
    }
  });

  it("nie rusza sekcji image", () => {
    const sections: ProductDescriptionSection[] = [
      { kind: "image", image_url: "https://x/y.jpg", image_alt: "Sofa" },
    ];
    expect(sanitizeSectionsHtml(sections)).toEqual(sections);
  });

  it("pomija admin_body gdy nieobecne", () => {
    const sections: ProductDescriptionSection[] = [
      { kind: "text", title: "T", body: "<p>x</p>" },
    ];
    const out = sanitizeSectionsHtml(sections);
    if (out[0].kind === "text") expect(out[0].admin_body).toBeUndefined();
  });
});
```

- [ ] **Step 2: Uruchom — ma FAILOWAĆ**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: FAIL — `sanitizeSectionsHtml is not a function`.

- [ ] **Step 3: Dodaj `sanitizeSectionsHtml` w `product-html.ts`**

Na górze pliku dodaj import typu (po komentarzu nagłówkowym, przed `const ALLOWED_TAGS`):
```ts
import type { ProductDescriptionSection } from "@/app/_lib/types";
```

Na końcu pliku dodaj:
```ts
// ============================================================
// Sanitize sekcji opisu przy ZAPISIE (defense-in-depth)
// ============================================================
// Render już sanityzuje, ale sanityzacja przy zapisie gwarantuje, że w bazie
// ląduje wyłącznie whitelistowany HTML — niezależnie od tego, co wypluje edytor
// WYSIWYG. Tytuły (plain text) zostają nietknięte. Sekcje image bez zmian.
export function sanitizeSectionsHtml(
  sections: ProductDescriptionSection[]
): ProductDescriptionSection[] {
  return sections.map((s) => {
    if (s.kind !== "text") return s;
    const next: ProductDescriptionSection = {
      ...s,
      body: sanitizeProductHtml(s.body),
    };
    if (typeof s.admin_body === "string") {
      next.admin_body = sanitizeProductHtml(s.admin_body);
    }
    return next;
  });
}
```

- [ ] **Step 4: Uruchom — ma PRZECHODZIĆ**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: PASS (8 testów łącznie: 5 z Taska 2 + 3 nowe).

- [ ] **Step 5: Wepnij w `updateProductDescriptionSections`**

W `app/admin/produkty/actions.ts` dodaj import (do istniejących importów na górze):
```ts
import { sanitizeSectionsHtml } from "@/app/_lib/product-html";
```

W `updateProductDescriptionSections`, PO pętli walidacyjnej a PRZED `supabase...update`, zamień blok update tak, by zapisywał oczyszczone sekcje:
```ts
  const clean = sanitizeSectionsHtml(sections);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("products")
    .update({ description_sections: clean } as never)
    .eq("id", productId);
```

- [ ] **Step 6: Wepnij w `saveProductDe` (sekcje DE)**

W `saveProductDe`, blok zapisujący `description_sections_de` zamień na sanityzujący (gdy to tablica):
```ts
  // Sekcje DE — zapisujemy tylko gdy explicit przekazane (inaczej nie ruszamy).
  if (fields.description_sections_de !== undefined) {
    updates.description_sections_de = Array.isArray(fields.description_sections_de)
      ? sanitizeSectionsHtml(
          fields.description_sections_de as ProductDescriptionSection[]
        )
      : fields.description_sections_de;
  }
```
(`ProductDescriptionSection` jest już importowany w `actions.ts`.)

- [ ] **Step 7: Bramka typów + testy**

Run: `npx tsc --noEmit` → 0 błędów.
Run: `npx vitest run app/_lib/__tests__/product-html.test.ts` → PASS.

- [ ] **Step 8: Commit**

```bash
git add app/_lib/product-html.ts app/_lib/__tests__/product-html.test.ts app/admin/produkty/actions.ts
git commit -m "feat(produkty): sanitize-on-save sekcji opisu (PL + DE)"
```

---

### Task 4: Instalacja TipTap + komponent `RichTextEditor` (BRAMKA zależności)

Tu ląduje ryzyko zależności. Najpierw instalacja i build-gate, potem komponent. Komponentu nie testujemy jednostkowo (node env, brak DOM) — weryfikacja = `npm run build` (Turbopack) + ręczny mount.

**Files:**
- Modify: `package.json` (przez `npm install`)
- Create: `app/admin/produkty/[id]/RichTextEditor.tsx`

**Interfaces:**
- Consumes: `normalizeEditorHtml` (z `@/app/_lib/rich-text`).
- Produces: domyślny export `RichTextEditor` o propsach:
  ```ts
  type RichTextEditorProps = {
    value: string;                    // HTML wejściowy
    onChange: (html: string) => void; // HTML znormalizowany (pusty → "")
    ariaLabel: string;                // dostępność (brak widocznego <label>)
    placeholder?: string;
  };
  ```

- [ ] **Step 1: Zainstaluj TipTap 3.x i sprawdź peer-deps React 19**

Run:
```bash
npm install @tiptap/react@^3 @tiptap/starter-kit@^3 @tiptap/extension-link@^3
```
Expected: instalacja bez błędów peer-deps na `react@19.2`. 
> Jeśli npm zgłosi konflikt peer-deps z React 19 — ZATRZYMAJ SIĘ i zgłoś. Nie wymuszaj `--force`/`--legacy-peer-deps`. To bramka: jeśli TipTap nie wspiera React 19, przechodzimy na fallback zero-dep (patrz spec, podejście B) — osobna decyzja.

- [ ] **Step 2: Sprawdź docs Next o client components**

Przeczytaj `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md` — potwierdź, że komponent z hookami (useEditor) musi mieć `"use client"`.

- [ ] **Step 3: Napisz komponent**

```tsx
// app/admin/produkty/[id]/RichTextEditor.tsx
"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { normalizeEditorHtml } from "@/app/_lib/rich-text";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  placeholder?: string;
};

// Edytor WYSIWYG opisu produktu. Wyjście = HTML zgodny z whitelistą
// sanitizeProductHtml (p/br/ul/ol/li/strong/em/a/h2/h3). Treść dostaje klasę
// `product-description`, więc w panelu wygląda 1:1 jak na karcie produktu.
//
// immediatelyRender:false — WYMÓG SSR Next 16 (inaczej hydration mismatch dla
// contentEditable). StarterKit skonfigurowany pod whitelist (h2/h3, bez
// codeBlock/blockquote/strike/hr/code).
export default function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
}: RichTextEditorProps) {
  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
        strike: false,
        code: false,
        // UWAGA: StarterKit 3.x może już dołączać Link. Jeśli build/Step 7
        // ostrzega o duplikacie rozszerzenia "link", skonfiguruj go TUTAJ
        // (link: { openOnClick:false, protocols:[...] }) i USUŃ osobny Link niżej.
      }),
      Link.configure({
        openOnClick: false,
        autolink: true,
        protocols: ["http", "https", "mailto", "tel"],
        HTMLAttributes: { rel: "noopener nofollow" },
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => onChange(normalizeEditorHtml(editor.getHTML())),
    editorProps: {
      attributes: {
        "aria-label": ariaLabel,
        class:
          "product-description min-h-[140px] px-3 py-2 focus:outline-none",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
  });

  if (!editor) return null;

  const btn = (active: boolean) =>
    `px-2 py-1 rounded text-xs font-sans transition-colors ${
      active
        ? "bg-[var(--color-navy)] text-white"
        : "bg-[var(--bg)] text-[var(--fg)] hover:bg-[var(--border)]"
    }`;

  function addLink() {
    const prev = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Adres linku (https://… / mailto:… / tel:…):", prev ?? "");
    if (url === null) return; // anulowano
    if (url.trim() === "") {
      editor!.chain().focus().unsetLink().run();
      return;
    }
    if (!/^(https?:|mailto:|tel:)/i.test(url.trim())) {
      window.alert("Dozwolone tylko linki http(s):, mailto: lub tel:");
      return;
    }
    editor!.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  return (
    <div className="border border-[var(--border)] rounded-lg bg-[var(--bg)] overflow-hidden">
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--card-bg)]">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} aria-label="Pogrubienie"><strong>B</strong></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} aria-label="Kursywa"><em>I</em></button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} aria-label="Lista punktowana">• Lista</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} aria-label="Lista numerowana">1. Lista</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} aria-label="Nagłówek H2">H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} aria-label="Nagłówek H3">H3</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} aria-label="Wstaw link">🔗 Link</button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} aria-label="Wyczyść formatowanie">✕ Wyczyść</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
```

- [ ] **Step 4: Dodaj styl placeholdera (opcjonalny, drobny)**

W `app/globals.css` dołóż regułę placeholdera dla pustego edytora (ProseMirror oznacza pusty node):
```css
.product-description p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--muted);
  float: left;
  height: 0;
  pointer-events: none;
}
```
> Jeśli placeholder ma działać w pełni, wymaga rozszerzenia `Placeholder` z TipTap; na MVP wystarczy `data-placeholder` na kontenerze + powyższy CSS. Placeholder jest „nice to have" — nie blokuje funkcji. Jeśli sprawia problem, pomiń ten krok.

- [ ] **Step 5: Bramka typów**

Run: `npx tsc --noEmit`
Expected: 0 błędów. (Jeśli błąd typów z konfiguracji StarterKit/Link — dostosuj wg typów w `node_modules/@tiptap/starter-kit`.)

- [ ] **Step 6: Bramka BUILD (Turbopack) — KLUCZOWA**

Run: `npm run build`
Expected: build przechodzi bez błędów SSR/hydration dla `RichTextEditor`.
> To jest właściwa bramka zależności. Jeśli build wywala się na TipTap (ESM/SSR/Turbopack) mimo `immediatelyRender:false` — spróbuj importu przez `next/dynamic` z `ssr:false` w miejscu UŻYCIA (Task 5/6). Jeśli dalej nie działa → zatrzymaj się i zgłoś (kandydat na fallback zero-dep).

- [ ] **Step 7: Ręczny smoke (dev)**

Run: `npm run dev`, otwórz dowolny produkt w `/admin/produkty/[id]`. (Edytor nie jest jeszcze wpięty — możesz tymczasowo wyrenderować go w `ProductEditor` lub zweryfikować mount w izolacji.) Potwierdź: brak błędów w konsoli, pasek i obszar edycji się renderują, klik B/lista zmienia tekst.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json app/admin/produkty/[id]/RichTextEditor.tsx app/globals.css
git commit -m "feat(produkty): komponent RichTextEditor (TipTap WYSIWYG) + styl"
```

---

### Task 5: Wpięcie w 2 pola PL (`DescriptionSectionsEditor`)

Zamiana 2 `<textarea>` na `RichTextEditor`: treść własnej sekcji (`body`) i nadpisanie sekcji z BL (`admin_body`).

**Files:**
- Modify: `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx`

**Interfaces:**
- Consumes: `RichTextEditor` (z `./RichTextEditor`), istniejące callbacki `onBodyChange`/`onAdminBodyChange` (oba `(v: string) => void`).
- Produces: nic nowego.

- [ ] **Step 1: Import**

Na górze `DescriptionSectionsEditor.tsx` dodaj:
```ts
import RichTextEditor from "./RichTextEditor";
```

- [ ] **Step 2: `CustomTextSectionRow` — pole `body`**

Zamień `<textarea>` treści (obecnie ~linie 540–546) na:
```tsx
        <RichTextEditor
          value={section.body}
          onChange={onBodyChange}
          ariaLabel="Treść własnej sekcji opisu"
          placeholder="Napisz opis — użyj paska do pogrubień, list i nagłówków."
        />
```
Usuń `font-mono` placeholder-mindset. (Pozostałe pola sekcji bez zmian.)

- [ ] **Step 3: `TextSectionRow` (override) — pole `admin_body`**

Zamień `<textarea>` override'u treści (obecnie ~linie 412–419) na:
```tsx
            <RichTextEditor
              value={section.admin_body ?? ""}
              onChange={onAdminBodyChange}
              ariaLabel="Nadpisz treść sekcji"
              placeholder={section.body.slice(0, 80) || "Wpisz treść, by nadpisać import z BL"}
            />
```
Zmień też etykietę nad polem z „…HTML dozwolony." na „Nadpisz treść (zostaw puste = z BL)." (usuń wzmiankę o HTML).

> Uwaga: `onAdminBodyChange` w rodzicu robi już `v.trim() === "" ? undefined : v` (linia ~186) — a `RichTextEditor` oddaje `""` dla pustej treści (Task 1). Czyli pusty edytor → `admin_body = undefined` → „brak override". Zachowanie spójne, bez zmian w rodzicu.

- [ ] **Step 4: Bramki**

Run: `npx tsc --noEmit` → 0.
Run: `npm run lint` → 0.

- [ ] **Step 5: Ręczny smoke**

`npm run dev` → produkt → „+ Własna sekcja": wpisz listę myślnikami przez pasek (• Lista), zapisz „Zapisz sekcje", wejdź na `/produkt/[id]` → lista renderuje się jako punkty (NIE jedna linia). Edytuj override sekcji z BL → puste pole = znika znacznik „(treść override)".

- [ ] **Step 6: Commit**

```bash
git add app/admin/produkty/[id]/DescriptionSectionsEditor.tsx
git commit -m "feat(produkty): edytor WYSIWYG w sekcjach opisu PL (custom + override)"
```

---

### Task 6: Wpięcie w pole DE (`TranslationEditor`)

Zamiana `<textarea>` treści DE w `TextSectionTranslator` na `RichTextEditor`.

**Files:**
- Modify: `app/admin/produkty/[id]/TranslationEditor.tsx`

**Interfaces:**
- Consumes: `RichTextEditor` (z `./RichTextEditor`), callback `onBodyChange: (v: string) => void`.
- Produces: nic nowego.

- [ ] **Step 1: Import**

Na górze `TranslationEditor.tsx` dodaj:
```ts
import RichTextEditor from "./RichTextEditor";
```

- [ ] **Step 2: Zamień pole „Treść (DE)"**

W `TextSectionTranslator` zamień blok `<Field label="Treść (DE)"…><textarea…/></Field>` (obecnie ~linie 357–365) na:
```tsx
        <Field label="Treść (DE)" hint="Formatuj paskiem — jak w polskiej treści.">
          <RichTextEditor
            value={de.body}
            onChange={onBodyChange}
            ariaLabel="Niemiecka treść sekcji"
            placeholder="Niemiecka treść sekcji"
          />
        </Field>
```

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit` → 0.
Run: `npm run lint` → 0.

- [ ] **Step 4: Ręczny smoke**

`npm run dev` → produkt z sekcjami → sekcja Tłumaczenie DE: sformatuj treść DE przez pasek, „Zapisz tłumaczenie DE", wejdź na `/de/produkt/[id]` → formatowanie DE renderuje się poprawnie.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/[id]/TranslationEditor.tsx
git commit -m "feat(produkty): edytor WYSIWYG w tlumaczeniu sekcji DE"
```

---

### Task 7: Pełne bramki jakości + smoke końcowy

**Files:** brak zmian kodu (chyba że bramki coś wykażą).

- [ ] **Step 1: Pełny zestaw bramek**

```bash
npx tsc --noEmit      # 0 błędów
npm run lint          # 0 błędów
npm test              # vitest — wszystko zielone (w tym rich-text + product-html)
npm run build         # Turbopack przechodzi
```
Expected: wszystkie cztery zielone. Napraw, co wyjdzie, i powtórz.

- [ ] **Step 2: Smoke end-to-end (ręcznie)**

Lista do odhaczenia w `npm run dev`:
- [ ] Nowa własna sekcja PL: lista punktowana + nagłówek + pogrubienie + link → na `/produkt/[id]` renderuje się poprawnie (lista jako punkty, nie jedna linia).
- [ ] Override sekcji z BL: edycja przez edytor, puste pole = znika „(treść override)".
- [ ] Sekcja DE: formatowanie zapisuje się i renderuje na `/de/produkt/[id]`.
- [ ] Stary opis wpisany kiedyś „myślnikami" otwiera się jako jeden akapit (zgodnie ze specem — bez auto-migracji), da się go przeformatować.
- [ ] Wklejenie tekstu z Worda → po „✕ Wyczyść" zostaje czysty tekst; po zapisie render OK (sanitizer dobija).

- [ ] **Step 3: Commit (jeśli bramki coś poprawiły)**

```bash
git add -A
git commit -m "chore(produkty): domkniecie bramek jakosci edytora WYSIWYG"
```

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:** cel (T4–T6 wpięcie), 3 punkty integracji (T5×2 + T6), `RichTextEditor`+`normalizeEditorHtml` (T1, T4), sanitize-on-save (T3), brak migracji/zmian renderu (Global Constraints + T3 zachowuje format), nagłówki H2+H3 (T4 `levels:[2,3]`, pasek), testy helperów + parytet (T1–T3), bramka TipTap/React19/Next16 (T4 Step 1+6), formularz „Nowy produkt" poza zakresem (nie tknięty). Wszystko pokryte.

**Placeholder scan:** brak TBD/„handle errors"/„similar to". Każdy krok ma realny kod/komendę. Numery linii oznaczone `~` (przesuwają się) z kotwicami kontekstowymi.

**Type consistency:** `normalizeEditorHtml(string):string`, `sanitizeSectionsHtml(ProductDescriptionSection[]):ProductDescriptionSection[]`, `RichTextEditorProps {value,onChange,ariaLabel,placeholder?}` — spójne między taskami i miejscami użycia. Callbacki `onBodyChange/onAdminBodyChange` to `(v:string)=>void` w obu rodzicach.
