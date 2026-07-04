# Warianty bez kombinacji (model „tylko opcje") — design

Data: 2026-07-04. Zatwierdzone przez użytkownika (podejście A — pełne usunięcie).

## Kontekst i problem

Dziś `products.variants` = `{ options, combinations, overrides? }`. **Opcje** to wybory
klienta (Kolor/Tkanina/Strona) z opcjonalną **dopłatą per wartość** (`value_prices`,
pole „+zł"). **Kombinacje** to automatycznie generowany iloczyn kartezjański wszystkich
wartości; każdy wiersz trzyma per-kombinacja: `stock`, `price_modifier` (= suma dopłat),
`sale_price`, `omnibus_price`, `images`.

Kombinacje powstały **pod BaseLinker** (per-kombinacja stan/SKU do synchronizacji).
BaseLinker jest wycofywany (patrz `project_baselinker` w pamięci; migracja 34 zdjęła
integrację), więc per-kombinacja stan/promocja/zdjęcia są **zbędne**. Właściciel zarządza
wszystkim przez: **Opcje + dopłaty** (cena) oraz **poziom produktu** (stan, cena
promocyjna, Omnibus, zdjęcia). Tabela kombinacji to dziś zbędny, przytłaczający balast
(np. 20 tkanin × 2 strony = 40 wierszy).

## Decyzje produktowe

1. **Model „tylko opcje".** Opcje służą wyłącznie do wyboru przez klienta. `combinations`
   znika z modelu.
2. **Cena** = `product.price` + suma dopłat wybranych wartości (`sumValueSurcharges`).
3. **Stan, cena promocyjna, Omnibus, zdjęcia — na poziomie produktu** (pola już istnieją
   na `Product`).
4. **Dopłata dolicza się także do ceny promocyjnej i linii Omnibus** (Wariant 1): regularna
   = `base + dopłata`, promocyjna = `sale + dopłata`, Omnibus = `omnibus + dopłata`. Dopłata
   to stały dodatek do dowolnej aktywnej ceny bazowej.
5. **Cena promocyjna i stan na poziomie produktu są dozwolone RÓWNIEŻ dla produktów z
   opcjami** (dziś zablokowane) — bo promo/stan są teraz produktowe.

## Podejście (wybrane: A — pełne usunięcie)

Usuwamy typ `ProductVariant` i pole `combinations` z modelu oraz całą logikę per-kombinacja.
Funkcje wariantów liczą cenę z `product.price + dopłaty opcji`, resztę z poziomu produktu.
Migracja czyści `combinations` z `variants` JSON w bazie.

Odrzucone: **B** — zostawić puste `combinations` + fallback. Mniej ryzykowne, ale zostawia
martwe pole/kod i niespójny model. Użytkownik wybrał czysty stan końcowy.

## Model danych — `app/_lib/types.ts`

- **Usuń** typ `ProductVariant` (per-kombinacja: `values/stock/price_modifier/sale_price/
  omnibus_price/images`).
- **Usuń** `combinations` z `ProductVariants`. Nowy kształt: `ProductVariants = { options:
  ProductOption[]; overrides?: {...} }`.
- **Zostaje** `ProductOption` (w tym `value_prices`), `overrides` (`option_names`,
  `value_labels`), `OrderItem.variant_values` (zapis wyboru klienta — bez zmian).

## Funkcje — `app/_lib/variants.ts`

**Usuń:** `findVariant`, `cartesianProduct`, `rebuildCombinations`, `applyValuePricing`
(mutowała kombinacje), `isOptionValueAvailable` (wyszarzanie po stanie per-kombinacja —
brak stanu per wariant).

**Uprość (liczą z produktu + dopłat):**
- `getVariantPrice` → `product.price + sumValueSurcharges(product.variants?.options ?? [], selectedValues)`.
- `getVariantStock` / `totalProductStock` → `product.stock`.
- `getVariantSalePrice` → `product.sale_price + sumValueSurcharges(...)` gdy `sale_price != null`, inaczej `null`. (Realizuje decyzję 4: dopłata dolicza się do promo.)
- `getVariantOmnibus` → `product.omnibus_price + sumValueSurcharges(...)` gdy `omnibus_price != null`, inaczej `null`.
- `getVariantImages` → `product.images` (brak zdjęć per kombinacja).
- `getVariantEffectivePrice` / `isVariantOnSale` — bez zmian w kodzie (składają regularną
  i promocyjną, które teraz zawierają dopłatę → matematyka `effectivePrice`/`isOnSale`
  spójna: on-sale ⇔ `sale < base`).

**Zostaje bez zmian:** `hasVariants` (opcje > 0), `isVariantSelectionComplete`,
`variantKey` (klucz koszyka/pozycji — wciąż potrzebny), `formatVariantLabel`,
`getOptionDisplayName`, `getValueDisplayLabel`, `sumValueSurcharges`, `usesValuePricing`,
`expandFabrics`, `fabricValueBelongsTo`, `buildFabricDeMap`, `buildFabricImageMap`.

**Uprość (opcje-only):** `applyFabricSelection` — ustawia/usuwa opcję „Tkanina" + dopłaty,
bez `rebuildCombinations`/`applyValuePricing` (zwraca tylko `{ options }`).

## Cennik i Omnibus

- Cena regularna wybranej konfiguracji = `base + Σ dopłat`. Efektywna = promocyjna gdy w
  promocji, inaczej regularna. Wszystkie trzy poziomy (regularna/promo/Omnibus) niosą tę
  samą dopłatę → porównania i przekreślenia działają poprawnie.
- Omnibus/historia cen: **na poziomie produktu** (jeden wpis, `variant_key = null`).
  Śledzi najniższą cenę bazową z 30 dni; dopłata jest dodatkiem przy wyświetlaniu.
- `pricing.ts`: `computePriceUpdates`/`PriceUnit` już wspiera `variant_key: null` — bez
  zmian. `findInvalidVariantSale` upraszcza się do walidacji jednej ceny produktowej
  (`sale < base`).
- `price-history.ts`: `recordPriceHistory` tworzy JEDEN `PriceUnit` produktowy
  (`variant_key: null`, `regular = base`, `sale = product.sale_price`). Usuń pętlę po
  kombinacjach. RPC `apply_price_changes` działa dalej (denormalizacja tylko
  `products.omnibus_price`; `p_variants` = null).

## Sklep / checkout / koszyk

- `ProductActions.tsx`, `ProductMainSection.tsx`, `VariantSelector.tsx` — **bez zmian w
  kodzie** (helpery liczą inaczej pod spodem; VariantSelector czyta `value_prices`).
- `app/api/checkout/route.ts` — zamiast `findVariant` + `variant.price_modifier/sale_price`:
  `regular = product.price + sumValueSurcharges(options, item.variantValues)`,
  `unitPrice = effectivePrice(regular, product.sale_price ? product.sale_price + Σdopłat : null)`.
  Nadal `isVariantSelectionComplete` bramkuje i zapisuje `variant_values` (bez zmian).
- `CartContext.tsx` — bez zmian (`variantKey` zostaje).
- Znika wyszarzanie „niedostępnych" wartości (`isOptionValueAvailable`) — wszystkie
  wartości wybieralne (sklep na zamówienie). Zaktualizować wywołania w komponentach opcji.

## Admin

- **`VariantsEditor.tsx`**: usuń całą podsekcję „Kombinacje" (nagłówek + lista) i komponent
  `CombinationRow`. Zostają: nagłówek, „Opcje" (OptionRow + dopłaty), przyciski
  (Dodaj opcję / katalog tkanin / toggle Strona), przycisk „Zapisz warianty". Stan lokalny
  trzyma tylko `{ options, overrides }`.
- **`updateProductVariants` (`actions.ts`)**: waliduje tylko opcje + `value_prices`
  (nieujemne, skończone). Usuń walidację/build kombinacji i per-combo sale. Zapisuje
  `{ options, overrides }`. Po zapisie `recordPriceHistory` (produktowy).
- **`updateProductBasics` (`actions.ts`)**: usuń blokadę `sale_price`/`stock` dla produktów
  z wariantami — teraz zawsze produktowe. (`productHasVariants` guard znika.)
- **`ProductEditor.tsx`**: odblokuj pola „Cena promocyjna" i „Stan magazynowy" (usuń
  `disabled={hasVariants(product)}`); zaktualizuj podpowiedzi (bez „ustaw per kombinacja").
- **`app/admin/produkty/page.tsx`**: `variantCount` = `variants?.options.length ?? 0`;
  stan = `product.stock`.

## Narożniki / tkaniny / nowy produkt

- **`corner-side.ts`** `applyCornerSideSelection`: włączanie = dodaj opcję „Strona"
  (`CORNER_SIDE_VALUES`) na początek `options`; wyłączanie = usuń opcje side-like. Bez
  mnożenia/kolapsu kombinacji, bez `rebuildCombinations`/`applyValuePricing`. Idempotentne.
- **`new-product.ts`** `buildNewProductPayload`: dla `naroznik-l` zwraca
  `{ options: [Strona] }` (bez `combinations`); inaczej `variants: null`.

## Migracja danych

- Nowa migracja SQL: usuń klucz `combinations` z `variants` JSON wszystkich produktów
  (`update products set variants = variants - 'combinations' where variants ? 'combinations'`).
- **Konsekwencje (zaakceptowane):** produkty z promocją/stanem/zdjęciami per kombinacja
  tracą te dane. Właściciel ustawia promocję/stan na poziomie produktu (pola odblokowane),
  zdjęcia idą do galerii produktu. Dopłaty per wartość (`options.value_prices`) NIENARUSZONE.

## Testy

- **Usuń** `variant-combinations.test.ts` (funkcje usunięte).
- **Przepisz** `variants.test.ts` (cena z dopłat; stan/zdjęcia/sale/omnibus produktowe),
  `variant-value-pricing.test.ts` (zostają testy `sumValueSurcharges`; usuń
  `applyValuePricing` na kombinacjach), `corner-side.test.ts` (add/remove opcji, bez ×2),
  `new-product.test.ts` (payload bez kombinacji), `fabrics.test.ts` (opcje-only),
  `pricing.test.ts` (`findInvalidVariantSale` produktowy).
- Dodaj testy: `getVariantPrice`/`getVariantSalePrice`/`getVariantOmnibus` doliczają
  dopłatę (w tym scenariusz promo: `sale + dopłata`).

## Nie-cele (YAGNI)

- Stan/SKU per wariant (były pod BaseLinker — usuwane).
- Zdjęcia per wybór wariantu (galeria produktu wystarcza).
- Promocje/Omnibus per wariant.
- Zmiana ścieżki DE/i18n (etykiety wyboru bez zmian).

## Znane konsekwencje (zaakceptowane)

- Omnibus staje się produktowy (jedna najniższa-z-30-dni na produkt) — spójne, bo promocje
  są produktowe.
- Stare koszyki localStorage z narożnikiem/tkaniną: checkout i tak rewaliduje wybór.
- Wyszukiwarka/ostatnio-oglądane pokazują cenę produktową (bez dopłat) — compliance-safe.

## Gałąź i wdrożenie

- Gałąź `feat/warianty-bez-kombinacji` od `main` (po zmergowaniu zwijanych sekcji).
- Przed pisaniem kodu: przeczytać docsy Next w `node_modules/next/dist/docs/` (AGENTS.md).
- Migracja aplikowana ręcznie w Supabase (jak reszta). ⚠️ localhost = ta sama baza co prod.
- Po implementacji: weryfikacja (tsc/eslint/testy/build) + smoke; merge do main; push = deploy.
