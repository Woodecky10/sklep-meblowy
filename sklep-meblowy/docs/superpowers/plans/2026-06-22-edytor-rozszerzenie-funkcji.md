# Rozszerzenie funkcji edytora WYSIWYG — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dodać do edytora opisów undo/redo, podkreślenie/przekreślenie/cytat/H4, wyrównanie + kolor tekstu i obraz w treści — bez osłabiania bezpieczeństwa renderu.

**Architecture:** Reuse `RichTextEditor` (TipTap). Rdzeń to wąska, walidowana zmiana sanitizera (`product-html.ts`): nowe tagi + dopuszczenie atrybutu `style` tylko dla `text-align`/`color`. Potem rozszerzenia TipTap + przyciski paska, upload obrazu przez istniejącą akcję, i CSS renderu.

**Tech Stack:** Next.js 16.2.4, React 19.2.4, TipTap 3.x (StarterKit + extension-underline/-text-align/-text-style/-color/-highlight/-image), TypeScript, Vitest (node), Tailwind v4.

**Spec:** `docs/superpowers/specs/2026-06-22-edytor-rozszerzenie-funkcji-design.md`

## Global Constraints

- **Sanitizer wąsko:** dopuszczamy atrybut `style` TYLKO `text-align` (na `p/h2/h3/h4`, wartości `left|center|right|justify`) i `color` (na `span`, bezpieczna wartość). Twardo odrzucać `url(`, `expression`, `/*`, `*/`, `\`, `<`, `>`, `{`, `}`, `;`-injection. Nowe tagi: `u, s, blockquote, mark, img`. `img` atrybuty `src` (przez istniejący `hasSafeUrlScheme`) + `alt`. Element `<style>` NADAL wycinany (`DANGEROUS_BLOCK_TAGS`).
- **Highlight = zwykły `<mark>`** (kolor z CSS, BEZ inline `background`).
- **Obraz:** reuse `uploadProductImage` (akcja) + `compressIfNeeded` (`_shared`). Bez `data:`/base64.
- **Render storefront bez zmian strukturalnych** — tylko sanitizer przepuszcza więcej.
- **Reuse wzorców `RichTextEditor`:** `immediatelyRender:false`, `normalizeEditorHtml` w `onUpdate`, value-sync `useEffect`, placeholder, klasa `product-description`.
- **TipTap 3.x:** część rozszerzeń może być bundlowana w StarterKit (jak Link/Underline) — przy instalacji ZWERYFIKOWAĆ względem zainstalowanych typów i dostosować (nie duplikować rozszerzeń).
- Bez migracji bazy. Panel admina PL-only; komentarze PL. Format = HTML string.
- Testy = czyste funkcje (vitest node). Komponentu/uploadu NIE testować jednostkowo — weryfikacja `tsc`/`lint`/`build` + smoke ręczny.

## File Structure

- **Modify** `app/_lib/product-html.ts` — nowe tagi, `img`/`style` w `ALLOWED_ATTRS_PER_TAG`, nowa czysta funkcja `sanitizeStyleAttr` + wpięcie w pętlę atrybutów.
- **Modify** `app/_lib/__tests__/product-html.test.ts` — pozytywne + adwersarskie testy nowych dopuszczeń.
- **Modify** `app/admin/produkty/[id]/RichTextEditor.tsx` — rozszerzenia TipTap + przyciski paska (grupowane) + upload obrazu.
- **Modify** `app/globals.css` — style `.product-description` dla `u/s/blockquote/mark/img`.
- **Modify** `package.json` — zależności TipTap (przez `npm install`).

Kolejność wg ryzyka: sanitizer+testy (gate) → rozszerzenia+pasek+CSS (bez obrazu) → obraz → bramki.

---

### Task 1: Sanitizer — nowe tagi + `img` + `sanitizeStyleAttr` (+ testy adwersarskie)

To rdzeń bezpieczeństwa. Czyste funkcje, TDD.

**Files:**
- Modify: `app/_lib/product-html.ts`
- Test: `app/_lib/__tests__/product-html.test.ts`

**Interfaces:**
- Consumes: istniejące `hasSafeUrlScheme`, `escapeHtmlAttr`, `ALLOWED_TAGS`, `ALLOWED_ATTRS_PER_TAG`.
- Produces: `sanitizeStyleAttr(tag: string, raw: string): string` (eksport) — zwraca oczyszczony `style` (np. `"text-align: center"`) lub `""`. Sanitizer przepuszcza `u/s/blockquote/mark/img` + wąski `style`.

- [ ] **Step 1: Dopisz failing testy do `product-html.test.ts`**

```ts
import { sanitizeStyleAttr } from "@/app/_lib/product-html";

