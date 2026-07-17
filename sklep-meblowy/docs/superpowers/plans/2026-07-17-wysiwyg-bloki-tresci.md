# Edytor WYSIWYG + układy w blokach treści (Etap 1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloki treści (podstrony + strona główna) dostają edytor WYSIWYG dla tekstu, nowy blok „Tekst", wyrównanie/kolumny podpisów w galerii oraz pozycje zdjęcia w banerze — z reużyciem istniejącego edytora TipTap i sanitizera HTML.

**Architecture:** Uogólniamy istniejący `RichTextEditor` (TipTap 3.x) do wspólnego modułu z propem `enableImage`/`uploadImage`, a `sanitizeProductHtml` udostępniamy jako `sanitizeRichHtml`. Logika bloków (`app/_lib/blocks.ts`) zyskuje typ `text`, pola galerii (`caption_align`, `columns`) i rozszerzony `banner.layout` (+ `body` jako HTML). Render i formularze admina podłączają te pola. Treść HTML jest sanityzowana przy zapisie i renderze.

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, TypeScript, Tailwind v4, TipTap 3.x (`@tiptap/react`, `@tiptap/starter-kit`, extensions już w repo), Vitest (testy logiki `_lib`), Playwright (weryfikacja UI).

## Global Constraints

- Next.js 16 — TipTap w SSR wymaga `immediatelyRender: false` (już ustawione w istniejącym edytorze; nie zmieniać).
- `images.unoptimized: true` (next.config) — render bloków używa zwykłego `<img loading="lazy">`, NIE `next/image`. Zgodne z obecnym `GalleryBlock`/`BannerBlock`.
- Panel admina jest PL-only w UI; treść jest dwujęzyczna: każde pole tekstowe ma parę `pole` (PL) + `pole_de` (DE), fallback PL na `/de` (idiom `pickLoc`, NIE `??` na całości).
- HTML z edytora ZAWSZE sanityzowany whitelistą (`sanitizeRichHtml`) przy zapisie (server action) i przy renderze (defense-in-depth). Whitelist: `p,br,ul,ol,li,strong,em,b,i,a,h2,h3,h4,span,u,s,blockquote,mark,img` + style `text-align/color/font-family`, schematy URL `http(s)/mailto/tel`.
- Puste pola nie zaśmiecają jsonb (idiom `validateBlockContent`: klucz pomijany gdy pusty).
- `MAX_RICH = 20000` znaków HTML (po sanityzacji) dla `text.body` i `banner.body`.
- Kolejność kroków w każdym tasku kończy się commitem. Commity małe i częste.
- Uruchamianie z katalogu projektu: `cd sklep-meblowy/sklep-meblowy`. Testy: `npx vitest run <plik>`. Typy: `npx tsc --noEmit`. Lint: `npx eslint <pliki>`.

---

## Task 1: Udostępnić sanitizer jako `sanitizeRichHtml`

**Files:**
- Modify: `sklep-meblowy/app/_lib/product-html.ts` (dodać alias eksportu)
- Test: `sklep-meblowy/app/_lib/__tests__/product-html.test.ts` (dodać 1 test aliasu)

**Interfaces:**
- Produces: `sanitizeRichHtml(html: string | null | undefined): string` — identyczne zachowanie jak `sanitizeProductHtml` (ta sama whitelist). Reużywane przez `blocks.ts` (Task 2/4) i formularze.

- [ ] **Step 1: Dodać test aliasu (failing)**

W `product-html.test.ts` dodaj na końcu:

```ts
import { sanitizeRichHtml } from "@/app/_lib/product-html";

describe("sanitizeRichHtml (alias wspoldzielony)", () => {
  it("zachowuje sie jak sanitizeProductHtml — wycina script, zostawia p", () => {
    expect(sanitizeRichHtml("<p>ok</p><script>alert(1)</script>")).toBe("<p>ok</p>");
  });
  it("null/undefined -> pusty string", () => {
    expect(sanitizeRichHtml(null)).toBe("");
    expect(sanitizeRichHtml(undefined)).toBe("");
  });
});
```

- [ ] **Step 2: Uruchom test — ma nie przejść (brak eksportu)**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: FAIL — `sanitizeRichHtml` is not exported.

- [ ] **Step 3: Dodać alias w `product-html.ts`**

Na końcu pliku `app/_lib/product-html.ts` dodaj:

```ts
// Alias współdzielony: ten sam sanitizer używany przez bloki treści (strony)
// i inne miejsca poza produktami. Zachowanie identyczne — jedna whitelist.
export const sanitizeRichHtml = sanitizeProductHtml;
```

