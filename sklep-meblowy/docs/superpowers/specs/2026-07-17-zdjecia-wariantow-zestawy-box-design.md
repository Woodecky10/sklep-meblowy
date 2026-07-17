# Spec: Zdjęcia per wariant + widoczność zestawów na karcie produktu

Data: 2026-07-17
Status: zatwierdzony projekt (podejście A+A)

Dwa niezależne, małe feature'y w jednym specu:

1. **Zdjęcia per wariant** — admin może dodać zdjęcia do każdej wartości opcji produktu; po wyborze wartości przez klienta zdjęcia trafiają na początek galerii.
2. **Widoczność zestawów** — box „Kup w zestawie" na karcie produktu pokazuje pełny skład zestawu z cenami i bezpośrednimi linkami do produktów składowych.

Żaden z nich nie wymaga migracji DB.

---

## Część 1: Zdjęcia per wariant

### Kontekst (stan obecny)

- Model wariantów = „tylko opcje" (kombinacje usunięte migracją 43). Opcje żyją w JSONB `products.variants` jako `ProductVariants { options: ProductOption[], overrides? }` (`app/_lib/types.ts:20-42`).
- `getVariantImages(product, selected)` (`app/_lib/variants.ts:69-74`) zwraca dziś **zawsze** `product.images` — zdjęć per wariant nie ma.
- Precedens „zdjęcie per wartość": katalog tkanin `fabrics.color_images` (próbki w `FabricSwatchGroup`) — pozostaje bez zmian, to inny mechanizm (globalny katalog, nie zdjęcia konkretnego mebla).

### Model danych

Rozszerzenie typu `ProductOption` (`app/_lib/types.ts`):

```ts
export type ProductOption = {
  name: string;
  values: string[];
  value_prices?: Record<string, number>;
  value_images?: Record<string, string[]>; // NOWE: wartość opcji → lista URL-i zdjęć
  filterable?: boolean;
};
```

- Przechowywanie: istniejący JSONB `products.variants` — **bez migracji**.
- Pliki: istniejący publiczny bucket Storage `products`, upload przez istniejącą akcję `uploadProductImage` (`app/admin/produkty/actions.ts:65-93`) — te same walidacje (MIME allowlist jpeg/png/webp/avif, 8 MB, rozszerzenie z MIME) i ta sama kompresja client-side (`image-compress.ts`, >800 KB → max 1 MB / 2400 px).

### Walidacja i higiena danych (server action)

`updateProductVariants` (`app/admin/produkty/actions.ts:240`) przy zapisie:

- akceptuje `value_images` tylko jako `Record<string, string[]>`; każdy element to niepusty string URL (http/https) o rozsądnej długości — wpisy niepoprawne odrzucane;
- **pruning**: wpisy `value_images` dla wartości nieobecnych w `values` są usuwane przy zapisie (analogicznie do czyszczenia pustych opcji w `VariantsEditor.save()`);
- puste tablice (`[]`) nie są zapisywane — klucz znika.

Sprzątanie Storage:

- **Usunięcie produktu**: URL-e z `value_images` wszystkich opcji dochodzą do zbioru kandydatów czyszczonych z bucketu — przez istniejący helper `imageUrlsToDelete` (`app/_lib/product-images.ts:9-25`), z zachowaniem ochrony URL-i współdzielonych między produktami (bliźniaki rozmiarowe).
- **Edycja wariantów** (usunięcie zdjęcia/wartości): parytet z dzisiejszym zachowaniem galerii — plik w Storage nie jest kasowany przy zapisie (osierocone pliki akceptowalne, jak dziś przy `updateProductImages`).

### Admin — edytor wariantów (`app/admin/produkty/[id]/VariantsEditor.tsx`)

