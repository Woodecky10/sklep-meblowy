# Spec: Zdjęcia wariantów jako swatche (poza główną galerią)

Data: 2026-07-24
Status: zatwierdzony projekt

## Kontekst (stan obecny)

- `value_images` per wartość opcji żyją w JSONB `products.variants.options[].value_images`
  (`Record<string, string[]>`). Admin wgrywa je przy każdej wartości przyciskiem „📷"
  (`VariantsEditor.tsx` + `ValueImagesPanel`).
- `getVariantImages(product, selected)` (`app/_lib/variants.ts:72`) scala `value_images`
  WYBRANYCH wartości **każdej** opcji na początek galerii produktu → `ImageGallery`
  (miniatury + lightbox). Bez wyboru / bez zdjęć wariantowych → `product.images`.
- W katalogu `value_images` mają opcje: „Kolor nóżek" (54 produkty), „Strona" (20),
  „STELAŻ" (1). Opcja „Tkanina" — 0.
- Selektor `VariantSelector.tsx`: „Tkanina" → `FabricSwatchGroup` (swatche z katalogu
  `fabrics.color_images`, inny mechanizm); „Strona" → `CornerSideGroup` (kafelki SVG);
  pozostałe opcje → chipy tekstowe.
- Problem (zgłoszenie klienta): zdjęcia wariantów zaśmiecają główną galerię/lightbox.
  Mają zachowywać się jak próbki tkanin — miniatura przy wartości, bez wchodzenia
  do głównych zdjęć produktu.

## Cel

Zdjęcia `value_images` — **z wyjątkiem opcji strony narożnika** — nie wchodzą do
głównej galerii/lightboxa; pokazują się jako miniatury‑swatche przy wartościach
w selektorze (jak tkaniny). „Strona" i tkaniny bez zmian.

## Zakres — zatwierdzone zachowania

1. Duże zdjęcie i lightbox produktu ZAWSZE pokazują tylko `product.images`
   (dla opcji nie‑narożnikowych). Klik w swatch = **tylko wybór** wartości; nie
   zmienia głównego zdjęcia, zdjęcie wariantu nie trafia do lightboxa.
2. „Strona" (narożnik lewo/prawostronny) — **całkowicie nietknięta**: picker SVG
   bez zmian, a jej `value_images` DALEJ wchodzą do głównej galerii po wyborze
   (dokładnie jak dziś).
3. Pozostałe opcje z `value_images` (Kolor nóżek, STELAŻ, przyszłe) — renderują się
   jako swatche; ich zdjęcia znikają z głównej galerii.
4. Tkaniny bez zmian (swatche z katalogu).

## Model danych

Bez zmian, **bez migracji**. `value_images` zostają w DB; zmienia się tylko sposób
konsumpcji (galeria → selektor dla opcji nie‑narożnikowych).

## Zmiany

### `app/_lib/variants.ts`

- `getVariantImages`: w pętli po opcjach scalaj `value_images` **tylko** gdy
  `isCornerSideOptionName(opt.name)`; pozostałe opcje pomijaj. Reszta bez zmian
  (dedup URL‑i, fallback do `product.images` gdy brak zdjęć narożnika/wyboru).
  Import `isCornerSideOptionName` z `./corner-side` — bez cyklu (`corner-side.ts`
  importuje wyłącznie `./types`).
- Nowy czysty helper `optionHasValueImages(option: ProductOption): boolean` — `true`,
  gdy jakakolwiek wartość opcji ma niepustą tablicę `value_images`. Używany w selektorze.

### `app/_components/ui/VariantSelector.tsx`

Kolejność decyzji renderu opcji:

1. `option.name === FABRIC_OPTION_NAME` → `FabricSwatchGroup` (bez zmian)
2. `isCornerSideOptionName(option.name)` → `CornerSideGroup` (bez zmian)
3. `optionHasValueImages(option)` → **`ValueImageSwatchGroup` (NOWE)**
4. inaczej → chipy tekstowe (bez zmian)