- [ ] **Step 4: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: PASS (wszystkie, w tym nowe).

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_lib/product-html.ts sklep-meblowy/app/_lib/__tests__/product-html.test.ts
git commit -m "feat(rich-text): udostepnij sanitizeRichHtml jako wspolny alias"
```

---

## Task 2: Nowy typ bloku `text` w logice (blocks.ts)

**Files:**
- Modify: `sklep-meblowy/app/_lib/blocks.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: `sanitizeRichHtml` (Task 1).
- Produces:
  - `CONTENT_BLOCK_TYPES` zawiera `"text"`.
  - `type LocalizedTextContent = { body: string | null }` (HTML lub null).
  - `LocalizedContentBlock` union zawiera `{ type: "text"; content: LocalizedTextContent }`.
  - `localizeBlock` obsługuje `text`; `validateBlockContent("text", raw)` sanityzuje `body`/`body_de` przez `sanitizeRichHtml`, cap `MAX_RICH`.

- [ ] **Step 1: Testy dla `text` (failing)**

W `blocks.test.ts` dodaj:

```ts
describe("blok text", () => {
  it("jest typem tresciowym z wpisem w rejestrze", () => {
    expect(isContentBlockType("text")).toBe(true);
    expect(CONTENT_BLOCK_DEFS.text.name.length).toBeGreaterThan(0);
    expect(CONTENT_BLOCK_DEFS.text.defaultContent()).toEqual({ body: "" });
  });
  it("localizeBlock: body PL, DE per-locale z fallbackiem", () => {
    const r = row({ block_type: "text", content: { body: "<p>PL</p>", body_de: "<p>DE</p>" } });
    expect(localizeBlock(r, "pl")).toMatchObject({ type: "text", content: { body: "<p>PL</p>" } });
    expect(localizeBlock(r, "de")).toMatchObject({ type: "text", content: { body: "<p>DE</p>" } });
    const noDe = row({ block_type: "text", content: { body: "<p>PL</p>" } });
    expect(localizeBlock(noDe, "de")).toMatchObject({ content: { body: "<p>PL</p>" } });
  });
  it("localizeBlock: sanityzuje HTML z DB (script wyciety)", () => {
    const r = row({ block_type: "text", content: { body: "<p>ok</p><script>x</script>" } });
    const b = localizeBlock(r, "pl")!;
    if (b.type === "text") expect(b.content.body).toBe("<p>ok</p>");
  });
  it("validateBlockContent: wymaga tresci; sanityzuje; puste DE pomijane", () => {
    expect(validateBlockContent("text", { body: "   " }).ok).toBe(false);
    const ok = validateBlockContent("text", { body: "<p>Cze<script>x</script>sc</p>", body_de: "" });
    expect(ok.ok).toBe(true);
    if (ok.ok) {
      expect(ok.content.body).toBe("<p>Czesc</p>");
      expect(ok.content.body_de).toBeUndefined();
    }
  });
});
```

- [ ] **Step 2: Uruchom — ma nie przejść**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Expected: FAIL (typ `text` nieznany, brak wpisu w rejestrze).

- [ ] **Step 3: Dodać typ `text` do rejestru i unii**

W `app/_lib/blocks.ts`:

1. Import na górze (po istniejących importach):
```ts
import { sanitizeRichHtml } from "./product-html";
```

2. Dodaj `"text"` do `CONTENT_BLOCK_TYPES`:
```ts
export const CONTENT_BLOCK_TYPES = [
  "banner",
  "gallery",
  "products",
  "faq",
  "reviews",
  "text",
] as const;
```

3. Dodaj wpis do `CONTENT_BLOCK_DEFS` (w obiekcie):
```ts
  text: {
    name: "Tekst",
    description: "Sformatowany tekst (nagłówki, listy, pogrubienie, link, wyrównanie).",
    defaultContent: () => ({ body: "" }),
  },
```

4. Dodaj typ treści i wariant unii (obok `LocalizedGalleryContent` itd.):
```ts
export type LocalizedTextContent = {
  body: string | null;
};
```
oraz w `LocalizedContentBlock`:
```ts
  | { type: "text"; content: LocalizedTextContent }
```

- [ ] **Step 4: `localizeBlock` — case `text`**

W `switch (row.block_type)` w `localizeBlock` dodaj:
```ts
    case "text": {
      const bodyRaw = pickLoc(c, "body", locale);
      return {
        ...base,
        type: "text",
        content: { body: bodyRaw ? sanitizeRichHtml(bodyRaw) : null },
      };
    }
```

- [ ] **Step 5: `validateBlockContent` — case `text`**