- Przy każdej wartości opcji przycisk zdjęć z licznikiem (np. „📷 2"; 0 = ikona bez liczby).
- Klik rozwija pod wierszem wartości panel:
  - miniatury dodanych zdjęć z krzyżykiem do usunięcia (usunięcie tylko ze stanu, zapis dopiero przy „Zapisz warianty");
  - strefa uploadu: drag&drop + wybór plików, multi-upload — istniejący hook `useImageUpload` + `uploadImageFiles` (równoległość 3, kolejność zachowana), jak w galerii produktu (`ProductEditor.tsx:333-428`).
- Zapis razem z resztą wariantów istniejącym przyciskiem zapisu (`save()` → `updateProductVariants`). Zero nowych ekranów i akcji zapisu.
- UX prosty dla nietechnicznego admina: bez pól tekstowych na URL-e — tylko upload i usuwanie miniatur.

### Karta produktu (klient)

Jedyna zmiana logiki: `getVariantImages(product, selected)` (`app/_lib/variants.ts`):

1. Dla opcji w kolejności `product.variants.options`: jeśli wybrana wartość (`selected[option.name]`) ma niepuste `value_images` → dodaj jej zdjęcia.
2. Wynik: `[...zdjęciaWybranychWartości, ...product.images]` z deduplikacją URL-i (pierwsze wystąpienie wygrywa).
3. Brak wyboru / brak zdjęć wariantowych → `product.images` jak dziś.

Konsekwencje (bez zmian w kodzie galerii):

- `ProductMainSection` już liczy `images` ze `selected` i przekazuje do `ImageGallery`; galeria resetuje aktywne zdjęcie przy zmianie listy (`ImageGallery.tsx:20-25`) — po wyborze wariantu klient od razu widzi jego zdjęcie jako główne.
- **Koszyk**: pozycja dodawana z karty produktu dostaje jako `CartItem.image` pierwsze zdjęcie aktualnej (wariantowej) galerii, nie sztywno `product.images[0]`. Wymaga przekazania aktualnego pierwszego zdjęcia do `AddToCartButton` (przez `ProductActions`), jeśli dziś go nie dostaje.
- Próbki tkanin (`FabricSwatchGroup`) działają jak dziś — `value_images` jedynie dokłada zdjęcia do galerii po wyborze.

### Poza zakresem (część 1)

- Zdjęcia per kombinacja wartości (np. Kolor×Rozmiar) — świadomie nie wracamy do modelu sprzed migracji 43.
- Tłumaczenia DE — zdjęcia są neutralne językowo.
- Zmiany w katalogu tkanin (`fabrics`).
- Kasowanie plików Storage przy edycji (tylko przy usunięciu produktu, parytet z galerią).

---

## Część 2: Widoczność zestawów na karcie produktu

### Kontekst (stan obecny)

`BundleOffer.tsx` (renderowany w `ProductMainSection.tsx:162`, max 3 zestawy z `getBundlesForProduct`) pokazuje dziś: badge, **okrągłe awatary ≤3 pozostałych produktów bez linków**, nazwy tekstem („Razem z: …"), „Oszczędzasz od …", przycisk „Kup w zestawie" (modal `BundleConfigurator`) i link „Zobacz zestaw" → `/zestaw/[slug]`. Do produktów składowych nie da się przejść z karty — dopiero ze strony zestawu.

### Nowy wygląd boxu (przebudowa `BundleOffer.tsx`)

Dla każdego zestawu (nadal max 3):

```
[W zestawie taniej]  Nazwa zestawu
┌──────────────────────────────────────────┐
│ [img] Sofa VEGAS          1 999 zł        │  ← bieżący produkt: etykieta „ten produkt", BEZ linku
│  +                                        │
│ [img] Fotel VEGAS           899 zł   →    │  ← link do /produkt/[id]
│  +                                        │
│ [img] Pufa VEGAS            399 zł   →    │  ← link do /produkt/[id]
├──────────────────────────────────────────┤
│ Cena zestawu: od 2 967 zł   ~~3 297 zł~~  │
│ Oszczędzasz od 330 zł                     │
│ [ Kup w zestawie ]      Zobacz zestaw →   │
└──────────────────────────────────────────┘
```

Szczegóły:

- **Wiersz składnika**: miniatura ~48 px (`images[0]`, fallback `/placeholder.jpg`), nazwa zlokalizowana (`pickLocalized`, jak dziś w BundleOffer) z `line-clamp`, cena efektywna bazowa „od" (bez dopłat opcji — stąd „od"), waluta wg locale (PLN, na /de EUR — istniejące formatowanie używane dziś w tym komponencie).
- **Pokazujemy pełny skład** (łącznie z bieżącym produktem), w kolejności `position` z `bundle_items`. Bieżący produkt oznaczony etykietą „ten produkt" i nieklikalny; pozostałe to linki `localizeHref("/produkt/" + id, locale)`.
- **Podsumowanie**: suma cen bazowych składników przekreślona + „Cena zestawu: od X" (suma − `computeBundleDiscount(suma, 1, type, value)`) + istniejąca linia „Oszczędzasz od Y" (`minBundleSavings`). Jeśli w `app/_lib/bundles.ts` powstanie helper sumy zestawu — czysta funkcja z testem.
- **Przyciski bez zmian**: „Kup w zestawie" (modal `BundleConfigurator`) + „Zobacz zestaw →".
- Separator „+" między wierszami; przy 3 zestawach boxy układają się pionowo jak dziś.

### i18n

Nowe klucze w sekcji `bundle` słownika (`pl.ts` typ+wartości, `de.ts` nadpisania):

- `thisProduct` — „ten produkt" / „dieses Produkt";
- `bundlePriceFrom` — „Cena zestawu: od {price}" / odpowiednik DE (format zgodny z istniejącymi kluczami sekcji `bundle`, np. `savesFrom`).

Linki składników z sensownym `aria-label` (wzorzec jak istniejące aria-labels w komponentach UI).

### Poza zakresem (część 2)

- `/zestaw/[slug]`, `BundleConfigurator`, checkout i serwerowa weryfikacja rabatu (`verifyBundleGroup`) — bez zmian.
- Ceny z dopłatami opcji w wierszach składników (zawsze „od" ceny bazowej efektywnej).
- Zmiany limitu 3 zestawów na kartę.

---

## Testy

- **Unit — warianty**: `getVariantImages` — (a) brak wyboru → zdjęcia produktu; (b) wybrana wartość ze zdjęciami → wariantowe najpierw + produktowe, dedup; (c) dwie opcje ze zdjęciami → kolejność wg opcji; (d) wybrana wartość bez zdjęć → jak dziś.
- **Unit — akcja**: walidacja `value_images` w `updateProductVariants` (odrzucanie nie-URL-i, pruning usuniętych wartości, pomijanie pustych tablic).
- **Unit — zestawy**: helper sumy/ceny zestawu (jeśli wydzielony w `bundles.ts`).
- Istniejące testy (587) muszą pozostać zielone; smoke ręczny: karta produktu PL + `/de` (EUR, linki z prefiksem `/de`).

## Kryteria akceptacji

1. Admin dodaje zdjęcia do dowolnej wartości opcji (drag&drop, multi), usuwa je, zapisuje — bez dotykania URL-i ręcznie.
2. Klient po wyborze wartości z przypisanymi zdjęciami widzi je na początku galerii; bez wyboru galeria wygląda jak dotychczas.
3. Pozycja koszyka dodana z wybranym wariantem ma zdjęcie wariantu (jeśli istnieje).
4. Box zestawu na karcie produktu pokazuje wszystkie produkty zestawu z miniaturą, nazwą i ceną; produkty inne niż bieżący są klikalne i prowadzą na ich karty; działa na PL i /de (EUR).
5. Cena zestawu po rabacie i oszczędność zgodne z wyliczeniami `computeBundleDiscount`/`minBundleSavings`.