describe("sanitizeStyleAttr — waska whitelista CSS", () => {
  it("text-align dozwolone na p", () => {
    expect(sanitizeStyleAttr("p", "text-align: center")).toBe("text-align: center");
  });
  it("color dozwolony na span", () => {
    expect(sanitizeStyleAttr("span", "color: #c00")).toBe("color: #c00");
  });
  it("wycina niedozwolona property, zostawia text-align", () => {
    expect(sanitizeStyleAttr("p", "text-align:center; background:url(x)")).toBe("text-align: center");
  });
  it("odrzuca color z expression", () => {
    expect(sanitizeStyleAttr("span", "color: expression(alert(1))")).toBe("");
  });
  it("odrzuca color z url()", () => {
    expect(sanitizeStyleAttr("span", "color: url(javascript:1)")).toBe("");
  });
  it("text-align spoza enuma odrzucony", () => {
    expect(sanitizeStyleAttr("p", "text-align: end")).toBe("");
  });
  it("color na p (niedozwolone na bloku) wyciety", () => {
    expect(sanitizeStyleAttr("p", "color: red")).toBe("");
  });
  it("nieznany tag -> pusto", () => {
    expect(sanitizeStyleAttr("div", "text-align: center")).toBe("");
  });
});

describe("sanitizeProductHtml — nowe tagi i style", () => {
  it("przepuszcza u/s/blockquote/mark", () => {
    const html = "<p><u>a</u> <s>b</s> <mark>c</mark></p><blockquote>d</blockquote>";
    expect(sanitizeProductHtml(html)).toBe(html);
  });
  it("przepuszcza wyrownanie i kolor", () => {
    const html = '<p style="text-align: center">x</p><p><span style="color: #c00">y</span></p>';
    expect(sanitizeProductHtml(html)).toBe(html);
  });
  it("przepuszcza img z bezpiecznym src", () => {
    expect(sanitizeProductHtml('<img src="https://x/y.jpg" alt="Sofa" />')).toContain('src="https://x/y.jpg"');
  });
  it("wycina onerror z img", () => {
    const out = sanitizeProductHtml('<img src="https://x/y.jpg" onerror="alert(1)" />');
    expect(out.toLowerCase()).not.toContain("onerror");
  });
  it("odrzuca img z javascript: src", () => {
    const out = sanitizeProductHtml('<img src="javascript:alert(1)" />');
    expect(out.toLowerCase()).not.toContain("javascript:");
  });
  it("czysci niebezpieczny style zostawiajac text-align", () => {
    const out = sanitizeProductHtml('<p style="text-align:center; background:url(x)">x</p>');
    expect(out).toContain("text-align: center");
    expect(out.toLowerCase()).not.toContain("url(");
  });
});
```

- [ ] **Step 2: Uruchom — FAIL**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: FAIL (`sanitizeStyleAttr` nie istnieje + nowe tagi wycinane).

- [ ] **Step 3: Rozszerz `product-html.ts`**

W `ALLOWED_TAGS` dodaj `"u", "s", "blockquote", "mark", "img"`.

Zamień `ALLOWED_ATTRS_PER_TAG` na:
```ts
const ALLOWED_ATTRS_PER_TAG: Record<string, Set<string>> = {
  a: new Set(["href", "target", "rel"]),
  img: new Set(["src", "alt"]),
  p: new Set(["style"]),
  h2: new Set(["style"]),
  h3: new Set(["style"]),
  h4: new Set(["style"]),
  span: new Set(["style"]),
};
```

Dodaj (przed `sanitizeProductHtml`) wąski filtr CSS:
```ts
// Wlasciwosci CSS dozwolone per tag — reszta wycinana.
const ALLOWED_STYLE_PROPS: Record<string, Set<string>> = {
  p: new Set(["text-align"]),
  h2: new Set(["text-align"]),
  h3: new Set(["text-align"]),
  h4: new Set(["text-align"]),
  span: new Set(["color"]),
};
const TEXT_ALIGN_VALUES = new Set(["left", "center", "right", "justify"]);