Dodaj stałą blisko innych limitów (`MAX_LONG` itd.):
```ts
const MAX_RICH = 20000; // HTML pól WYSIWYG (text.body, banner.body)
```
Dodaj helper pod `cleanStr`:
```ts
// Sanityzuje HTML z edytora, obcina do max, zwraca undefined gdy pusto po
// wyczyszczeniu tagów (żeby pusty <p></p> nie liczył się jako treść).
function cleanRich(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const html = sanitizeRichHtml(v).slice(0, max);
  const textOnly = html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, "").trim();
  return textOnly.length > 0 ? html : undefined;
}
```
W `switch (type)` dodaj przed domknięciem:
```ts
    case "text": {
      const body = cleanRich(o.body, MAX_RICH);
      if (!body) return { ok: false, error: "Treść jest wymagana" };
      const bodyDe = cleanRich(o.body_de, MAX_RICH);
      return {
        ok: true,
        content: { body, ...(bodyDe ? { body_de: bodyDe } : {}) },
      };
    }
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: brak błędów (uwaga: `ContentBlock.tsx` switch może wymagać case `text` — jeśli tsc zgłosi brak pokrycia unii, zostanie dodany w Task 6; jeśli błąd blokuje, dodaj tymczasowo `case "text": return null;` i usuń w Task 6). Preferowane: przejść do Task 6 zaraz po tym tasku.

- [ ] **Step 8: Commit**

```bash
git add sklep-meblowy/app/_lib/blocks.ts sklep-meblowy/app/_lib/__tests__/blocks.test.ts
git commit -m "feat(blocks): typ bloku text (WYSIWYG) w logice + testy"
```

---

## Task 3: Galeria — `caption_align` i `columns` w logice

**Files:**
- Modify: `sklep-meblowy/app/_lib/blocks.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/blocks.test.ts`

**Interfaces:**
- Produces: `LocalizedGalleryContent` rozszerzony o `caption_align: "left"|"center"|"right"` (domyślnie `"center"`) i `columns: "2"|"3"|"masonry"` (domyślnie `"masonry"`). `validateBlockContent("gallery", …)` zapisuje te pola (waliduje wartości, śmieć → default).

- [ ] **Step 1: Testy (failing)**

W `blocks.test.ts` (sekcja gallery) dodaj:
```ts
it("gallery: caption_align/columns — defaulty i clamp", () => {
  const r = row({ block_type: "gallery", content: { images: [{ url: "https://x/a.jpg" }] } });
  const b = localizeBlock(r, "pl")!;
  if (b.type === "gallery") {
    expect(b.content.caption_align).toBe("center");
    expect(b.content.columns).toBe("masonry");
  }
  const r2 = row({ block_type: "gallery", content: { images: [{ url: "https://x/a.jpg" }], caption_align: "left", columns: "2" } });
  const b2 = localizeBlock(r2, "pl")!;
  if (b2.type === "gallery") {
    expect(b2.content.caption_align).toBe("left");
    expect(b2.content.columns).toBe("2");
  }
  const r3 = row({ block_type: "gallery", content: { images: [{ url: "https://x/a.jpg" }], caption_align: "zle", columns: "9" } });
  const b3 = localizeBlock(r3, "pl")!;
  if (b3.type === "gallery") {
    expect(b3.content.caption_align).toBe("center");
    expect(b3.content.columns).toBe("masonry");
  }
});
it("gallery validate: zapisuje caption_align/columns (default przy braku)", () => {
  const ok = validateBlockContent("gallery", { images: [{ url: "https://x/a.jpg" }] });
  expect(ok.ok).toBe(true);
  if (ok.ok) {
    expect(ok.content.caption_align).toBe("center");
    expect(ok.content.columns).toBe("masonry");
  }
});
```

- [ ] **Step 2: Uruchom — ma nie przejść**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Expected: FAIL (pola nieobecne).

- [ ] **Step 3: Rozszerzyć typ i helpery**

W `blocks.ts`:

1. Typ:
```ts
export type GalleryCaptionAlign = "left" | "center" | "right";
export type GalleryColumns = "2" | "3" | "masonry";
export type LocalizedGalleryContent = {
  heading: string | null;
  images: { url: string; alt: string | null }[];
  caption_align: GalleryCaptionAlign;
  columns: GalleryColumns;
};
```

2. Helpery (blisko `clampLimit`):
```ts
function galleryAlign(v: unknown): GalleryCaptionAlign {
  return v === "left" || v === "right" ? v : "center";
}
function galleryColumns(v: unknown): GalleryColumns {
  return v === "2" || v === "3" ? v : "masonry";
}
```

- [ ] **Step 4: `localizeBlock` case `gallery` — dodać pola**

Zmień zwracany obiekt case `gallery`:
```ts
      return {
        ...base,
        type: "gallery",
        content: {
          heading: pickLoc(c, "heading", locale),
          images,
          caption_align: galleryAlign(c.caption_align),
          columns: galleryColumns(c.columns),
        },
      };
