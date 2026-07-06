# Wybór czcionki w edytorze opisów — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Select „Czcionka" w toolbarze edytora opisów (Tiptap) z zamkniętą listą 4 czcionek + Domyślna; sanitizer przepuszcza wyłącznie te stacki.

**Architecture:** Rozszerzenie `FontFamily` z JUŻ zainstalowanego `@tiptap/extension-text-style` (zapisuje `<span style="font-family: …">` — wzorzec identyczny z działającymi kolorami). Wspólny moduł `description-fonts.ts` = jedno źródło prawdy dla toolbaru i sanitizera. Sanitizer dopuszcza `font-family` na spanach tylko z zamkniętej listy (normalizacja cudzysłowów/wielkości liter, wyjście kanoniczne).

**Tech Stack:** Tiptap 3.27 (`FontFamily` potwierdzony w d.ts zainstalowanego pakietu), vitest, Playwright (weryfikacja lokalna bez zapisów do DB).

**Spec:** `docs/superpowers/specs/2026-07-06-czcionki-opisow-design.md`

## Global Constraints

- Stacki DOKŁADNIE: `var(--font-display), serif` / `Georgia, serif` / `Arial, Helvetica, sans-serif` / `'Courier New', monospace`; etykiety: „Elegancka (serif)", „Georgia", „Arial", „Courier"; pozycja pusta: „Domyślna".
- Zero nowych zależności npm; komentarze po polsku.
- Sanitizer: wartość spoza listy → deklaracja WYCIĘTA (nie przepuszczaj niczego innego); wyjście zawsze kanonicznym stackiem z listy.
- Gałąź: `feat/czcionki-opisow` (merge w Task 3; push kontem Woodecky10).
- Weryfikacja e2e BEZ zapisów do produkcyjnej DB (podgląd w edytorze + „Wyjdź bez zapisywania").

---

### Task 1: Moduł czcionek + sanitizer (TDD)

**Files:**
- Create: `app/_lib/description-fonts.ts`
- Modify: `app/_lib/product-html.ts` (`ALLOWED_STYLE_PROPS.span` ~linia 102, `sanitizeStyleAttr` ~linie 119-137)
- Test: `app/_lib/__tests__/product-html.test.ts` (dopisz describe)

**Interfaces:**
- Produces: `FONT_OPTIONS: { label: string; stack: string }[]`, `normalizeFontStack(v: string): string`, `ALLOWED_FONT_STACKS: Set<string>` z `@/app/_lib/description-fonts` — konsumowane przez Task 2 (toolbar) i product-html.

- [ ] **Step 1: Failing testy** (dopisz do `app/_lib/__tests__/product-html.test.ts`; dodaj import `FONT_OPTIONS` z `@/app/_lib/description-fonts`):

```ts
describe("sanitizeStyleAttr — font-family (zamknięta lista czcionek opisów)", () => {
  it("każdy dozwolony stack przechodzi w formie kanonicznej", () => {
    for (const o of FONT_OPTIONS) {
      expect(sanitizeStyleAttr("span", `font-family: ${o.stack}`)).toBe(`font-family: ${o.stack}`);
    }
  });
  it("normalizuje cudzysłowy i wielkość liter do kanonicznego stacka", () => {
    expect(sanitizeStyleAttr("span", 'font-family: "courier new", MONOSPACE')).toBe(
      "font-family: 'Courier New', monospace"
    );
  });
  it("obce i niebezpieczne wartości są wycinane", () => {
    expect(sanitizeStyleAttr("span", "font-family: Comic Sans MS")).toBe("");
    expect(sanitizeStyleAttr("span", "font-family: url(javascript:x)")).toBe("");
    expect(sanitizeStyleAttr("span", "font-family: expression(alert(1))")).toBe("");
    expect(sanitizeStyleAttr("span", "font-family: var(--cokolwiek), serif")).toBe("");
  });
  it("color + font-family w jednym stylu — obie deklaracje zachowane", () => {
    expect(sanitizeStyleAttr("span", "color: #ff0000; font-family: Georgia, serif")).toBe(
      "color: #ff0000; font-family: Georgia, serif"
    );
  });
});
```

- [ ] **Step 2: Czerwone** — Run: `npx vitest run app/_lib/__tests__/product-html.test.ts`
Expected: FAIL (brak modułu description-fonts / font-family wycinane).

- [ ] **Step 3: Implementacja**

`app/_lib/description-fonts.ts` (nowy):

```ts
// Zamknięta lista czcionek dla opisów produktu — JEDNO źródło prawdy dla
// toolbaru edytora (RichTextEditor) i sanitizera HTML (product-html).
// var(--font-display) = Playfair Display z next/font (literal „Playfair
// Display" NIE zadziała — next/font nadaje rodzinie unikalną nazwę; zmienna
// jest zdefiniowana na :root, więc działa w adminie i na karcie produktu).
export type FontOption = { label: string; stack: string };

export const FONT_OPTIONS: FontOption[] = [
  { label: "Elegancka (serif)", stack: "var(--font-display), serif" },
  { label: "Georgia", stack: "Georgia, serif" },
  { label: "Arial", stack: "Arial, Helvetica, sans-serif" },
  { label: "Courier", stack: "'Courier New', monospace" },
];

// Normalizacja do porównań w sanitizerze: trim, lowercase, cudzysłowy " → '.
export function normalizeFontStack(v: string): string {
  return v.trim().toLowerCase().replace(/"/g, "'");
}

export const ALLOWED_FONT_STACKS = new Set(
  FONT_OPTIONS.map((o) => normalizeFontStack(o.stack))
);
```

`app/_lib/product-html.ts`:
- import na górze: `import { FONT_OPTIONS, normalizeFontStack } from "./description-fonts";`
- `ALLOWED_STYLE_PROPS`: `span: new Set(["color", "font-family"]),`
- w `sanitizeStyleAttr`, po gałęzi `color`, dodaj:

```ts
    } else if (prop === "font-family") {
      // Zamknięta lista stacków (description-fonts) — wyjście ZAWSZE kanoniczne.
      const canonical = FONT_OPTIONS.find(
        (o) => normalizeFontStack(o.stack) === normalizeFontStack(value)
      );
      if (canonical) out.push(`font-family: ${canonical.stack}`);
    }
```

- [ ] **Step 4: Zielone** — Run: `npx vitest run && npx tsc --noEmit`
Expected: wszystkie PASS, exit 0.

- [ ] **Step 5: Commit**

```bash
git add app/_lib/description-fonts.ts app/_lib/product-html.ts app/_lib/__tests__/product-html.test.ts
git commit -m "feat(opisy): zamknięta lista czcionek + font-family w sanitizerze (TDD)"
```

---

### Task 2: Toolbar — select „Czcionka" + rozszerzenie FontFamily

**Files:**
- Modify: `app/admin/produkty/[id]/RichTextEditor.tsx` (importy ~linia 11, `extensions` ~linie 46-60, toolbar przed komentarzem `{/* Kolor tekstu — stała paleta */}` ~linia 169)

**Interfaces:**
- Consumes: `FONT_OPTIONS` z `@/app/_lib/description-fonts` (Task 1); Tiptap: `FontFamily` z `@tiptap/extension-text-style` (eksport potwierdzony w zainstalowanym 3.27.1); komendy `setFontFamily(stack)` / `unsetFontFamily()`; odczyt: `editor.getAttributes("textStyle").fontFamily`.

- [ ] **Step 1: Rozszerzenie.** W imporcie z `@tiptap/extension-text-style` dodaj `FontFamily`:

```ts
import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style";
```

i dopisz `FontFamily,` do tablicy `extensions` (obok `TextStyle`/`Color` — przeczytaj tablicę i zachowaj styl).

- [ ] **Step 2: Select w toolbarze.** Bezpośrednio PRZED komentarzem `{/* Kolor tekstu — stała paleta */}` wstaw:

```tsx
        {/* Czcionka — zamknięta lista (to samo źródło prawdy co sanitizer:
            description-fonts). Wartość pusta = Domyślna (unsetFontFamily). */}
        <select
          value={(editor.getAttributes("textStyle").fontFamily as string | undefined) ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") editor.chain().focus().unsetFontFamily().run();
            else editor.chain().focus().setFontFamily(v).run();
          }}
          title="Czcionka"
          aria-label="Czcionka"
          className="h-7 px-1.5 text-xs bg-transparent border border-[var(--border)] rounded-md text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
        >
          <option value="">Domyślna</option>
          {FONT_OPTIONS.map((o) => (
            <option key={o.stack} value={o.stack} style={{ fontFamily: o.stack }}>
              {o.label}
            </option>
          ))}
        </select>
        <span className="w-px h-5 bg-[var(--border)] mx-1" />
```

plus import `FONT_OPTIONS` z `@/app/_lib/description-fonts` na górze pliku.

UWAGA dla implementera: toolbar już odświeża stany aktywne (np. `btn(editor.isActive("bold"))`) — przeczytaj konfigurację `useEditor` w tym pliku; jeśli aktywność bold odświeża się przy zmianie zaznaczenia, `value` selecta będzie odświeżać się tym samym mechanizmem (niczego nie dodawaj). Gdyby jednak plik używał `useEditorState`/dedykowanego mechanizmu — podłącz odczyt `fontFamily` tak samo jak pozostałe stany.

- [ ] **Step 3: Weryfikacja** — Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: exit 0 wszędzie.

- [ ] **Step 4: Commit**

```bash
git add "app/admin/produkty/[id]/RichTextEditor.tsx"
git commit -m "feat(admin): select czcionki w toolbarze edytora opisów"
```

---

### Task 3: Weryfikacja e2e (bez zapisów) + integracja

**Files:** skrypt tymczasowy w scratchpadzie sesji.

**Interfaces:**
- Consumes: lokalny build; sesja admina `e2e/.auth/admin.json`; produkt z polem opisu: `df344b3c-a04d-4b22-bd55-1baed7d25417` (RIVIA) — edytor pola „Opis produktu" (`DescriptionFieldEditor`, sekcja zwijana).

⚠️ ZERO zapisów do DB: nie klikać żadnego „Zapisz…"; stronę opuszczać przez dialog guarda → „Wyjdź bez zapisywania".

- [ ] **Step 1:** `npm run build`; `npx next start -p 3210` (tło; UWAGA: po skończeniu ubij też osierocony proces node na porcie — `netstat -ano | grep :3210` → `taskkill //F //PID <pid>`).

- [ ] **Step 2: Scenariusze (Playwright, 1440×1000, storageState):**
1. Otwórz `/admin/produkty/df344b3c-a04d-4b22-bd55-1baed7d25417`, rozwiń sekcję „Opis produktu" (klik w nagłówek TYLKO gdy `aria-expanded="false"`).
2. Select `[aria-label="Czcionka"]` w toolbarze edytora: istnieje, wartość „" (Domyślna), 5 opcji z dokładnymi etykietami.
3. Zaznacz fragment tekstu w edytorze (np. `selectAll` w ProseMirror: klik w treść + Ctrl+A), wybierz „Georgia" → w DOM edytora (`.ProseMirror`) pojawia się `span[style*="font-family: Georgia"]`. Select pokazuje „Georgia".
4. Wybierz „Domyślna" → spany font-family znikają z DOM edytora.
5. Wybierz „Elegancka (serif)" → span ze stylem `var(--font-display)` + wizualnie serif (zrzut fragmentu do scratchpadu).
6. Klik w link sidebaru → dialog „Niezapisane zmiany" → „Wyjdź bez zapisywania" (nic nie zapisane).

Expected: wszystkie zgodnie z opisem; zrzuty przy niepowodzeniach.

- [ ] **Step 3: Merge + deploy + smoke:**

```bash
git checkout main && git merge --no-ff feat/czcionki-opisow -m "Merge branch 'feat/czcionki-opisow'"
git push origin main
# po ~2,5 min (bez pętli):
curl -s -o /dev/null -w "%{http_code}" https://www.mollien.pl/   # 200
```

(Sam edytor na prodzie wymaga logowania — pokrycie dają: lokalny e2e na identycznym buildzie + unit sanitizera na ścieżce zapisu/renderu.)
