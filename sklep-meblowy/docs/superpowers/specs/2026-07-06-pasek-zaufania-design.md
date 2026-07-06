# Pasek zaufania „Dlaczego warto kupować u nas?" — spec

**Data:** 2026-07-06
**Status:** zatwierdzony projekt (brainstorming z użytkownikiem)

## Cel

Sekcja zaufania (4 atuty sklepu) odtworzona **1:1 w HTML/CSS** z grafik
`docs/grafika-zaufanie-sklepu*.png` (wzorzec wierności — pozostają w repo),
osadzona w trzech miejscach. Decyzja: kod zamiast PNG — tłumaczy się na DE,
ostry na retinie, dark/light automatycznie, responsywny, 0 dodatkowych KB.

## Komponent `TrustBar`

`app/_components/ui/TrustBar.tsx` — server component (bez "use client", zero
JS klienta), props:

```ts
{ withHeading?: boolean; locale: Locale }
```

(locale przekazywane z page/layout jak w innych server components; teksty
przez `getDictionary(locale)`).

**Układ (wiernie do grafiki):**
- Opcjonalny nagłówek: eyebrow „MEBLE Z CHARAKTEREM" (złoty, uppercase,
  tracking szeroki — jak istniejące eyebrow sekcji) + H2 serif „Dlaczego warto
  kupować u nas?" (font-display, bold) — wyśrodkowane.
- Grid 4 kolumn (desktop) z pionowymi separatorami `border-l` między
  kolumnami; tablet 2×2; mobile 1 kolumna. Każda kolumna: duża ikona (SVG)
  wyśrodkowana, pod nią wiersz: złota ikonka checkbox (kwadrat z ✓) +
  pogrubiona etykieta; kolumna „dostawa" ma dodatkową szarą linię
  „na terenie całej Polski".
- **Ikony inline SVG** (odtworzone z grafiki, stroke-based):
  1. medal: podwójne kółko (zewn. ciemne, wewn. złote) z serif „PL" w środku,
  2. tarcza z złotym ✓,
  3. ciężarówka w ruchu (3 złote kreski pędu) ze złotym „0 zł" na skrzyni,
  4. tarcza ze złotym „2 / LATA".
- **Kolory wyłącznie ze zmiennych motywu** (`--fg`, `--muted`, `--border`,
  `--color-gold`, `--color-gold-text`) — kontury ikon `currentColor`/`--fg`
  (granat na jasnym, krem na ciemnym), akcenty złote. Dark mode działa sam
  (klasa `.dark`), bez podwójnych assetów.

**Słowniki** (`pl.ts` typ + wartości, `de.ts` wartości) — nowe klucze w sekcji
`trustBar`:

| klucz | PL | DE |
|-------|----|----|
| eyebrow | MEBLE Z CHARAKTEREM | MÖBEL MIT CHARAKTER |
| heading | Dlaczego warto kupować u nas? | Warum bei uns kaufen? |
| producer | Polski producent | Polnischer Hersteller |
| quality | Gwarancja jakości | Qualitätsgarantie |
| delivery | Darmowa dostawa | Kostenlose Lieferung |
| deliveryScope | na terenie całej Polski | in ganz Polen |
| warranty | 2 lata gwarancji | 2 Jahre Garantie |
| iconFree | 0 zł | 0 zł (na DE bez zmian — grafika marki) |

## Umiejscowienia

1. **Karta produktu** (`app/produkt/[id]/page.tsx`): `<TrustBar locale={locale} />`
   (bez nagłówka) bezpośrednio PO bloku opisu produktu (sekcje lub legacy
   description), a PRZED sekcją cross-sell. Gdy produkt nie ma żadnego opisu —
   bezpośrednio po sekcji głównej. Dotyczy wszystkich produktów (kod, nie dane).
2. **Strona główna** (`app/page.tsx`): `<TrustBar withHeading locale={locale} />`
   po sekcji polecanych produktów, przed sekcją kolekcji; kontener
   `max-w-7xl mx-auto px-6` + pionowe odstępy spójne z sąsiednimi sekcjami.
Umiejscowienia 1-2 dotyczą OBU drzew routingu (PL root i mirror `/de`) —
plan implementacji wskaże dokładne pliki: jeśli strony DE reużywają wspólnych
komponentów stron, zmiana jest jednokrotna; jeśli są mirrorami, TrustBar
trafia do obu.

3. **Stopka** (`app/_components/layout/Footer.tsx`): bez nagłówka, nad główną
   treścią stopki, na wszystkich stronach OPRÓCZ kart produktu (unikamy
   dublowania z punktem 1). Mechanizm: mały client wrapper
   `FooterTrustBar` (`"use client"`, `usePathname`) renderujący `TrustBar`
   tylko gdy ścieżka NIE jest kartą produktu; dopasowanie ścieżki jako czysta
   funkcja `isProductPath(pathname: string): boolean` w `app/_lib/routes.ts`
   (nowy plik) — true dla `/produkt/<id>` i `/de/produkt/<id>` — testowana
   vitestem. UWAGA: Footer jest server component z locale — wrapper dostaje
   już zrenderowane children (`<FooterTrustBar><TrustBar …/></FooterTrustBar>`),
   więc TrustBar pozostaje serwerowy.

## Wierność i weryfikacja

- **Porównanie side-by-side (Playwright, lokalny build):** zrzut sekcji
  TrustBar (jasny i ciemny motyw — przełączenie klasą `.dark`) obok PNG
  wzorca; ocena wizualna zgodności (układ, proporcje ikon, kolory, typografia)
  PRZED deployem — zgodnie z notatką projektu „verify UI with Playwright".
- **Vitest:** `isProductPath` (produkt PL, produkt DE, inne ścieżki, edge:
  `/produkty`-admin ≠ `/produkt/`); typowane słowniki wymuszają komplet DE.
- Pełny zestaw testów + `tsc` + `npm run build`.

## Poza zakresem (świadomie)

- Panel admina do edycji treści paska (statyczna treść w słownikach — jak
  stopka).
- Użycie PNG w runtime (zostają w `docs/` wyłącznie jako wzorzec).
- Strony koszyka/checkout — pasek trafia tam automatycznie przez stopkę,
  bez dedykowanych zmian.