// Bezpieczna wartosc koloru: hex / rgb()/rgba() / nazwa CSS. Twardo odrzuca
// konstrukcje mogace wstrzyknac kod (url, expression, komentarze, nawiasy klamrowe).
function isSafeColorValue(v: string): boolean {
  const s = v.trim().toLowerCase();
  if (/[<>;{}\\]/.test(s)) return false;
  if (s.includes("url(") || s.includes("expression") || s.includes("/*") || s.includes("*/")) return false;
  if (/^#[0-9a-f]{3,8}$/.test(s)) return true;
  if (/^rgba?\([0-9.,%\s]+\)$/.test(s)) return true;
  if (/^[a-z]+$/.test(s)) return true; // nazwa CSS np. "red"
  return false;
}

// Przepuszcza WYLACZNIE bezpieczne deklaracje CSS dla danego tagu.
export function sanitizeStyleAttr(tag: string, raw: string): string {
  const allowed = ALLOWED_STYLE_PROPS[tag];
  if (!allowed) return "";
  const out: string[] = [];
  for (const decl of raw.split(";")) {
    const idx = decl.indexOf(":");
    if (idx === -1) continue;
    const prop = decl.slice(0, idx).trim().toLowerCase();
    const value = decl.slice(idx + 1).trim();
    if (!allowed.has(prop)) continue;
    if (prop === "text-align") {
      if (TEXT_ALIGN_VALUES.has(value.toLowerCase())) out.push(`text-align: ${value.toLowerCase()}`);
    } else if (prop === "color") {
      if (isSafeColorValue(value)) out.push(`color: ${value}`);
    }
  }
  return out.join("; ");
}
```

W pętli atrybutów w `sanitizeProductHtml` (tam gdzie jest `if (!allowedAttrs.has(attrName)) continue;` i sprawdzenie schematu href/src), dodaj obsługę `style` PRZED pushem atrybutu — wstaw zaraz po sprawdzeniu schematu URL:
```ts
        if (attrName === "style") {
          const cleanStyle = sanitizeStyleAttr(tag, attrValue);
          if (cleanStyle) cleanAttrs.push(`style="${escapeHtmlAttr(cleanStyle)}"`);
          continue;
        }
```

- [ ] **Step 4: Uruchom — PASS**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: PASS (nowe + WSZYSTKIE istniejące testy XSS nadal zielone).

- [ ] **Step 5: Commit**

```bash
git add app/_lib/product-html.ts app/_lib/__tests__/product-html.test.ts
git commit -m "feat(produkty): sanitizer dopuszcza u/s/blockquote/mark/img + waski style (text-align/color)"
```

---

### Task 2: Rozszerzenia TipTap + pasek (bez obrazu) + CSS renderu

**Files:**
- Modify: `package.json` (przez `npm install`)
- Modify: `app/admin/produkty/[id]/RichTextEditor.tsx`
- Modify: `app/globals.css`

**Interfaces:**
- Consumes: `normalizeEditorHtml` (bez zmian), sanitizer z Taska 1 (przepuszcza nowe tagi/style).
- Produces: rozbudowany pasek (undo/redo, U, S, blockquote→przez cytat? patrz niżej, H4, wyrównanie, kolor, marker). Image dochodzi w Tasku 3.

- [ ] **Step 1: Instalacja rozszerzeń**

```bash
npm install @tiptap/extension-underline @tiptap/extension-text-align @tiptap/extension-text-style @tiptap/extension-color @tiptap/extension-highlight @tiptap/extension-image
```
> Jeśli npm zgłosi konflikt peer-deps z React 19 → STOP, BLOCKED. Część (np. Underline, TextStyle) **może być już w StarterKit 3.x** — jeśli build/tsc ostrzega o duplikacie rozszerzenia, skonfiguruj je przez StarterKit zamiast osobnego importu i USUŃ duplikat. `@tiptap/extension-color` zależy od TextStyle (w v3 Color bywa eksportowany z `@tiptap/extension-text-style` — zaimportuj z tego, co daje zainstalowana wersja; zweryfikuj w `node_modules/@tiptap/extension-text-style`). `@tiptap/extension-image` użyjesz dopiero w Tasku 3 — zainstaluj teraz, importuj w T3.

- [ ] **Step 2: Rozszerzenia w `useEditor`**

Dodaj importy na górze (dostosuj wg uwagi ze Step 1):
```ts
import Underline from "@tiptap/extension-underline";
import TextAlign from "@tiptap/extension-text-align";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import Highlight from "@tiptap/extension-highlight";
```
W `StarterKit.configure({...})` zmień: `strike: false` → usuń (włącz), `blockquote: false` → usuń (włącz), `heading: { levels: [2, 3] }` → `heading: { levels: [2, 3, 4] }`. (codeBlock/horizontalRule/code zostają wyłączone.)
Do tablicy `extensions` (po StarterKit) dodaj:
```ts
      Underline,
      TextAlign.configure({ types: ["heading", "paragraph"], alignments: ["left", "center", "right", "justify"] }),
      TextStyle,
      Color,
      Highlight, // bez multicolor -> zwykly <mark>
```

- [ ] **Step 3: Pasek — grupowanie + nowe przyciski (bez obrazu)**

Stała palety kolorów (nad komponentem):
```ts
// Stala paleta kolorow tekstu (UI ogranicza wybor; sanitizer i tak waliduje wartosc).
const TEXT_COLORS = ["#1f2937", "#b91c1c", "#15803d", "#1d4ed8", "#b45309", "#7c3aed"];
```
Zamień JSX paska narzędzi na pogrupowany (separatory `|` to `<span className="w-px h-5 bg-[var(--border)] mx-1" />`). Użyj istniejącego helpera `btn(active)`. Pełny pasek (bez obrazu — dochodzi w T3 w grupie link/media):
```tsx
      <div className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-[var(--border)] bg-[var(--card-bg)]">
        <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive("bold"))} aria-label="Pogrubienie"><strong>B</strong></button>
        <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive("italic"))} aria-label="Kursywa"><em>I</em></button>
        <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()} className={btn(editor.isActive("underline"))} aria-label="Podkreślenie"><u>U</u></button>
        <button type="button" onClick={() => editor.chain().focus().toggleStrike().run()} className={btn(editor.isActive("strike"))} aria-label="Przekreślenie"><s>S</s></button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive("bulletList"))} aria-label="Lista punktowana">• Lista</button>
        <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive("orderedList"))} aria-label="Lista numerowana">1. Lista</button>
        <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()} className={btn(editor.isActive("blockquote"))} aria-label="Cytat">❝</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive("heading", { level: 2 }))} aria-label="Nagłówek H2">H2</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} className={btn(editor.isActive("heading", { level: 3 }))} aria-label="Nagłówek H3">H3</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 4 }).run()} className={btn(editor.isActive("heading", { level: 4 }))} aria-label="Nagłówek H4">H4</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("left").run()} className={btn(editor.isActive({ textAlign: "left" }))} aria-label="Do lewej">⯇</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("center").run()} className={btn(editor.isActive({ textAlign: "center" }))} aria-label="Wyśrodkuj">≡</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("right").run()} className={btn(editor.isActive({ textAlign: "right" }))} aria-label="Do prawej">⯈</button>
        <button type="button" onClick={() => editor.chain().focus().setTextAlign("justify").run()} className={btn(editor.isActive({ textAlign: "justify" }))} aria-label="Wyjustuj">≣</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        {TEXT_COLORS.map((col) => (
          <button key={col} type="button" onClick={() => editor.chain().focus().setColor(col).run()} aria-label={"Kolor " + col} title={"Kolor " + col} className="w-5 h-5 rounded-full border border-[var(--border)]" style={{ backgroundColor: col }} />
        ))}
        <button type="button" onClick={() => editor.chain().focus().unsetColor().run()} className={btn(false)} aria-label="Domyślny kolor">A</button>
        <button type="button" onClick={() => editor.chain().focus().toggleHighlight().run()} className={btn(editor.isActive("highlight"))} aria-label="Wyróżnienie">🖍</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} aria-label="Wstaw link">🔗</button>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
        <button type="button" onClick={() => editor.chain().focus().undo().run()} className={btn(false)} aria-label="Cofnij">↶</button>
        <button type="button" onClick={() => editor.chain().focus().redo().run()} className={btn(false)} aria-label="Ponów">↷</button>
        <button type="button" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className={btn(false)} aria-label="Wyczyść formatowanie">✕</button>
      </div>
