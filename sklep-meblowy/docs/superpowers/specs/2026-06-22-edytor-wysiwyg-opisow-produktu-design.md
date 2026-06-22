# Spec: Edytor WYSIWYG opisów produktu (TipTap)

**Data:** 2026-06-22
**Status:** zaakceptowany (brainstorming) → do planu TDD
**Autorzy decyzji:** Mikołaj (właściciel kodu)

## Problem

Opisy produktu w panelu admina wpisuje się dziś w surowym polu `<textarea>` z
placeholderem „Treść sekcji. HTML dozwolony (akapity, listy, pogrubienia)".
Treść jest renderowana na karcie produktu jako **surowy HTML**
(`dangerouslySetInnerHTML`, po sanityzacji serwerowej). Gdy nietechniczna osoba
(Ola) pisze zwykły tekst z myślnikami i Enterami:

```
- Sofa rozkładana
- Tkanina wodoodporna
- 5 lat gwarancji
```

…HTML zjada znaki nowej linii i renderuje wszystko w **jednej linii**
(„- Sofa rozkładana - Tkanina wodoodporna - 5 lat gwarancji"). Placeholder
„HTML dozwolony" jest dla niej bezużyteczny. To zaprzecza zasadzie panelu:
„zero HTML, plain text inputs, trivial dla nietechnicznej osoby".

## Kluczowe ustalenie

**Magazyn, render i sanitizer już w pełni wspierają bogaty tekst.**
`sanitizeProductHtml` (`app/_lib/product-html.ts:13`) whitelistuje dokładnie:
`p, br, ul, ol, li, strong, em, b, i, a, h2, h3, h4, span` (linki z bezpiecznym
schematem http/https/mailto/tel). Render robi `dangerouslySetInnerHTML` po tej
sanityzacji.

Czyli **jedyne, czego brakuje, to UX pisania.** To zadanie jest **czysto
front-endowe**: wymiana pola wpisywania na edytor WYSIWYG produkujący ten sam
HTML, który system już obsługuje. **Bez migracji bazy, bez zmian renderu, bez
zmian whitelisty.**

## Cel i zakres

### Cel
Ola pisze i formatuje opisy produktu jak w Wordzie (pogrubienie, kursywa, listy
punktowane/numerowane, nagłówki, link) — widząc efekt na żywo, bez kontaktu z
HTML.

### W zakresie
- Nowy współdzielony komponent kliencki **`RichTextEditor`** (TipTap WYSIWYG).
- Wpięcie go w **3 miejsca** edycji treści (sekcja własna PL, override sekcji
  z BL, sekcja DE).
- **Sanitize-on-save** (utwardzenie obronne) w server actions zapisujących body.
- Testy czystych helperów + parytetu z sanitizerem.

### Poza zakresem (świadomie, YAGNI)
- Formularz „Nowy produkt" zostaje **minimalny** (nazwa/cena/kategoria → redirect
  do edytora). Opis dodaje się w edytorze, jak dziś.
- Brak zmian w **strukturze** sekcji opisu (akordeony tekstowe + zdjęcia między
  nimi). Naprawiamy *pisanie tekstu*, nie przebudowujemy modelu danych.
