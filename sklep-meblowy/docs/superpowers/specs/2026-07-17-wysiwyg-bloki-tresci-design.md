# Edytor WYSIWYG + układy w blokach treści — Etap 1

Data: 2026-07-17
Status: zatwierdzony projekt (spec), przed planem wdrożenia

## Cel

Treść bloków (podstrony + strona główna) ma być redagowalna wygodnie i wyglądać
spójnie: sformatowany tekst (WYSIWYG z wyrównaniem), wyśrodkowane/wyrównane
podpisy zdjęć oraz kontrola układu zdjęć w blokach. Bezpośredni ból: na
podstronach typu `Tkaniny → Grupa → Chill me` podpisy zdjęć były brzydkie i
niespójne, a układ pojedynczego zdjęcia wyglądał źle.

## Kontekst — co już jest w repo

- **`app/admin/produkty/[id]/RichTextEditor.tsx`** — gotowy edytor WYSIWYG na
  TipTap 3.x: pogrubienie/kursywa/podkreślenie/przekreślenie, listy, cytat,
  nagłówki H2–H4, **wyrównanie (lewo/środek/prawo/justowanie)**, czcionka,
  kolor, wyróżnienie, link, wstawianie `<img>`, cofnij/ponów, czyszczenie.
  `immediatelyRender:false` (wymóg SSR Next 16).
- **`app/_lib/product-html.ts`** — regexowy sanitizer whitelist
  (`sanitizeProductHtml`, `sanitizeStyleAttr`) + `sanitizeSectionsHtml` (zapis).
  Obsługuje `text-align`, `color`, `font-family`, bezpieczne schematy URL.
- **`app/_lib/rich-text.ts`** (`normalizeEditorHtml`), **`description-fonts.ts`**
  (`FONT_OPTIONS`).
- Bloki treści: **`app/_lib/blocks.ts`** (typy, `CONTENT_BLOCK_DEFS`,
  `localizeBlock`, `validateBlockContent`), **`BlockForms.tsx`** (formularze
  admina, PL-only UI dla tekstów PL + osobne pola DE), **`ContentBlock.tsx`**
  (render → komponenty w `app/_components/blocks/`), **`AddBlockModal`**.

Decyzja architektoniczna (wybrana przez użytkownika: **hybryda**): bloki
zostają; bloki tekstowe stają się WYSIWYG; zdjęcia dostają opcje układu **na
poziomie bloku** (bez wklejania zdjęć w środek tekstu).

## Zakres

**W zakresie (Etap 1):** bloki treści współdzielone przez podstrony
(`/admin/podstrony`) i stronę główną (`/admin/strona-glowna`) — wspólny
`BlockForms`, więc jedna zmiana obejmuje oba.

**Poza zakresem (osobne etapy, ten sam uogólniony edytor):**
- Etap 2: opisy produktów (już używają `RichTextEditor` — po uogólnieniu
  przełączają się na wspólny moduł, bez zmian zachowania).
- Etap 3: zestawy (`BundlesEditor`) i pozostałe miejsca.

## Architektura

### 1. Wspólny edytor + sanitizer (uogólnienie istniejącego)

- Przenieść `RichTextEditor` do wspólnej lokalizacji (np.
  `app/admin/_shared/RichTextEditor.tsx`), rozłączając zależności produktowe:
  - upload zdjęcia przekazywany **propsem** (`onInsertImage`/`uploadFn`) zamiast
    twardego importu `uploadProductImage`;
  - `compressIfNeeded` z modułu współdzielonego (już istnieje w `_lib`).
  - **Prop `enableImage` (domyślnie `false`)** — w blokach tekstowych przycisk
    wstawiania obrazka jest ukryty (zgodnie z decyzją „bez zdjęć w tekście";
    zdjęcia idą przez bloki Galeria/Baner). Opisy produktów wołają z
    `enableImage: true`, żeby zachować dzisiejsze zachowanie.
- Uogólnić sanitizer: `sanitizeRichHtml(html)` w `app/_lib/rich-text.ts` (lub
  `rich-html.ts`) na bazie `sanitizeProductHtml`. `sanitizeProductHtml` zostaje
  jako cienki wrapper (bez zmian dla produktów; blokowane domeny allegro
  zostają — nieszkodliwe dla stron).
- Wspólna klasa CSS renderu, np. `.rich-text` (alias/rozszerzenie dzisiejszej
  `.product-description`), używana i w produktach, i w blokach — jeden wygląd
  nagłówków/list/wyrównania/kolorów.

Kryterium izolacji: edytor = jeden komponent, wejście `value: string` (HTML),
wyjście `onChange(html)`; nie wie nic o blokach ani produktach.

### 2. Nowy blok „Tekst" (`text`)

