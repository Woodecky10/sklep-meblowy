# Lightbox zdjęć na stronie tkaniny (wzornik + zdjęcia z produkcji)

Data: 2026-07-21. Zatwierdzone przez użytkownika. Follow-up do 2026-07-21-grupy-cenowe-tkanin
(PR #71) i 2026-07-21-zdjecia-produkcji-tkanin (PR #73). Wyłącznie frontend — brak migracji.

## Kontekst i problem

Na `/tkaniny/[slug]` są dwie siatki zdjęć: **wzornik** (próbki kolorów z
`fabrics.color_images`, kafelki `aspect-square object-cover`, numer koloru pod
spodem) oraz **zdjęcia z produkcji** (`fabrics.production_photos`, kafelki
`aspect-[4/3] object-cover`, część z podpiętym aktywnym produktem → dziś całe
zdjęcie jest linkiem do `/produkt/[id]`). Zdjęcia są kadrowane (`object-cover`) i
nieklikalne (poza tymi z produktem) — klient nie zobaczy pełnego, nieprzyciętego
zdjęcia. Cel: klik zdjęcia → pełny podgląd (lightbox).

Obie siatki są dziś renderowane inline w server-componentcie
`app/tkaniny/[slug]/page.tsx`. Lightbox wymaga interaktywności (stan open/close,
klawisze) → potrzebne komponenty klienckie.

## Cel

1. Klik zdjęcia próbki we wzorniku (tylko te ze zdjęciem) → lightbox z pełnym
   zdjęciem, nawigacja między próbkami mającymi zdjęcie.
2. Klik **każdego** zdjęcia z produkcji → lightbox z pełnym zdjęciem, nawigacja
   między zdjęciami z produkcji.
3. Zdjęcia z produkcji z podpiętym aktywnym produktem: klik zdjęcia = lightbox;
   pod zdjęciem osobny link (nazwa produktu) → `/produkt/[id]`.
4. Prosty lightbox: ciemny overlay, `object-contain`, zamykanie klik-tło / Esc /
   X, strzałki ‹ › + klawisze ←/→, podpis. Bez zoomu/panu.

## Nie-cele (YAGNI)

- Zoom/pan (jak w galerii produktu `ImageGallery`) — próbki i zdjęcia oglądamy w
  pełnym kadrze, to wystarcza.
- Nowe stringi PL/DE — reużywamy istniejące klucze a11y (`t.a11y.zoomImage`,
  `t.a11y.prevImage`, `t.a11y.nextImage`, `t.common.close`) i nazwę produktu jako
  tekst linku.
- Lightbox dla miniatur w katalogu `/tkaniny` (lista) i w selektorze na karcie
  produktu — poza zakresem.
- Refaktor istniejącego `ImageGallery` na wspólny lightbox — zostaje jak jest
  (inny UX: zoom/pan/miniatury). Nowy `ImageLightbox` jest osobny i prostszy.
- Osobne hi-res wersje zdjęć — lightbox pokazuje ten sam wgrany plik, tyle że
  `object-contain` (nieprzycięty), nie miniaturę.

## Architektura / komponenty

**`app/_lib/fabric-swatch-images.ts`** (czysty, testowalny):
```ts
export type SwatchImage = { code: string; url: string };
// Próbki mające zdjęcie, w kolejności `colors`. Pomija kody bez URL http(s).
export function swatchImages(
  colors: string[],
  images: Record<string, string>
): SwatchImage[];
```
Pojedyncze źródło prawdy o tym, które próbki są klikalne i w jakiej kolejności
nawiguje lightbox wzornika.

**`app/_components/ui/ImageLightbox.tsx`** (`"use client"`) — wspólny, **sterowany**
lightbox:
```ts
type LightboxImage = { src: string; caption?: string };
function ImageLightbox({
  images, index, onClose, onIndexChange, alt,
}: {
  images: LightboxImage[];
  index: number | null;      // null = zamknięty
  onClose: () => void;
  onIndexChange: (i: number) => void;
  alt: string;
}): JSX.Element | null;
```
- `index === null` → renderuje `null`.
- Overlay `fixed inset-0 z-[100] bg-black/90`, klik-tło → `onClose`; wewnętrzny
  kontener `stopPropagation`. Zdjęcie jako surowy `<img className="max-w-full
  max-h-[85vh] object-contain">` (z `eslint-disable-next-line @next/next/no-img-element`
  — spójnie z resztą UI tkanin, która renderuje próbki przez `<img>`; bez założeń
  o zdalnych domenach `next/Image`). Bez handlerów zoom/pan.
- Strzałki ‹ › (gdy `images.length > 1`) → `onIndexChange((i±1+n)%n)`; X → `onClose`;
  podpis (`images[index].caption`) na dole, gdy jest.
- `useModal(index !== null, { onClose, containerRef, trapFocus: true })` —
  scroll-lock, Esc, focus-trap (jak `ImageGallery`). Klawisze ←/→ przez
  `useEffect` z `document.addEventListener("keydown")` aktywne tylko gdy otwarty.
- a11y: `role="dialog" aria-modal="true" aria-label={alt}`; przyciski z
  `t.a11y.prevImage/nextImage`, `t.common.close` (własny `useClientLocale` +
  `getDictionary`, wzorzec `ImageGallery`).

**`app/_components/ui/FabricSwatchGrid.tsx`** (`"use client"`):
- Props `{ colors: string[]; images: Record<string, string>; name: string }`.
- Renderuje dotychczasową siatkę `figure` (kafelek `aspect-square` + `figcaption`
  numer). Kafelek z URL (`images[code]`) → `<button>` otwierający lightbox
  (`aria-label={t.a11y.zoomImage}`), kafelek bez URL → dotychczasowy placeholder
  z numerem (nieklikalny).
- Stan `openIndex: number | null`; lista = `swatchImages(colors, images)` →
  `images` do `ImageLightbox` (`caption = code`, `alt = name`). Kliknięcie kafelka
  ustawia `openIndex` na pozycję w tej liście.

**`app/_components/ui/FabricProductionPhotos.tsx`** (`"use client"`):
- Props `{ photos: { url: string; product: { id: string; name: string } | null }[]; fabricName: string }`
  (server przekazuje już rozwiązane, aktywne produkty).
- Siatka `grid-cols-2 md:grid-cols-3 gap-6`. Każde zdjęcie → `<button>` (kafelek
  `aspect-[4/3] object-cover`, `aria-label={t.a11y.zoomImage}`) otwierający
  lightbox (zestaw = wszystkie `photos`, `caption` = nazwa produktu jeśli jest,
  `alt = fabricName`). Gdy `product` != null → pod zdjęciem `LocalizedLink` do
  `/produkt/${product.id}` z tekstem = nazwa produktu (styl linku: gold,
  `group-hover`, strzałka „→").
- Stan `openIndex: number | null`.

**`app/tkaniny/[slug]/page.tsx`** (server, edycja):
- Nagłówki `<section>`+`<h2>` „Wzornik kolorów" / „Ta tkanina na naszych meblach"
  zostają server-side (bez zmian tekstów).
- Wzornik: siatkę `div.grid` z `figure`ami zastępuje
  `<FabricSwatchGrid colors={colors} images={fabric.color_images ?? {}} name={pickLocalized(fabric.name, fabric.name_de, locale)} />`.
- Zdjęcia z produkcji: dotychczasowy lookup `linkedProducts` (Map, tylko aktywne)
  zostaje; buduję `photos = photos.map(p => ({ url: p.url, product: (p.product_id && linkedProducts.get(p.product_id)) ? { id, name: pickLocalized(name, name_de) } : null }))`
  i renderuję `<FabricProductionPhotos photos={photos} fabricName={pickLocalized(fabric.name, fabric.name_de, locale)} />`. Warunek `photos.length > 0` (sekcja ukryta przy braku) — bez zmian.

## Przypadki brzegowe

- Wzornik bez żadnego zdjęcia (same numery) → brak klikalnych kafelków, lightbox
  nigdy się nie otworzy (lista pusta); sekcja renderuje się jak dziś.
- Zdjęcie z produkcji bez produktu → klik = lightbox, brak linku pod spodem.
- Podpięty produkt zdezaktywowany → server nie doda go do `linkedProducts` →
  `product: null` → zdjęcie tylko w lightboxie, bez linku (spójne z obecnym
  zachowaniem render-time).
- Pojedyncze zdjęcie w zestawie → lightbox bez strzałek (`length === 1`).
- Klik linku produktu NIE otwiera lightboxa (osobny element pod zdjęciem, nie
  nakłada się na przycisk-zdjęcie).

## Pliki dotknięte

- **Nowe:** `app/_lib/fabric-swatch-images.ts`; `app/_lib/__tests__/fabric-swatch-images.test.ts`;
  `app/_components/ui/ImageLightbox.tsx`; `app/_components/ui/FabricSwatchGrid.tsx`;
  `app/_components/ui/FabricProductionPhotos.tsx`.
- **Edycja:** `app/tkaniny/[slug]/page.tsx` (podmiana obu siatek na komponenty
  klienckie; budowa propsów `photos`).
- **Bez zmian:** baza/migracje/API, `color_images`/`production_photos` (odczyt),
  reszta strony tkaniny, `ImageGallery`, katalog `/tkaniny`.

## Testy

- **Unit (pure):** `swatchImages` — kolejność wg `colors`, pomija kody bez URL /
  z URL nie-http(s), pusta mapa → `[]`.
- Lightbox + komponenty klienckie: `tsc` + lint + build + smoke po deployu
  (Playwright / ręcznie): klik próbki i zdjęcia z produkcji otwiera pełny podgląd,
  Esc/klik-tło/X zamyka, strzałki działają, link produktu prowadzi do karty.

## Uwagi wdrożeniowe

- Deploy = merge PR do main; brak migracji → nic do sprawdzania w bazie.
- Konto gh: Woodecky10.
