# Sticky header + przycisk „powrót na górę" — design

Data: 2026-07-06

## Cel

1. Cały header (TopBar z kontaktem + Navbar z kategoriami/szukajką) ma być
   widoczny po przewinięciu strony w dół — użytkownik od razu może wybrać
   cokolwiek z nawigacji.
2. Po przewinięciu w dół pojawia się w prawym dolnym rogu przycisk płynnego
   powrotu na samą górę.

## Diagnoza (dlaczego sticky nie działa dziś)

`Navbar` już ma `sticky top-0 z-50`, ale **`overflow-x: hidden` na `html, body`
w `globals.css` łamie `position: sticky`** — przodek z overflow innym niż
`visible`/`clip` staje się scroll-containerem elementu sticky i „odkleja" go.

## Zmiany

### 1. `app/globals.css` — naprawa sticky

`overflow-x: hidden` → `overflow-x: clip` (na `html, body`). `clip` tak samo
ucina poziomy scroll, ale nie tworzy scroll-containera, więc sticky działa.
(Wsparcie przeglądarek od 2022; bez ryzyka.)

### 2. `app/layout.tsx` — sticky wrapper na cały header

Decyzja użytkownika: **TopBar też się przykleja** (nie tylko Navbar).

```tsx
<HideOnAdmin>
  <div className="sticky top-0 z-50">
    <TopBar />
    <Navbar />
  </div>
</HideOnAdmin>
```

W `Navbar.tsx` z `<header>` schodzi `sticky top-0 z-50` (zostają tło, border,
backdrop-blur) — sticky przejmuje wspólny wrapper, co eliminuje szczeliny
1px między dwoma osobnymi elementami sticky przy ułamkowym zoomie.

### 3. `app/_components/layout/BackToTop.tsx` — nowy client component

- `"use client"`; nasłuch `scroll` (passive) → widoczny gdy `scrollY > 600`.
- Okrągły przycisk `fixed bottom-6 right-4 sm:right-6 z-40` (pod
  cookie-bannerem `z-50`, CartToast jest u góry — brak kolizji), strzałka ↑
  inline SVG, kolory ze zmiennych motywu (navy/gold, spójne dark/light),
  hover + focus ring jak w istniejących przyciskach.
- Klik: `window.scrollTo({ top: 0, behavior: "smooth" })`.
- Niewidoczny stan: `opacity-0 pointer-events-none` + transition (bez
  odmontowywania — płynne pojawianie, zero skoków layoutu, brak problemów
  z hydracją bo initial state = ukryty po obu stronach).
- `aria-label` ze słowników: wzorzec `getDictionary(useClientLocale())`
  (jak ImageGallery/ConfirmDialog). Nowy klucz `common.backToTop`
  (PL: „Wróć na górę", DE: „Zurück nach oben") w typie słownika + pl.ts + de.ts.
- Montaż w `app/layout.tsx` w istniejącym `<HideOnAdmin>` obok
  `Footer`/`CookieBanner` — nie renderuje się w panelu admina.

### 4. `app/_components/layout/CartToast.tsx` — korekta pozycji

Toast ma `fixed top-28` (112px) — mniej niż wysokość przyklejonego headera
(TopBar 36px + Navbar 96px = 132px), więc nachodziłby na nawigację.
Zmiana `top-28` → `top-36` (144px), tuż pod headerem.

## Testy / weryfikacja

- Słowniki: istniejący test paritetu PL↔DE pilnuje kompletu kluczy.
- `npx tsc --noEmit` + `npm run test` (406+).
- Smoke na dev serwerze: sticky wrapper obecny w HTML; wizualnie — scroll
  w dół → header przyklejony (TopBar + Navbar), przycisk ↑ pojawia się i
  wraca na górę; sprawdzić PL i /de oraz dark mode.

## Poza zakresem

- Chowanie/pokazywanie headera zależnie od kierunku scrolla (YAGNI).
- Kompaktowa wersja headera po przewinięciu (YAGNI).
- Panel admina (ma własny AdminShell, chrome sklepu tam nie występuje).