- Nowy typ treściowy `text` w `CONTENT_BLOCK_TYPES` + wpis w
  `CONTENT_BLOCK_DEFS` (nazwa „Tekst", opis, `defaultContent: () => ({ body: "" })`).
- Treść: `{ body: string(html), body_de?: string(html) }`. Bez osobnego pola
  nagłówka — nagłówki robi się w edytorze (H2–H4).
- Formularz `TextForm` w `BlockForms.tsx`: dwie instancje `RichTextEditor`
  (PL wymagane, DE opcjonalne), `enableImage:false`.
- Render `TextBlock.tsx`: `<section>` (max-w, padding jak inne bloki) →
  `<div class="rich-text" dangerouslySetInnerHTML={sanitized}>`. Wybór
  PL/DE per locale (fallback PL) — jak dziś `pickLoc`, ale dla HTML.

### 3. Baner

- **Treść (body)** → `RichTextEditor` (PL + DE) zamiast `<textarea>`.
  - Render: `<div class="rich-text">` zamiast `<p class="whitespace-pre-wrap">`.
  - Migracja: istniejące body to zwykły tekst (bez tagów) — sanitizer
    przepuszcza, renderuje się jako tekst inline. Utrata twardych złamań linii
    w starych danych jest akceptowalna (przy pierwszej edycji staje się
    poprawnym HTML). Nie robimy migracji danych.
- **Pozycja zdjęcia** (`layout`): dziś `left | right | background`. Dodajemy:
  - `center` — zdjęcie wyśrodkowane (max-w-3xl), tekst pod spodem.
  - `full` — zdjęcie na pełną szerokość sekcji, tekst pod spodem.
  - `left`/`right`/`background` — jak dziś (zdjęcie w naturalnych proporcjach
    dla left/right po ostatniej poprawce; background nadal `object-cover`).

### 4. Galeria

- **`caption_align`**: `left | center | right`, **domyślnie `center`**.
  Sterowane per galeria w formularzu; render dokłada odpowiednią klasę na
  `<figcaption>` (`text-left/center/right`).
- **`columns`**: `2 | 3 | masonry`, **domyślnie `masonry`** (obecne zachowanie:
  1 zdjęcie → pełna szerokość; 2 → 2 kolumny; 3+ → masonry). Wybór wymusza
  stałą liczbę kolumn zamiast auto.
- „Dwa zdjęcia obok siebie" = galeria z 2 zdjęciami (już działa — 2 → 2 kolumny).
  Nie tworzymy osobnego bloku.

## Model danych, i18n, bezpieczeństwo

- HTML trzymany w `content` (jsonb). **Sanityzacja przy zapisie** (w
  `validateBlockContent` dla `text` i `banner.body` → `sanitizeRichHtml` zamiast
  `cleanStr`) **oraz przy renderze** (defense-in-depth), jak w opisach.
- Nowe/rozszerzone pola treści:
  - `gallery`: `caption_align?: "left"|"center"|"right"`, `columns?: "2"|"3"|"masonry"`.
  - `banner`: `layout` rozszerzony o `center`|`full`; `body`/`body_de` = HTML.
  - `text`: `body`/`body_de` = HTML.
- Dwujęzyczność PL/DE utrzymana we wszystkich polach tekstowych (para pól jak
  dziś: `body` + `body_de`), z fallbackiem PL na `/de`.
- Limity długości: pola HTML (`text.body`, `banner.body`) mają własny cap
  `MAX_RICH = 20000` znaków HTML (po sanityzacji) — `MAX_LONG` (2000) jest za
  mały dla sformatowanej treści z tagami. Cap liczony po sanityzacji; za długie
  → błąd walidacji z komunikatem PL.

## Render (frontend)

- `ContentBlock.tsx`: nowy `case "text"` → `TextBlock`.
- `TextBlock.tsx`: nowy komponent (sanitized HTML + klasa `.rich-text`).
- `BannerBlock.tsx`: body renderowane jako HTML; dodane gałęzie `center`/`full`.
- `GalleryBlock.tsx`: `caption_align` → klasa na `figcaption`; `columns` →
  wybór klas kolumn (nadpisuje auto).
- `blocks.ts`: `localizeBlock` i typy (`LocalizedContentBlock` union + `text`,
  `LocalizedGalleryContent` o `caption_align`/`columns`, `LocalizedBannerContent`
  o rozszerzonym `layout` i HTML-owym `body`).

## Admin UI

- `AddBlockModal` / `CONTENT_BLOCK_DEFS`: nowy kafelek „Tekst".
- `BlockForms.tsx`: `TextForm` (nowy), `BannerForm` (body → `RichTextEditor`,
  wybór pozycji zdjęcia rozszerzony o center/full), `GalleryForm` (dodane:
  wyrównanie podpisów, liczba kolumn).
- `PageEditor.tsx` / `BlocksEditor.tsx`: podłączenie renderu `TextForm` w switchu
  (obok istniejących).

## Testy

- `blocks.test.ts`: rozszerzyć o `text` (walidacja/lokalizacja, sanityzacja
  HTML — skrypt/onerror wycięte), `banner.body` jako HTML, `gallery`
  `caption_align`/`columns` (defaulty, clamp złych wartości), rozszerzony
  `banner.layout` (center/full; śmieć → left).
- Reużyć istniejące testy sanitizera (`product-html.test.ts`) — po uogólnieniu
  wskazać na wspólny moduł.
- Wszystkie dotychczasowe testy zielone.

## Ryzyka / uwagi

- **Regresja opisów produktów** przy uogólnianiu edytora/sanitizera — zachować
  identyczne zachowanie (upload + `enableImage:true` + blokowane domeny). Testy
  produktowe muszą pozostać zielone.
- **SSR/hydration**: `immediatelyRender:false` już rozwiązane w istniejącym
  edytorze — przenieść bez zmian.
- **Stare body banera** (plain text) — patrz migracja wyżej; brak migracji
  danych, akceptowalny drobny efekt.
- **`images.unoptimized=true`** — render bloków używa zwykłego `<img>` (jak po
  ostatniej poprawce galerii/banera); edytor wstawia `<img>` tylko w produktach
  (`enableImage:true`).

## Poza zakresem (świadomie pominięte, YAGNI)

- Zdjęcia inline w środku tekstu bloków (użytkownik wybrał układ na poziomie
  bloku).
- Osobny blok „dwa zdjęcia" (pokrywa galeria z 2 zdjęciami).
- Etapy 2/3 (produkty, zestawy) — osobne spec/plan.