```

- [ ] **Step 4: CSS renderu**

W `app/globals.css`, w bloku `.product-description`, dodaj:
```css
.product-description u { text-decoration: underline; }
.product-description s { text-decoration: line-through; }
.product-description mark { background: var(--color-gold); color: inherit; padding: 0 0.15em; border-radius: 2px; }
.product-description blockquote {
  border-left: 3px solid var(--color-gold);
  padding-left: 1rem;
  margin: 1rem 0;
  font-style: italic;
  color: var(--muted);
}
.product-description img { max-width: 100%; height: auto; border-radius: 8px; margin: 1rem 0; }
```

- [ ] **Step 5: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi (Turbopack; kilka minut).
> Jeśli tsc/build wykryje duplikat rozszerzenia (np. Underline/TextStyle już w StarterKit) — patrz uwaga Step 1: skonfiguruj przez StarterKit, usuń duplikat.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json app/admin/produkty/[id]/RichTextEditor.tsx app/globals.css
git commit -m "feat(produkty): pasek edytora — undo/redo, U/S, cytat, H4, wyrownanie, kolor, marker + CSS"
```

---

### Task 3: Obraz w treści (Image + upload)

**Files:**
- Modify: `app/admin/produkty/[id]/RichTextEditor.tsx`

**Interfaces:**
- Consumes: `uploadProductImage` (`../actions`), `compressIfNeeded` (`./_shared`), Image extension.
- Produces: przycisk „🖼" w pasku + handler uploadu wstawiający `<img>`.