Nowy komponent współlokowany `ValueImageSwatchGroup` (obok `FabricSwatchGroup`,
`CornerSideGroup`):

- Props: `values: string[]` (już posortowane `orderedValues`), `current: string | undefined`,
  `valuePrices`, `valueImages: Record<string, string[]>` (z `option.value_images`),
  `labelOf`, `locale`, `rate`, `onPick`.
- Render: siatka `grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3`. Każda wartość:
  przycisk (`aria-pressed`) z okrągłą miniaturą 64px = **pierwsze** `valueImages[v]?.[0]`;
  fallback gdy brak zdjęcia = tekst wartości w kółku (jak `FabricSwatchGroup`).
  Pod spodem etykieta (`labelOf(v)`) i dopłata (`+X` gdy `>0`, inaczej `formatMoney(0)`
  — spójnie z `FabricSwatchGroup`).
- Klik = `onPick(v)`. Bez „Zobacz więcej", bez kart grup, bez linków (YAGNI).
- Styl swatcha: okrągły 64px (jak tkaniny).

### Bez zmian

- `AddToCartButton`: logika `getVariantImages(...)[0]` zostaje. Dla opcji
  nie‑narożnikowych zdjęcie pozycji koszyka = `product.images[0]` (bo ich
  `value_images` nie ma już w `getVariantImages`) — spójnie z tkaninami. Dla
  narożnika — jak dziś.
- Admin: `VariantsEditor`, `ValueImagesPanel`, `updateProductVariants`,
  `cleanValueImages` — bez zmian (upload „📷" działa jak dotąd).
- `collectProductImageUrls` (kasowanie Storage przy usuwaniu produktu) — bez zmian.

## Poza zakresem

- Migracja / porządkowanie istniejących danych `value_images`.
- Wiele miniatur na wartość (pokazujemy tylko pierwsze zdjęcie).
- Powiększanie swatcha wariantu w lightboxie / osobny podgląd.
- `value_images` na opcji „Tkanina" (ignorowane w selektorze — używa katalogu;
  edge case, brak takich danych w DB).
- Zmiana wyglądu/UX tkanin i narożnika.
- Zmiana kształtu swatcha (okrągły; ewentualny zaokrąglony kwadrat — osobna decyzja).

## Testy

- `getVariantImages` (aktualizacja `app/_lib/__tests__/variants.test.ts`):
  - opcja nie‑narożnikowa (Tkanina/Kolor nóżek) z `value_images` wybrana →
    tylko `product.images` (**NOWE zachowanie** — zastępuje dotychczasowe asercje).
  - opcja narożnika („Strona") z `value_images` wybrana → zdjęcia narożnika na
    początku + `product.images`, z dedup (jak dziś).
  - brak wyboru / brak `variants` → `product.images`.
  - dwie opcje wybrane (narożnik + nie‑narożnik) → scala tylko narożnik.
- `optionHasValueImages` — `true` gdy jest niepusta tablica, `false` gdy brak/puste.
- `VariantSelector`: opcja z `value_images` renderuje swatche (miniatura + etykieta),
  klik woła `onChange`; opcja bez zdjęć → chipy tekstowe. (Jeśli brak testów
  komponentu — smoke ręczny + weryfikacja Playwright.)
- Wszystkie istniejące testy (661) pozostają zielone.

## Kryteria akceptacji

1. Karta produktu z opcją „Kolor nóżek" (ma zdjęcia): wartości pokazują się jako
   miniatury‑swatche; po wyborze duże zdjęcie i lightbox pokazują wyłącznie zdjęcia
   produktu.
2. Narożnik lewo/prawostronny wygląda i działa identycznie jak przed zmianą
   (kafelki SVG + jego zdjęcia w głównej galerii po wyborze strony).
3. Tkaniny bez zmian.
4. Brak regresji w koszyku (sensowne zdjęcie pozycji) na PL i `/de`.
