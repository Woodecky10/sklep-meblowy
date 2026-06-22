# Spec: Rozszerzenie funkcji edytora WYSIWYG opisów

**Data:** 2026-06-22
**Status:** zaakceptowany (brainstorming) → do planu TDD
**Powiązany:** rozszerza `RichTextEditor` z `2026-06-22-edytor-wysiwyg-opisow-produktu-design.md`

## Kontekst i problem

`RichTextEditor` (TipTap) ma dziś pasek: pogrubienie, kursywa, lista punktowana,
lista numerowana, H2, H3, link, wyczyść. Właściciel: „mało jest funkcji w tym
edytorze". Dodajemy więcej formatowania. Część wymaga rozszerzenia whitelisty
sanitizera (`app/_lib/product-html.ts`), a wyrównanie/kolor — wąskiego, świadomego
dopuszczenia atrybutu `style`.

## Cel i zakres

### Cel
Edytor opisów oferuje pełniejszy, oczekiwany zestaw formatowania, bez ręcznego HTML,
z zachowaniem bezpieczeństwa renderu (sanitizer pozostaje restrykcyjny — poszerzony
wąsko i z walidacją).

### W zakresie (4 grupy, wszystkie zatwierdzone)
1. **Cofnij / Ponów** (undo/redo).
2. **Podkreślenie, przekreślenie, cytat, nagłówek H4.**
3. **Wyrównanie tekstu** (lewo/środek/prawo/justuj) + **kolor tekstu.**
4. **Obraz w treści** (upload + wstawienie w akapit).

### Zatwierdzone decyzje
- Wyrównanie i kolor przez **wąsko-whitelistowany `style`** (tylko `text-align` na
  blokach, tylko `color` na `span`), z twardą walidacją wartości.
- Wyróżnienie jako **zwykły `<mark>`** (jeden kolor z CSS, bez inline-background, bez
  wyboru koloru tła).
- Obraz w treści **mimo** nakładania się z „Sekcje → + Zdjęcie" (sekcje = obraz między
  blokami; tu = obraz wewnątrz opisu). Reuse istniejącego uploadu.

### Poza zakresem
- Render storefront bez zmian strukturalnych (nadal `sanitizeProductHtml` +
  `dangerouslySetInnerHTML`) — zmienia się tylko to, co sanitizer **przepuszcza**.
- Brak migracji bazy. Format = HTML string.
- Brak koloru tła wyróżnienia, brak `data:` w obrazach, brak surowego `style`.

## Architektura

### 1. Sanitizer (`app/_lib/product-html.ts`) — rdzeń, security-sensitive
- **Nowe tagi w `ALLOWED_TAGS`:** `u`, `s`, `blockquote`, `mark`, `img`.
- **`ALLOWED_ATTRS_PER_TAG` rozszerzenie:**
  - `img`: `{ src, alt }` — `src` przez istniejący `hasSafeUrlScheme` (http/https; `data:`/`javascript:` odrzucone).
  - `p`, `h2`, `h3`, `h4`: `{ style }` — ale po przefiltrowaniu (niżej).
  - `span`: `{ style }` — po przefiltrowaniu.
