# Wybór czcionki w edytorze opisów — spec

**Data:** 2026-07-06
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

## Cel

Admin może zmieniać czcionkę fragmentów tekstu w opisach produktów (pole
opisu + sekcje opisu, PL i DE) — zamknięty zestaw 4 podstawowych czcionek
plus powrót do domyślnej.

## Mechanizm (zero nowych zależności)

Edytor to Tiptap 3.27; zainstalowany `@tiptap/extension-text-style` eksportuje
`FontFamily` (obok używanych już `TextStyle`, `Color`). FontFamily zapisuje
`<span style="font-family: …">` — ten sam wzorzec co działające kolory.

## Zamknięta lista czcionek

| etykieta w selekcie | wartość `font-family` (DOKŁADNY string) |
|---------------------|------------------------------------------|
| Domyślna            | *(brak — `unsetFontFamily()` usuwa styl)* |
| Elegancka (serif)   | `var(--font-display), serif`             |
| Georgia             | `Georgia, serif`                         |
| Arial               | `Arial, Helvetica, sans-serif`           |
| Courier             | `'Courier New', monospace`               |

- `var(--font-display)` = Playfair Display ładowany przez next/font
  (globals.css definiuje zmienną na :root — działa w adminie i na karcie;
  literal `'Playfair Display'` NIE zadziała, bo next/font nadaje unikalną
  nazwę rodziny).
- Pozostałe to czcionki systemowe/web-safe — nic nie trzeba ładować.

## Zmiany

1. **`app/admin/produkty/[id]/RichTextEditor.tsx`**
   - `import { TextStyle, Color, FontFamily } from "@tiptap/extension-text-style"`;
     `FontFamily` w `extensions`.
   - Toolbar: `<select>` „Czcionka" (stylistyka istniejących kontrolek,
     `title="Czcionka"`), opcje wg tabeli. onChange: wartość pusta →
     `editor.chain().focus().unsetFontFamily().run()`; inaczej
     `setFontFamily(stack)`. Wartość selecta =
     `editor.getAttributes("textStyle").fontFamily ?? ""` (odświeżana jak
     pozostałe stany toolbaru).
   - Stała `FONT_OPTIONS` (etykieta+stack) eksportowana z modułu wspólnego
     (patrz pkt 2), żeby toolbar i sanitizer miały JEDNO źródło prawdy.
2. **`app/_lib/product-html.ts`**
   - Eksport `ALLOWED_FONT_STACKS: Set<string>` (4 dokładne stacki z tabeli)
     — lub import z nowego wspólnego modułu `app/_lib/description-fonts.ts`
     (decyzja w planie; wymóg: toolbar i sanitizer współdzielą definicję).
   - `ALLOWED_STYLE_PROPS.span` dostaje `font-family`; `sanitizeStyleAttr`
     przepuszcza `font-family` TYLKO gdy wartość (po trim, bez rozróżniania
     wielkości liter i normalizacji cudzysłowów `"` ↔ `'`) jest na
     zamkniętej liście. Żadnych innych wartości (XSS-safe, spójność).
3. **Testy** (`app/_lib/__tests__/product-html.test.ts`): każdy dozwolony
   stack przechodzi; obce wartości (`url(...)`, losowa czcionka,
   `expression`) wycinane; kombinacja `color` + `font-family` w jednym
   stylu zachowuje obie deklaracje.

## Bez zmian

- Karta produktu: sanitizowane spany renderują się przez istniejące
  `dangerouslySetInnerHTML`; Playfair już załadowany, reszta systemowa.
- DE: sekcje/opisy DE przechodzą przez ten sam sanitizer — czcionki
  zachowane w tłumaczeniach.
- Guard/akcje zapisu — bez zmian (HTML płynie istniejącą ścieżką).

## Weryfikacja

- Unit: sanitizer (jak wyżej) — pełny zestaw vitest + tsc + build.
- E2E (Playwright, lokalny build, sesja admina) — BEZ zapisów do prod DB:
  select widoczny; wybór „Georgia" owija zaznaczenie
  `span[style*="font-family: Georgia"]` w DOM edytora (podgląd na żywo);
  „Domyślna" zdejmuje styl; wyjście przez dialog guarda „Wyjdź bez
  zapisywania". Ścieżkę zapis→render pokrywają testy sanitizera (identyczny
  mechanizm jak działające kolory).

## Poza zakresem (świadomie)

- Rozmiar czcionki / line-height (Tiptap je wspiera; nie zamówione — YAGNI).
- Wgrywanie własnych fontów.
- Zmiana czcionek globalnych sklepu.