- Brak migracji istniejących treści (patrz „Przypadki brzegowe").

## Decyzje (zatwierdzone)
- **Zakres formatu:** pełne formatowanie (nagłówki, pogrubienie, kursywa, listy,
  linki).
- **Mechanizm:** TipTap (ProseMirror) — prawdziwy WYSIWYG, client-only, wyjście
  HTML. Odrzucone: własny contentEditable (krucha obsługa wklejania/list,
  przestarzały `execCommand`) oraz markdown (składnia techniczna, stratny
  round-trip z HTML-em z BL).
- **Nagłówki w treści:** H2 + H3 (sekcja ma już tytuł akordeonu jako nagłówek
  nadrzędny; H4 pomijamy).
- **Formularz „Nowy produkt":** zostaje minimalny.

## Architektura

### Komponent `RichTextEditor`
Plik: **`app/admin/produkty/[id]/RichTextEditor.tsx`** (`"use client"`),
współdzielony przez wszystkie 3 miejsca edycji.

API (drop-in zamiennik obecnych `<textarea>`):
```ts
type RichTextEditorProps = {
  value: string;                  // HTML wejściowy
  onChange: (html: string) => void; // HTML wyjściowy (znormalizowany)
  ariaLabel: string;              // dostępność (pole bez widocznego <label>)
  placeholder?: string;           // tekst-podpowiedź gdy pusto
};
```

Konfiguracja TipTap:
- `useEditor({ immediatelyRender: false, ... })` — **wymóg SSR Next 16**
  (inaczej hydration mismatch).
- Rozszerzenia skrojone **dokładnie pod whitelist** sanitizera: paragraph, bold,
  italic, bulletList, orderedList, listItem, heading (`levels: [2, 3]`), link.
  Wyłączone węzły/marki, których sanitizer i tak nie przepuści: codeBlock,
  blockquote, strike, horizontalRule, code.
- `Link` skonfigurowany pod sanitizer: protokoły http/https/mailto/tel,
  `HTMLAttributes: { rel: "noopener nofollow" }`, `openOnClick: false`.
- Wyjście: `editor.getHTML()` przepuszczone przez **`normalizeEditorHtml`**
  (patrz niżej) zanim trafi do `onChange`.

### Helper `normalizeEditorHtml` (czysta funkcja, testowalna)
```ts
// "<p></p>" / "" / sam whitespace  ->  ""   (puste = brak treści/override)
// w przeciwnym razie: przycięty HTML
function normalizeEditorHtml(html: string): string
```
Krytyczne, bo logika override/dirty w UI sprawdza `admin_body?.trim()` i
`section.body` — pusty edytor MUSI dawać `""`, nie `"<p></p>"`, inaczej:
- sekcja z BL fałszywie pokaże „(treść override)",
- dirty-tracking zostanie zafałszowany.

## Punkty integracji (ten sam komponent w 3 miejscach)

1. **Własna sekcja PL** — `DescriptionSectionsEditor.tsx` →
   `CustomTextSectionRow`, `<textarea>` pola `body` (dziś ~linia 540).
2. **Override sekcji z BL** — `DescriptionSectionsEditor.tsx` →
   `TextSectionRow`, `<textarea>` pola `admin_body` (dziś ~linia 412).
   Bonus: admin może wreszcie wizualnie edytować HTML zaimportowany z BL.
3. **Sekcja DE** — `TranslationEditor.tsx`, pole `body` DE
   (`onBodyChange`, dziś ~linia 282).

We wszystkich placeholder „HTML dozwolony" znika — zastępuje go ludzki tekst,
np. „Napisz opis — użyj paska do pogrubień i list".

## Pasek narzędzi / UX

Zestaw przycisków (mapowany 1:1 na dozwolone tagi), z podświetleniem aktywnego
stanu (`editor.isActive(...)`):

```
[ B ] [ I ] | [ • Lista ] [ 1. Lista ] | [ Nagłówek ▾ H2/H3 ] | [ 🔗 Link ] | [ ✕ Wyczyść ]
```

- **B** → bold, **I** → italic.
- **• Lista** → bulletList, **1. Lista** → orderedList.
- **Nagłówek** → przełącznik H2 / H3 (mały dropdown lub dwa przyciski).
- **Link** → prosty prompt o URL; walidacja schematu po stronie UI (http/https/
  mailto/tel), twardym strażnikiem pozostaje serwerowy sanitizer. Pusty URL na
  zaznaczeniu z linkiem = usuń link.
- **Wyczyść** → `unsetAllMarks` + `clearNodes` (ratunek po wklejeniu z Worda).

Styl spójny z `app/admin/_shared` / istniejącymi przyciskami panelu.

## Przepływ danych

- **Format bez zmian:** HTML string w `description_sections[].body`,
  `admin_body` oraz w sekcjach DE (`description_sections_de`). Kolumny JSONB
  bez zmian. **Brak migracji.**
- **Render bez zmian:** `app/produkt/[id]/page.tsx` sanityzuje przez
  `sanitizeProductHtml` → `ProductDescriptionSections` robi
  `dangerouslySetInnerHTML`.
- **Sanitize-on-save (nowość, obronnie):** server actions
  `updateProductDescriptionSections` i `saveProductDe`
  (`app/admin/produkty/actions.ts`) przepuszczają pola tekstowe
  (`body` / `admin_body` sekcji text, oraz body sekcji DE) przez
  `sanitizeProductHtml` **przed zapisem**. Dziś zapis NIE sanityzuje (tylko
  render) — to utwardzenie gwarantuje, że w bazie ląduje wyłącznie whitelistowany
  HTML, niezależnie od tego, co wypluje edytor. Render już sanityzuje, więc
  zero widocznej różnicy dla istniejących danych.

## Przypadki brzegowe i obsługa błędów

- **Pusty edytor** → `""` (przez `normalizeEditorHtml`), nie `"<p></p>"`.
- **Link z niebezpiecznym schematem** (`javascript:` itd.) → odrzucony w UI;
  serwerowy `hasSafeUrlScheme` to twardy strażnik.
- **Wklejanie z Worda / stron** → TipTap normalizuje do dozwolonych węzłów;
  sanitizer dobija resztę przy zapisie i renderze.
- **Istniejące treści (brak auto-migracji):** stare body wpisane „myślnikami
  jako plain text" wczytają się do edytora jako jeden akapit — dokładnie tak,
  jak renderują się dziś. Ola sformatuje je na nowo przy okazji edycji. Świadomie
  nie migrujemy automatycznie (ryzyko zepsucia istniejącego, poprawnego HTML z BL).
- **Zapis:** istniejący mechanizm toastów + dirty-tracking bez zmian.

## Testy

- **Czyste helpery (vitest):**
  - `normalizeEditorHtml`: pusty/`<p></p>`/whitespace → `""`; treść → przycięta.
  - **Parytet z sanitizerem:** HTML w stylu TipTap (`<h2>`, `<h3>`,
    `<ul><li>`, `<ol><li>`, `<strong>`, `<em>`, `<a href>`) przechodzi przez
    `sanitizeProductHtml` **bez zmian**; tag spoza whitelisty (np. `<div>`,
    `<script>`) wypada.
- **Sanitize-on-save:** test, że `updateProductDescriptionSections` i
  `saveProductDe` sanityzują body przed zapisem (np. wstrzyknięty `<script>`
  nie trafia do payloadu zapisu).
- **Sam komponent TipTap** (contentEditable) — bez ciężkich testów
  jednostkowych; cała logika nietrywialna wyniesiona do czystych helperów.
- **Bramki jakości:** `npx tsc --noEmit` (0), `npm run lint` (0),
  `npm test` (zielony), `npm run build` (Turbopack przechodzi) + ręczny smoke
  w `/admin/produkty/[id]` (pisanie listy, podgląd na karcie produktu PL i DE).

## Ryzyka i walidacja

- **TWARDY WARUNEK:** TipTap musi wspierać **React 19.2 + Next 16.2/Turbopack**.
  Stack: `next@16.2.4`, `react@19.2.4`. Wymaga TipTap **3.x** (3.x deklaruje
  wsparcie React 19). **Pierwszy krok planu** = instalacja + minimalny build/smoke
  edytora, ZANIM wepniemy go w 3 miejsca. Gdyby Turbopack/SSR gryzł — fallback do
  podejścia „zero-dep" (własny contentEditable) opisany w brainstormingu.
- **Bundle:** komponent client-only, ładowany wyłącznie w panelu admina — zero
  wpływu na bundle storefrontu. Rozważyć `next/dynamic` z `ssr: false` jeśli
  potrzebne.
- **Zależność:** świadomie dokładamy paczkę do projektu, który minimalizuje
  zależności (ręczny sanitizer zamiast DOMPurify). TipTap działa wyłącznie po
  stronie klienta, więc nie dotyka problemu ESM/jsdom na runtime Vercela, dla
  którego sanitizer pisano ręcznie.

## Stan obecny kodu (dla implementującego)

- **Render:** `app/_components/ui/ProductDescriptionSections.tsx:107` —
  `dangerouslySetInnerHTML={{ __html: body }}` (body sanityzowany w page.tsx).
- **Sanitizer:** `app/_lib/product-html.ts` — `sanitizeProductHtml`,
  `ALLOWED_TAGS` (linia 13), `ALLOWED_ATTRS_PER_TAG` (linia 31).
- **Edytor sekcji:** `app/admin/produkty/[id]/DescriptionSectionsEditor.tsx` —
  `TextSectionRow` (override `admin_body`, ~412), `CustomTextSectionRow`
  (`body`, ~540).
- **Edytor DE:** `app/admin/produkty/[id]/TranslationEditor.tsx` (body DE ~282).
- **Zapis:** `app/admin/produkty/actions.ts` —
  `updateProductDescriptionSections` (~383, dziś bez sanityzacji HTML),
  `saveProductDe` (~474, dziś zwykły trim).
- **Typ sekcji:** `app/_lib/types.ts` — `ProductDescriptionSection`.

## Dalsze kroki
Po akceptacji speca → plan TDD (`writing-plans`) z pierwszym krokiem
„walidacja TipTap na stacku" jako bramką, potem helpery (TDD) → komponent →
wpięcie w 3 miejsca → sanitize-on-save → bramki jakości.