```

- [ ] **Step 5: `validateBlockContent` case `gallery` — zapisać pola**

Zmień zwracany content:
```ts
      return {
        ok: true,
        content: {
          ...locPair(o, "heading", MAX_SHORT),
          images,
          caption_align: galleryAlign(o.caption_align),
          columns: galleryColumns(o.columns),
        },
      };
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/_lib/blocks.ts sklep-meblowy/app/_lib/__tests__/blocks.test.ts
git commit -m "feat(blocks): galeria — caption_align i columns w logice + testy"
```

---

## Task 4: Baner — `body` jako HTML i `layout` center/full w logice

**Files:**
- Modify: `sklep-meblowy/app/_lib/blocks.ts`
- Test: `sklep-meblowy/app/_lib/__tests__/blocks.test.ts`

**Interfaces:**
- Consumes: `sanitizeRichHtml`, `cleanRich`, `MAX_RICH` (Task 1/2).
- Produces: `BannerLayout = "left"|"right"|"background"|"center"|"full"`. `LocalizedBannerContent.body` = sanityzowany HTML. `validateBlockContent("banner", …)` sanityzuje `body`/`body_de` (`cleanRich`) i akceptuje nowe layouty.

- [ ] **Step 1: Testy (failing)**

Zmień/dodaj w `blocks.test.ts` (sekcja banner). Zaktualizuj istniejący test „banner: pola per locale…" tak, by `body` był HTML:
```ts
it("banner: body sanityzowany, layout center/full akceptowany", () => {
  const r = row({
    block_type: "banner",
    content: { heading: "H", body: "<p>Opis<script>x</script></p>", layout: "center" },
  });
  const b = localizeBlock(r, "pl")!;
  if (b.type === "banner") {
    expect(b.content.body).toBe("<p>Opis</p>");
    expect(b.content.layout).toBe("center");
  }
  const full = localizeBlock(row({ block_type: "banner", content: { heading: "H", layout: "full" } }), "pl")!;
  if (full.type === "banner") expect(full.content.layout).toBe("full");
  const bad = localizeBlock(row({ block_type: "banner", content: { heading: "H", layout: "zle" } }), "pl")!;
  if (bad.type === "banner") expect(bad.content.layout).toBe("left");
});
it("banner validate: body HTML sanityzowany, center OK", () => {
  const ok = validateBlockContent("banner", { heading: "H", body: "<p>a<script>x</script></p>", layout: "center" });
  expect(ok.ok).toBe(true);
  if (ok.ok) {
    expect(ok.content.body).toBe("<p>a</p>");
    expect(ok.content.layout).toBe("center");
  }
});
```

- [ ] **Step 2: Uruchom — ma nie przejść**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Expected: FAIL.

- [ ] **Step 3: Rozszerzyć `BannerLayout` i typ**

W `blocks.ts`:
```ts
export type BannerLayout = "left" | "right" | "background" | "center" | "full";
```
`LocalizedBannerContent.body` pozostaje `string | null` (teraz to HTML — bez zmiany typu).

- [ ] **Step 4: `localizeBlock` case `banner` — layout i body HTML**

Zmień wyliczanie layout i body:
```ts
      const rawLayout = c.layout;
      const layout: BannerLayout =
        rawLayout === "right" || rawLayout === "background" ||
        rawLayout === "center" || rawLayout === "full"
          ? rawLayout
          : "left";
      const bodyRaw = pickLoc(c, "body", locale);
      // ... w content:
      body: bodyRaw ? sanitizeRichHtml(bodyRaw) : null,
```
(reszta pól bez zmian).

- [ ] **Step 5: `validateBlockContent` case `banner` — layout + body HTML**

Zmień walidację layout:
```ts
      const layout = o.layout ?? "left";
      if (!["left", "right", "background", "center", "full"].includes(layout as string)) {
        return { ok: false, error: "Nieprawidłowy układ banera" };
      }
```
Zmień budowanie `body` z `locPair(o, "body", MAX_LONG)` na sanityzowane:
```ts
      const bodyClean = cleanRich(o.body, MAX_RICH);
      const bodyDeClean = cleanRich(o.body_de, MAX_RICH);
```
i w zwracanym content zamień `...locPair(o, "body", MAX_LONG),` na:
```ts
        ...(bodyClean ? { body: bodyClean } : {}),
        ...(bodyDeClean ? { body_de: bodyDeClean } : {}),
```

- [ ] **Step 6: Uruchom testy — mają przejść**

Run: `npx vitest run app/_lib/__tests__/blocks.test.ts`
Expected: PASS (wszystkie w pliku).

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/_lib/blocks.ts sklep-meblowy/app/_lib/__tests__/blocks.test.ts
git commit -m "feat(blocks): baner — body HTML + layout center/full w logice + testy"
```

---

## Task 5: Wspólny `RichTextEditor` (przeniesienie + prop `enableImage`)

**Files:**
- Move: `sklep-meblowy/app/admin/produkty/[id]/RichTextEditor.tsx` → `sklep-meblowy/app/admin/_shared/RichTextEditor.tsx`
- Modify: `sklep-meblowy/app/admin/produkty/[id]/DescriptionFieldEditor.tsx`
- Modify: `sklep-meblowy/app/admin/produkty/[id]/DescriptionSectionsEditor.tsx`
- Modify: `sklep-meblowy/app/admin/produkty/[id]/TranslationEditor.tsx`
- Weryfikacja: `npx tsc --noEmit`, testy produktowe zielone, podgląd Playwright edycji produktu.