- **Filtr `style` (nowa czysta funkcja `sanitizeStyleAttr(tag, raw): string`):**
  - Rozbij `raw` po `;`; dla każdej pary `prop:value`:
    - Dozwolone property zależnie od tagu: `text-align` dla `p/h2/h3/h4`; `color` dla `span`.
    - **`text-align`** — wartość ∈ `{ left, center, right, justify }` (inne → odrzuć).
    - **`color`** — wartość pasuje do bezpiecznego wzorca: hex `#[0-9a-fA-F]{3,8}`,
      `rgb(...)`/`rgba(...)` zawierające wyłącznie cyfry/przecinki/spacje/kropki/%,
      albo nazwa CSS `[a-z]+`. **Twardo odrzuć** wartości zawierające `url(`,
      `expression`, `/*`, `*/`, `\`, `<`, `>` lub `;` po dekodowaniu.
    - Zbuduj z powrotem `prop: value` tylko z bezpiecznych par; brak par → atrybut `style` w ogóle pomijany.
  - W głównym loopie atrybutów: gdy `attrName === "style"` i tag ma `style` w allow-liście → przepuść przez `sanitizeStyleAttr`; inaczej drop.
- **`<style>` (element) NADAL wycinany** wholesale (`DANGEROUS_BLOCK_TAGS`) — atrybut `style` ≠ element `<style>`.
- `stripBlockedLinks` (allegro) i reszta bez zmian.

### 2. Komponent `RichTextEditor` (`app/admin/produkty/[id]/RichTextEditor.tsx`)
- StarterKit: `strike` i `blockquote` **włączone** (dziś `false`); `heading.levels: [2, 3, 4]`.
- Doinstalowane rozszerzenia (te spoza StarterKit 3.x — plan zweryfikuje, część może być bundlowana):
  `Underline`, `TextAlign` (`types: ['heading','paragraph']`, `alignments: ['left','center','right','justify']`),
  `TextStyle` + `Color`, `Highlight` (bez `multicolor`), `Image` (`inline: false`, `allowBase64: false`).
- **Pasek** (pogrupowany separatorami, zawijany `flex-wrap`):
  `[B] [I] [U] [S]` | `[• Lista] [1. Lista]` | `[H2] [H3] [H4]` | `[⯇][≡][⯈][≣]` (wyrównanie) | `[Kolor ▾] [Marker]` | `[🔗 Link] [🖼 Obraz]` | `[↶][↷]` | `[✕ Wyczyść]`.
  - Kolor: mały dropdown z **stałą paletą** (np. 6 kolorów marki + „domyślny"); ustawia `color` przez `setColor`/`unsetColor`.
  - Wyrównanie: 4 przyciski `setTextAlign(...)`.
- **Upload obrazu:** przycisk „🖼 Obraz" → ukryty `<input type=file accept=image/*>` → `compressIfNeeded` (z `_shared`) → `uploadProductImage(FormData)` (istniejąca akcja, zwraca `{ url }`) → `editor.chain().focus().setImage({ src: url, alt: "" }).run()`. Stan „Wgrywam…", obsługa błędu przez wewn. komunikat/disabled.
- Reszta (immediatelyRender:false, normalizeEditorHtml w onUpdate, value-sync useEffect, placeholder, klasa `product-description`) — bez zmian.

### 3. CSS (`app/globals.css`, scope `.product-description`)
Dodać: `u{text-decoration:underline}`, `s{text-decoration:line-through}`,
`blockquote{border-left + padding + italic/muted}`, `mark{background:<brand highlight>; padding}`,
`img{max-width:100%; height:auto; border-radius; margin}`. (`text-align` działa z inline-style — bez reguły.)

## Przepływ danych
- Format bez zmian (HTML string). Render: `page.tsx` + `ProductDescriptionSections` →
  `sanitizeProductHtml` → `dangerouslySetInnerHTML` — bez zmian kodu; sanitizer
  przepuszcza teraz nowe tagi/wąski `style`/`img`.
- Sanitize-on-save (sekcje + pojedynczy opis, z poprzednich slice'ów) automatycznie
  obejmie nowe tagi (woła ten sam `sanitizeProductHtml`).

## Przypadki brzegowe / bezpieczeństwo
- `style="...url(javascript:...)"` / `expression(...)` / komentarze CSS → **wycięte**, zostaje pusto lub tylko bezpieczna część.
- `<img src="javascript:...">` / `data:` → `src` odrzucony (drop atrybutu → `<img>` bez src; albo cały tag bez src — i tak nieszkodliwy).
- `<img onerror=...>` → `onerror` poza allow-listą atrybutów `img` → wycięty.
- Wyrównanie/kolor na tagu spoza allow-listy `style` → `style` dropowany.
- Pusty edytor → `""` (bez zmian). Legacy HTML → normalizacja przez edytor + sanitizer.

## Testy (rozszerzenie istniejącego adwersarskiego zestawu)
W `app/_lib/__tests__/product-html.test.ts` (czyste funkcje, node):
- **Pozytywne (przechodzą):** `<u>`, `<s>`, `<blockquote>`, `<mark>` zachowane;
  `<p style="text-align:center">` zachowane; `<span style="color:#c00">` zachowane;
  `<img src="https://x/y.jpg" alt="a">` zachowany.
- **Adwersarskie (wycięte/oczyszczone):** `style="text-align:center; background:url(x)"` → zostaje tylko `text-align:center`;
  `style="color: expression(alert(1))"` → `color` wycięty; `<img src="javascript:alert(1)">` → bez src/usunięty;
  `<img onerror=alert(1) src=x>` → bez `onerror`; `style` na `<div>`/niedozwolonym tagu → brak;
  istniejące testy XSS (kontrolne znaki w href itd.) **nadal zielone**.
- `sanitizeStyleAttr` testowane też jednostkowo (pary prop:value, walidacja wartości).
- Bramki: `tsc 0`, `lint 0`, `npm test` zielony, `npm run build` OK. Smoke ręczny:
  każdy przycisk paska → zapis → render na `/produkt/[id]` i `/de/produkt/[id]`.

## Stan obecny kodu
- Komponent: `app/admin/produkty/[id]/RichTextEditor.tsx` (StarterKit z `strike:false`/`blockquote:false`, `heading.levels:[2,3]`).
- Sanitizer: `app/_lib/product-html.ts` — `ALLOWED_TAGS`, `ALLOWED_ATTRS_PER_TAG`, `hasSafeUrlScheme`, `DANGEROUS_BLOCK_TAGS`, `escapeHtmlAttr`.
- Upload: `uploadProductImage` w `app/admin/produkty/actions.ts`; `compressIfNeeded` w `app/admin/produkty/[id]/_shared.tsx`.
- CSS: `app/globals.css` blok `.product-description`.
- Testy sanitizera: `app/_lib/__tests__/product-html.test.ts`.

## Plan (wielotaskowy, kolejność wg ryzyka)
1. **Sanitizer + testy** (rdzeń security): nowe tagi, `img`, `sanitizeStyleAttr`, adwersarskie testy. [najpierw — gate]
2. **Instalacja rozszerzeń + włączenie w komponencie** (undo/redo, U, S, blockquote, H4, underline) + przyciski; build.
3. **Wyrównanie + kolor** (TextAlign, TextStyle/Color, Highlight→`<mark>`) + przyciski/paleta.
4. **Obraz w treści** (Image + upload flow przez `uploadProductImage`).
5. **Pasek (layout/grupowanie) + CSS render** + bramki + smoke.