- [ ] **Step 1: Dodaj Image do rozszerzeń**

Import:
```ts
import Image from "@tiptap/extension-image";
```
Do `extensions` dodaj:
```ts
      Image.configure({ inline: false, allowBase64: false }),
```

- [ ] **Step 2: Handler uploadu + stan**

Dodaj importy:
```ts
import { useRef, useState } from "react";
import { uploadProductImage } from "../actions";
import { compressIfNeeded } from "./_shared";
```
(`useRef`/`useState` dołącz do istniejącego importu z `react` jeśli trzeba.)

W komponencie (po `const editor = ...`):
```ts
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploadingImg, setUploadingImg] = useState(false);

  async function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    setUploadingImg(true);
    try {
      const compressed = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("image", compressed, compressed.name);
      const res = await uploadProductImage(fd);
      if (!res.ok) { window.alert("Upload nieudany: " + res.error); return; }
      const url = (res.data as { url: string } | undefined)?.url;
      if (!url) { window.alert("Brak URL po uploadzie"); return; }
      editor.chain().focus().setImage({ src: url, alt: "" }).run();
    } finally {
      setUploadingImg(false);
    }
  }
```

- [ ] **Step 3: Przycisk + ukryty input w pasku**

W grupie link/media (obok przycisku 🔗) dodaj:
```tsx
        <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingImg} className={btn(false)} aria-label="Wstaw obraz">{uploadingImg ? "…" : "🖼"}</button>
        <input ref={fileRef} type="file" accept="image/*" onChange={handleInsertImage} className="hidden" />
```