**Interfaces:**
- Produces: `RichTextEditor` (domyślny eksport z `@/app/admin/_shared/RichTextEditor`) z propsami:
  `{ value: string; onChange: (html: string) => void; ariaLabel: string; placeholder?: string; enableImage?: boolean; uploadImage?: (file: File) => Promise<string | null> }`.
  Przycisk wstawiania obrazka renderuje się TYLKO gdy `enableImage && uploadImage`.

- [ ] **Step 1: Przenieść plik**

```bash
git mv sklep-meblowy/app/admin/produkty/[id]/RichTextEditor.tsx sklep-meblowy/app/admin/_shared/RichTextEditor.tsx
```

- [ ] **Step 2: Uogólnić edytor (props + odcięcie zależności produktowych)**

W `app/admin/_shared/RichTextEditor.tsx`:

1. Usuń pierwszą linię-komentarz ze starą ścieżką. Zamień importy:
```ts
// było: import { uploadProductImage } from "../actions";
// było: import { compressIfNeeded } from "./_shared";
import { compressIfNeeded } from "@/app/_lib/image-compress";
```
2. Rozszerz `RichTextEditorProps`:
```ts
type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  ariaLabel: string;
  placeholder?: string;
  enableImage?: boolean;
  uploadImage?: (file: File) => Promise<string | null>;
};
```
3. Zmień sygnaturę funkcji i domyślne:
```ts
export default function RichTextEditor({
  value,
  onChange,
  ariaLabel,
  placeholder,
  enableImage = false,
  uploadImage,
}: RichTextEditorProps) {
```
4. Zmień `handleInsertImage` żeby używał `uploadImage`:
```ts
  async function handleInsertImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor || !uploadImage) return;
    setUploadingImg(true);
    try {
      const compressed = await compressIfNeeded(file);
      const url = await uploadImage(compressed);
      if (!url) { showToast("Upload nieudany", "error"); return; }
      editor.chain().focus().setImage({ src: url, alt: "" }).run();
    } finally {
      setUploadingImg(false);
    }
  }
```
5. Owiń przycisk obrazka + `<input file>` warunkiem `enableImage && uploadImage` (blok w toolbarze „Link i obraz"): zostaw przycisk link zawsze, a fragment obrazka renderuj tylko warunkowo:
```tsx
        <button type="button" onClick={addLink} className={btn(editor.isActive("link"))} aria-label="Wstaw link">🔗</button>
        {enableImage && uploadImage && (
          <>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploadingImg} className={btn(false)} aria-label="Wstaw obraz">{uploadingImg ? "…" : "🖼"}</button>
            <input ref={fileRef} type="file" accept="image/*" onChange={handleInsertImage} className="hidden" />
          </>
        )}
```

- [ ] **Step 3: Podłączyć produkty do wspólnego edytora**

W każdym z 3 plików zamień import:
```ts
// było: import RichTextEditor from "./RichTextEditor";
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
```
i w KAŻDYM miejscu użycia `<RichTextEditor ... />` (DescriptionFieldEditor: 1×, DescriptionSectionsEditor: 2×, TranslationEditor: 2×) dodaj propsy zachowujące dzisiejsze zachowanie (obraz włączony):
```tsx
          enableImage
          uploadImage={async (file) => {
            const fd = new FormData();
            fd.set("image", file, file.name);
            const res = await uploadProductImage(fd);
            return res.ok ? ((res.data as { url: string } | undefined)?.url ?? null) : null;
          }}
```
Upewnij się, że w każdym z tych plików jest import `uploadProductImage` (DescriptionSectionsEditor już importuje z `../actions`; w pozostałych dodaj `import { uploadProductImage } from "../actions";` jeśli brak). `compressIfNeeded` jest teraz wewnątrz edytora — usuń nieużywane importy `compressIfNeeded` z tych plików tylko jeśli nie są używane gdzie indziej (sprawdź; jeśli używane, zostaw).

- [ ] **Step 4: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: brak błędów.
Run: `npx eslint app/admin/_shared/RichTextEditor.tsx app/admin/produkty/[id]/DescriptionFieldEditor.tsx app/admin/produkty/[id]/DescriptionSectionsEditor.tsx app/admin/produkty/[id]/TranslationEditor.tsx`
Expected: brak błędów (ostrzeżenia img dozwolone).

- [ ] **Step 5: Testy jednostkowe (regresja logiki produktów)**

Run: `npx vitest run`
Expected: PASS (cały zestaw, w tym `product-html.test.ts`).

- [ ] **Step 6: Weryfikacja UI produktu (Playwright)**

Uruchom dev (`npm run dev`), otwórz `http://localhost:3000/admin/produkty/<dowolny-id>`, rozwiń edytor opisu: pasek WYSIWYG działa, przycisk 🖼 wstawia obraz, zapis działa. (Zaloguj się do admina jeśli wymagane.) Zrzut ekranu na potwierdzenie.

- [ ] **Step 7: Commit**

```bash
git add sklep-meblowy/app/admin/_shared/RichTextEditor.tsx sklep-meblowy/app/admin/produkty/[id]/DescriptionFieldEditor.tsx sklep-meblowy/app/admin/produkty/[id]/DescriptionSectionsEditor.tsx sklep-meblowy/app/admin/produkty/[id]/TranslationEditor.tsx
git commit -m "refactor(rich-text): wspolny RichTextEditor z propem enableImage; produkty przepiete"
```

---

## Task 6: Blok „Tekst" — formularz, render, podłączenie

**Files:**
- Create: `sklep-meblowy/app/_components/blocks/TextBlock.tsx`
- Modify: `sklep-meblowy/app/_components/blocks/ContentBlock.tsx`
- Modify: `sklep-meblowy/app/admin/strona-glowna/BlockForms.tsx` (dodać `TextForm`)
- Modify: `sklep-meblowy/app/admin/podstrony/[id]/PageEditor.tsx` (switch renderu)
- Modify: `sklep-meblowy/app/admin/strona-glowna/BlocksEditor.tsx` (switch renderu)
- Modify: `sklep-meblowy/app/globals.css` (klasa `.rich-text`)

**Interfaces:**
- Consumes: `LocalizedTextContent` (Task 2), `RichTextEditor` (Task 5), `sanitizeRichHtml` (Task 1).
- Produces: `TextBlock` (render), `TextForm` (admin), `.rich-text` CSS.

- [ ] **Step 1: Klasa CSS `.rich-text` w globals.css**

Dodaj (odwzoruj style renderu treści; jeśli istnieje `.product-description`, ustaw wspólne reguły także dla `.rich-text`). Minimalny zestaw:
```css
.rich-text h2 { font-size: 1.75rem; font-weight: 700; margin: 1.5rem 0 0.75rem; }
.rich-text h3 { font-size: 1.35rem; font-weight: 700; margin: 1.25rem 0 0.5rem; }
.rich-text h4 { font-size: 1.1rem; font-weight: 600; margin: 1rem 0 0.5rem; }
.rich-text p { margin: 0 0 1rem; line-height: 1.7; }
.rich-text ul { list-style: disc; padding-left: 1.5rem; margin: 0 0 1rem; }
.rich-text ol { list-style: decimal; padding-left: 1.5rem; margin: 0 0 1rem; }
.rich-text li { margin: 0.25rem 0; }
.rich-text a { color: var(--color-gold-text); text-decoration: underline; }
.rich-text blockquote { border-left: 3px solid var(--border); padding-left: 1rem; color: var(--muted); margin: 0 0 1rem; }
.rich-text :where(strong,b) { font-weight: 700; }
.rich-text img { max-width: 100%; height: auto; border-radius: 1rem; }
```

- [ ] **Step 2: Komponent `TextBlock.tsx`**

```tsx
import { sanitizeRichHtml } from "@/app/_lib/product-html";
import type { LocalizedTextContent } from "@/app/_lib/blocks";

export default function TextBlock({ content }: { content: LocalizedTextContent }) {
  if (!content.body) return null;
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <div
        className="rich-text text-[var(--fg)]"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content.body) }}
      />
    </section>
  );
}
```

- [ ] **Step 3: `ContentBlock.tsx` — case `text`**

Dodaj import i case:
```tsx
import TextBlock from "./TextBlock";
// ...
    case "text":
      return <TextBlock content={block.content} />;
```

- [ ] **Step 4: `TextForm` w BlockForms.tsx**

Dodaj import edytora na górze:
```ts
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
```
Dodaj formularz (wzór jak inne `*Form`):
```tsx
export function TextForm({ block, onResult }: BlockFormProps) {
  const c = block.content;
  const [body, setBody] = useState(cs(c.body));
  const [bodyDe, setBodyDe] = useState(cs(c.body_de));
  const [saving, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      onResult(await updateContentBlock(block.id, { body, body_de: bodyDe }));
    });
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Treść" required>
        <RichTextEditor value={body} onChange={setBody} ariaLabel="Treść (PL)" placeholder="Napisz treść…" />
      </Field>
      <Field label="Treść (DE)">
        <RichTextEditor value={bodyDe} onChange={setBodyDe} ariaLabel="Treść (DE)" placeholder="Text auf Deutsch…" />
      </Field>
      <SaveButton saving={saving} />
    </form>
  );
}
```

- [ ] **Step 5: Podłączyć `TextForm` w edytorach**

W `PageEditor.tsx` i `BlocksEditor.tsx`:
1. Dodaj `TextForm` do importu z `BlockForms`.
2. W bloku renderu formularzy dodaj:
```tsx
                  {b.block_type === "text" && <TextForm block={b} onResult={handleResult} />}
```

- [ ] **Step 6: Typecheck + lint**

Run: `npx tsc --noEmit`
Expected: brak błędów (unia bloków w pełni pokryta).
Run: `npx eslint app/_components/blocks/TextBlock.tsx app/_components/blocks/ContentBlock.tsx app/admin/strona-glowna/BlockForms.tsx`
Expected: brak błędów.

- [ ] **Step 7: Weryfikacja UI (Playwright)**

Dev; w `/admin/podstrony/<id>` dodaj sekcję „Tekst", wpisz sformatowany tekst z wyśrodkowaniem, zapisz, otwórz podgląd podstrony — tekst renderuje się sformatowany i wyśrodkowany. Zrzut ekranu.

- [ ] **Step 8: Commit**

```bash
git add sklep-meblowy/app/_components/blocks/TextBlock.tsx sklep-meblowy/app/_components/blocks/ContentBlock.tsx sklep-meblowy/app/admin/strona-glowna/BlockForms.tsx sklep-meblowy/app/admin/podstrony/[id]/PageEditor.tsx sklep-meblowy/app/admin/strona-glowna/BlocksEditor.tsx sklep-meblowy/app/globals.css
git commit -m "feat(blocks): blok Tekst (WYSIWYG) — formularz, render, style"
```

---

## Task 7: Baner — body WYSIWYG + układy center/full (formularz + render)

**Files:**
- Modify: `sklep-meblowy/app/admin/strona-glowna/BlockForms.tsx` (`BannerForm`)
- Modify: `sklep-meblowy/app/_components/blocks/BannerBlock.tsx`

**Interfaces:**
- Consumes: `RichTextEditor` (Task 5), rozszerzony `BannerLayout` i `body` HTML (Task 4), `sanitizeRichHtml`.

- [ ] **Step 1: `BannerForm` — body na RichTextEditor + nowe układy**

W `BannerForm`:
1. Zamień pole `body` (textarea) na edytor, usuń `bodyDe` textarea, dodaj edytory:
```tsx
        <Field label="Tekst">
          <RichTextEditor value={body} onChange={setBody} ariaLabel="Tekst banera (PL)" placeholder="Treść banera…" />
        </Field>
        <Field label="Tekst (DE)">
          <RichTextEditor value={bodyDe} onChange={setBodyDe} ariaLabel="Tekst banera (DE)" />
        </Field>
```
(stan `body`/`bodyDe` już istnieje jako `useState`).
2. Rozszerz opcje układu (tablica etykiet):
```tsx
            [
              ["left", "Zdjęcie po lewej"],
              ["right", "Zdjęcie po prawej"],
              ["center", "Zdjęcie na środku"],
              ["full", "Zdjęcie na całą szerokość"],
              ["background", "Zdjęcie jako tło"],
            ] as const
```

- [ ] **Step 2: `BannerBlock.tsx` — render body jako HTML + center/full**

1. Import:
```tsx
import { sanitizeRichHtml } from "@/app/_lib/product-html";
```
2. W bloku `text` zamień `<p ...>{body}</p>` na render HTML:
```tsx
      {body && (
        <div
          className={`rich-text mb-8 ${layout === "background" ? "text-white [&_a]:text-white" : "text-[var(--muted)]"}`}
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }}
        />
      )}
```
3. Dodaj gałęzie `center` i `full` PRZED końcowym `return` (grid left/right). Po bloku `if (layout === "background")` dodaj:
```tsx
  if (layout === "center" || layout === "full") {
    const imgWrap = layout === "full" ? "w-full" : "max-w-3xl mx-auto";
    return (
      <section className="max-w-7xl mx-auto px-6 py-24">
        {image_url && (
          <div className={`${imgWrap} rounded-2xl overflow-hidden mb-10`}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={image_url} alt={heading ?? ""} loading="lazy" decoding="async" className="w-full h-auto" />
          </div>
        )}
        <div className="max-w-3xl mx-auto text-center">{text}</div>
      </section>
    );
  }
```
(`text` to istniejąca zmienna JSX; dla center/full nagłówek/treść wyśrodkowane.)

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Run: `npx eslint app/_components/blocks/BannerBlock.tsx app/admin/strona-glowna/BlockForms.tsx`
Expected: brak błędów.

- [ ] **Step 4: Weryfikacja UI (Playwright)**

Dev; edytuj baner (np. na testowej podstronie): sformatuj tekst, przełącz układ na „środek" i „na całą szerokość", zapisz, podgląd — zdjęcie odpowiednio wyśrodkowane / pełne, tekst pod spodem, HTML renderowany. Zrzut ekranu.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_components/blocks/BannerBlock.tsx sklep-meblowy/app/admin/strona-glowna/BlockForms.tsx
git commit -m "feat(blocks): baner — tekst WYSIWYG + uklady center/full"
```

---

## Task 8: Galeria — wyrównanie podpisów + liczba kolumn (formularz + render)

**Files:**
- Modify: `sklep-meblowy/app/admin/strona-glowna/BlockForms.tsx` (`GalleryForm`)
- Modify: `sklep-meblowy/app/_components/blocks/GalleryBlock.tsx`

**Interfaces:**
- Consumes: `LocalizedGalleryContent` z `caption_align`/`columns` (Task 3).

- [ ] **Step 1: `GalleryForm` — kontrolki align + kolumny**

W `GalleryForm` dodaj stan i UI:
```tsx
  const [captionAlign, setCaptionAlign] = useState(
    c.caption_align === "left" || c.caption_align === "right" ? (c.caption_align as string) : "center"
  );
  const [columns, setColumns] = useState(
    c.columns === "2" || c.columns === "3" ? (c.columns as string) : "masonry"
  );
```
W `submit` dołóż do `updateContentBlock`: `caption_align: captionAlign, columns`.
W formularzu (po nagłówkach) dodaj dwa zestawy przycisków (wzór jak „Układ" w BannerForm) dla:
- Podpisy: `["left","Do lewej"], ["center","Wyśrodkuj"], ["right","Do prawej"]` → `setCaptionAlign`.
- Kolumny: `["2","2 kolumny"], ["3","3 kolumny"], ["masonry","Masonry (auto)"]` → `setColumns`.

- [ ] **Step 2: `GalleryBlock.tsx` — użyć pól**

1. Odczytaj z contentu:
```tsx
  const { heading, images, caption_align, columns } = content;
```
2. Klasa kolumn zależna od `columns` (nadpisuje auto), zachowując single dla 1 zdjęcia:
```tsx
  const single = images.length === 1;
  const colsClass = single
    ? "max-w-4xl mx-auto"
    : columns === "2"
      ? "columns-1 sm:columns-2 gap-4"
      : columns === "3"
        ? "columns-1 sm:columns-2 md:columns-3 gap-4"
        : images.length === 2
          ? "columns-1 sm:columns-2 gap-4"
          : "columns-1 sm:columns-2 md:columns-3 gap-4";
```
3. Klasa wyrównania podpisu:
```tsx
  const capAlign = caption_align === "left" ? "text-left" : caption_align === "right" ? "text-right" : "text-center";
```
4. Użyj `colsClass` na kontenerze i `capAlign` na `<figcaption>`:
```tsx
            <figcaption className={`mt-2 text-sm text-[var(--muted)] font-sans ${capAlign}`}>
```

- [ ] **Step 3: Typecheck + lint**

Run: `npx tsc --noEmit`
Run: `npx eslint app/_components/blocks/GalleryBlock.tsx app/admin/strona-glowna/BlockForms.tsx`
Expected: brak błędów.

- [ ] **Step 4: Weryfikacja UI (Playwright) na realnej podstronie**

Dev; otwórz `http://localhost:3000/chill-me`: podpisy 01–16 domyślnie wyśrodkowane. W `/admin/podstrony/<id chill-me>` zmień galerię na „3 kolumny" i podpisy „Do lewej", zapisz, odśwież podgląd — układ i wyrównanie zgodne. Zrzut ekranu przed/po.

- [ ] **Step 5: Commit**

```bash
git add sklep-meblowy/app/_components/blocks/GalleryBlock.tsx sklep-meblowy/app/admin/strona-glowna/BlockForms.tsx
git commit -m "feat(blocks): galeria — wyrownanie podpisow + liczba kolumn"
```

---

## Task 9: Weryfikacja end-to-end + pełny zestaw testów

**Files:** brak nowych; weryfikacja całości.

- [ ] **Step 1: Pełne testy + typy + lint**

Run: `npx vitest run`
Expected: PASS (cały zestaw).
Run: `npx tsc --noEmit`
Expected: brak błędów.
Run: `npx eslint app`
Expected: brak błędów (ostrzeżenia img dozwolone jak dziś).

- [ ] **Step 2: Playwright — ścieżka realna**

Dev; przejdź: `/chill-me` (galeria: podpisy wyśrodkowane, nieucięte), dodaj na testowej podstronie blok „Tekst" (wyśrodkowany, sformatowany) i baner „na całą szerokość". Zrzuty desktop + mobile. Sprawdź `/de` (fallback PL gdy brak DE). Zero błędów w konsoli poza znanymi.

- [ ] **Step 3: Commit (jeśli drobne poprawki)**

```bash
git add -A
git commit -m "test(blocks): weryfikacja e2e etapu 1 WYSIWYG + uklady"
```

---

## Self-Review (wykonane przy pisaniu planu)

- **Pokrycie spec:** wspólny edytor+sanitizer (Task 1,5), blok Tekst (Task 2,6), baner body+center/full (Task 4,7), galeria caption_align+columns (Task 3,8), i18n PL/DE (Task 2/4/6/7 — pary pól + `pickLoc`), sanityzacja zapis+render (Task 2/4 walidacja, Task 6/7 render `sanitizeRichHtml`), testy (Task 2–4,9). Migracja starego body banera: render HTML tolerancyjny (plain text przechodzi). Wszystkie punkty spec mają task.
- **Placeholdery:** brak „TBD/TODO"; każdy krok ma kod lub dokładną komendę.
- **Spójność typów:** `BannerLayout` (5 wartości) użyty w localize/validate/render; `GalleryCaptionAlign`/`GalleryColumns` spójne; `RichTextEditor` props identyczne w Task 5 i konsumentach (Task 6/7); `sanitizeRichHtml` z Task 1 używane wszędzie.