- [ ] **Step 4: Bramki**

Run: `npx tsc --noEmit` → 0. `npm run lint` → 0. `npm run build` → przechodzi.

- [ ] **Step 5: Commit**

```bash
git add app/admin/produkty/[id]/RichTextEditor.tsx
git commit -m "feat(produkty): wstawianie obrazu w tresc edytora (upload przez uploadProductImage)"
```

---

### Task 4: Pełne bramki + smoke końcowy

**Files:** brak zmian (chyba że bramki coś wykażą).

- [ ] **Step 1: Pełny zestaw bramek**

```bash
npx tsc --noEmit      # 0
npm run lint          # 0
npm test              # vitest — zielony (w tym rozbudowane testy sanitizera)
npm run build         # Turbopack przechodzi
```

- [ ] **Step 2: Smoke end-to-end (`npm run dev`, na `/admin/produkty/[id]`)**

- [ ] Każdy nowy przycisk działa: U, S, cytat, H4, wyrównanie (4), kolor (paleta + „A"), marker, undo/redo, obraz (upload + wstawienie).
- [ ] Zapis („Zapisz opis" / „Zapisz sekcje" / „Zapisz tłumaczenie DE") → `/produkt/[id]`: wyrównanie/kolor/cytat/marker/obraz renderują się poprawnie.
- [ ] Render po sanitizerze: kolor i text-align zachowane; `<img>` skalowany (max-width); brak wycieków (style ograniczony do text-align/color).
- [ ] `/de/produkt/[id]` — analogicznie dla opisu DE.

- [ ] **Step 3: Commit (jeśli bramki coś poprawiły)**

```bash
git add -A
git commit -m "chore(produkty): domkniecie bramek rozszerzonego edytora"
```

---

## Self-Review (wykonane przy pisaniu planu)

**Spec coverage:** undo/redo (T2 pasek), U/S/cytat/H4 (T2 + StarterKit enable + whitelist T1), wyrównanie+kolor (T2 + sanitizer style T1), highlight=`<mark>` (T2 Highlight bez multicolor + CSS), obraz (T3 + sanitizer img T1), wąski `style` z walidacją (T1 `sanitizeStyleAttr`), nowe tagi (T1), render bez zmian strukturalnych (Global Constraints), CSS (T2 Step 4 + T2 dla img? — img CSS jest w T2 Step 4, używany od T3), testy adwersarskie (T1), bramki+smoke (T4). Wszystko pokryte.

**Placeholder scan:** brak TBD/„handle errors"/„similar to". Każdy krok ma realny kod/komendę. Uwagi wersji TipTap (bundling) opisane konkretnie z instrukcją weryfikacji (jak w poprzednim slice z Link).

**Type consistency:** `sanitizeStyleAttr(tag: string, raw: string): string` spójne (T1 definicja, użycie w pętli T1). `ALLOWED_STYLE_PROPS`/`TEXT_ALIGN_VALUES`/`isSafeColorValue` spójne. `TEXT_COLORS` w T2. Handler `handleInsertImage` + `fileRef`/`uploadingImg` spójne w T3. `uploadProductImage` zwraca `{ ok, data:{url} }` (zgodnie z actions.ts). Komendy edytora (`toggleUnderline`/`toggleStrike`/`toggleBlockquote`/`setTextAlign`/`setColor`/`unsetColor`/`toggleHighlight`/`setImage`/`undo`/`redo`) — standardowe API TipTap; build to zweryfikuje.
