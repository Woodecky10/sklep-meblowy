# Omnibus — przeceny per wariant + najniższa cena z 30 dni

**Data:** 2026-06-24
**Branch:** `feat/omnibus-przeceny`
**Status:** zaakceptowany design, przed planem implementacji

## Problem / wymóg prawny

Dyrektywa Omnibus (w PL: art. 4 ustawy o informowaniu o cenach towarów i usług) wymaga,
że **przy każdej obniżce ceny** obok ceny promocyjnej trzeba uwidocznić **najniższą cenę
towaru z 30 dni przed wprowadzeniem obniżki**. Sklep nie ma dziś żadnego mechanizmu przecen
per produkt (`products.price` to jedyna cena; `promo_codes` to osobny mechanizm rabatów na
koszyk) ani historii cen.

## Decyzje (z brainstormingu)

- **Najniższa cena z 30 dni: automatycznie** z historii cen (nie ręcznie) — najbardziej
  zgodne z UOKiK i odporne na pomyłki.
- **Zakres: per wariant (kombinacja)** — świadomie wybrana granularność; produkty bez
  wariantów mają promocję na poziomie produktu.
- **Wpisywanie: kwotowo** — admin wpisuje cenę promocyjną w zł (absolutną), nie procent.

## 1. Model danych — migracja `supabase/migrations/36_omnibus_pricing.sql`

```sql
-- Cena promocyjna + zdenormalizowana najniższa-z-30-dni na poziomie produktu
-- (dla produktów BEZ wariantów; przy wariantach promocja jest per kombinacja).
alter table products
  add column if not exists sale_price    numeric(10,2) check (sale_price >= 0),
  add column if not exists omnibus_price numeric(10,2) check (omnibus_price >= 0);

-- Historia cen efektywnych (źródło prawdy do liczenia najniższej-z-30-dni).
create table if not exists public.price_history (
  id              uuid primary key default uuid_generate_v4(),
  product_id      uuid not null references public.products(id) on delete cascade,
  variant_key     text,                       -- null = poziom produktu; inaczej klucz kombinacji
  effective_price numeric(10,2) not null check (effective_price >= 0),
  recorded_at     timestamptz not null default now()
);
create index if not exists idx_price_history_unit
  on public.price_history (product_id, variant_key, recorded_at);

-- RLS: odczyt publiczny (do wyliczeń server-side przez admin client i tak omija RLS;
-- public read nie szkodzi — to tylko ceny), zapis tylko admin.
alter table public.price_history enable row level security;
create policy "price_history: public read"
  on public.price_history for select to anon, authenticated using (true);
create policy "price_history: admin write"
  on public.price_history for all to authenticated
  using (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin')
  with check (auth.jwt() -> 'app_metadata' ->> 'role' = 'admin');

-- Seed: bieżąca cena każdego istniejącego produktu jako punkt startowy historii
-- (poziom produktu). Dzięki temu pierwsza obniżka ma referencję 30-dni = cena regularna.
insert into public.price_history (product_id, variant_key, effective_price, recorded_at)
select id, null, price, created_at from public.products;
```

Typy (`app/_lib/types.ts`):
```ts
// ProductVariant:
sale_price?: number;     // promocja per kombinacja (absolutna, zł)
omnibus_price?: number;  // najniższa z 30 dni dla tej kombinacji (denormalizacja)

// Product:
sale_price: number | null;
omnibus_price: number | null;
```
Przechodzą przez `select("*")` + `localizeProduct` (`...row`) bez zmian (kwoty są
walutowo-neutralne; EUR liczone przy wyświetlaniu).

## 2. Czysta logika cen — `app/_lib/pricing.ts` (bez zależności server-only)

```ts
export type PriceHistoryRow = { effective_price: number; recorded_at: string };

// Cena efektywna = promocyjna jeśli ustawiona i NIŻSZA od regularnej, inaczej regularna.
export function effectivePrice(regular: number, salePrice: number | null | undefined): number;

// Czy jednostka jest w promocji (sale ustawiona i < regularna).
export function isOnSale(regular: number, salePrice: number | null | undefined): boolean;

// Najniższa cena z 30 dni PRZED wprowadzeniem bieżącej obniżki.
// history = wszystkie wiersze JEDNEJ jednostki (produkt albo kombinacja), dowolna kolejność.
// t0 = recorded_at najnowszego wiersza (moment wejścia bieżącej ceny).
// Wynik = MIN(effective_price) w [t0-30dni, t0), uwzględniając cenę obowiązującą na
// początku okna (ostatni wiersz przed oknem). Brak wcześniejszej historii → null
// (wołający użyje ceny regularnej). Deterministyczne: t0 z DANYCH, nie z zegara.
export function computeOmnibus(history: PriceHistoryRow[]): number | null;
```

`computeOmnibus` (algorytm):
1. `history.length === 0` → `null`.
2. sort rosnąco po `recorded_at`; `t0 = last.recorded_at`; `windowStart = t0 - 30 dni`.
3. `prior = wiersze z recorded_at < t0`; jeśli puste → `null`.
4. `inWindow = prior z recorded_at >= windowStart`.
5. `atWindowStart = ostatni wiersz prior z recorded_at < windowStart` (cena „wchodząca" w okno).
6. `candidates = inWindow.effective_price ∪ (atWindowStart ? [atWindowStart.effective_price] : [])`.
7. zwróć `min(candidates)` (zawsze niepuste, bo prior niepuste).

Wartość jest **stała przez cały czas promocji** (liczona względem startu obniżki `t0`,
nie kroczącego okna) — zgodnie z UOKiK.

## 3. Logowanie historii + denormalizacja Omnibus — `app/_lib/price-history.ts` (server)

```ts
export async function recordPriceHistory(productId: string): Promise<void>
```
Wołane PO każdym zapisie wpływającym na ceny: `updateProductBasics`,
`updateProductVariants`, `createProduct`. Kroki (admin client):
1. Wczytaj produkt (`price`, `sale_price`, `variants`).
2. Wyznacz **jednostki cenowe**:
   - brak wariantów → 1 jednostka `{ variant_key: null, regular: price, sale: sale_price }`;
   - z wariantami → po jednej na kombinację `{ variant_key: variantKey(values),
     regular: price + (price_modifier ?? 0), sale: combination.sale_price }`.
   (`variantKey` = ten sam deterministyczny klucz co w `VariantsEditor`.)
3. Dla każdej jednostki policz `eff = effectivePrice(regular, sale)`.
4. Wczytaj `price_history` produktu, pogrupuj po `variant_key`, weź ostatni `effective_price`.
5. **Jeśli `eff` zmieniła się** względem ostatniego wpisu (lub brak wpisu) → wstaw nowy wiersz
   `(product_id, variant_key, eff, now())`. Jeśli bez zmian → nic (Omnibus zostaje stabilny
   przy edycjach niecenowych).
6. Dla jednostek, których cena się zmieniła: policz `omnibus = computeOmnibus(historiaJednostki)`
   (z nowo wstawionym wierszem jako `t0`). Zapisz **zdenormalizowane** Omnibus:
   - poziom produktu → `products.omnibus_price` (lub `null` gdy jednostka nie jest w promocji);
   - kombinacja → `variants.combinations[i].omnibus_price` (patch JSON), `null` gdy nie w promocji.
7. Zapisz zaktualizowane `products.omnibus_price` / `variants` (jeden update).

Denormalizacja oznacza, że **każda powierzchnia czytająca produkt ma gotową `omnibus_price`**
bez dodatkowych zapytań — co gwarantuje zgodność (linia 30-dni wszędzie, gdzie pokazujemy
obniżkę) i prostotę read-path. `price_history` to wyłącznie źródło do wyliczenia przy zapisie.

## 4. Wyświetlanie (PL + DE/EUR)

Czyste helpery (w `app/_lib/variants.ts`, korzystają z `pricing.ts`), wybór jednostki wg
zaznaczenia wariantu:
```ts
getVariantRegularPrice(product, selected): number   // price + modifier (lub price)
getVariantSalePrice(product, selected): number | null
getVariantOmnibus(product, selected): number | null
isVariantOnSale(product, selected): boolean
```
Dla produktu bez wariantów / niekompletnego wyboru → poziom produktu (`product.sale_price`,
`product.omnibus_price`).

- **Strona produktu** (`ProductMainSection`): gdy `isVariantOnSale` → **cena regularna
  przekreślona**, **promocyjna wyróżniona**, pod spodem „**{t.product.omnibusLabel}: {kwota}**"
  (= „Najniższa cena z 30 dni przed obniżką"). Aktualizuje się przy wyborze koloru/strony.
  Wszystkie kwoty przez `formatMoney(_, locale, rate)` (EUR na `/de`). Gdy brak promocji —
  jak dziś (jedna cena).
- **Karta** (`ProductCard`): odzwierciedla **tylko promocję produktową** (`product.sale_price`
  + `product.omnibus_price`): przekreślona regularna + promocyjna + kompaktowa linia 30-dni.
  Promocje **per-wariant nie są reklamowane na kafelku** (brak wybranego wariantu) — pojawiają
  się na stronie produktu. Zgodne: kafelek nigdy nie pokaże obniżonej ceny bez linii 30-dni.
- Opcjonalny badge „{t.product.saleBadge}" (Promocja) na karcie/stronie gdy w promocji.

## 5. Koszyk i checkout — realne pobranie ceny promocyjnej

Reklamowana obniżka musi być **realnie pobrana** od klienta (inaczej wprowadzanie w błąd).
- **Checkout (autorytatywny, `app/api/checkout/route.ts`):** do `select` dodać `sale_price`.
  Cena pozycji liczona przez `effectivePrice`:
  - bez wariantu: `unitPrice = effectivePrice(product.price, product.sale_price)`;
  - z wariantem: `regular = product.price + (variant.price_modifier ?? 0)`,
    `unitPrice = effectivePrice(regular, variant.sale_price)`.
  Reszta bez zmian: `toCharge`/EUR, `order_items.price` = cena efektywna (poprawny audyt
  historyczny), rabat kodu liczony od sumy już po promocjach produktów.
- **Wyświetlanie w koszyku (klient):** `ProductActions` przekazuje do `AddToCartButton`
  `currentPrice` = cena **efektywna** (sale-aware); fallback w `AddToCartButton` (quick-add
  produktu bez wariantu) = `effectivePrice(product.price, product.sale_price)`. Dzięki temu
  kwota widoczna w koszyku zgadza się z realnie pobraną.

## 6. Admin UX

- **„Podstawowe dane"** (`ProductEditor` + `updateProductBasics`): pole **„Cena promocyjna (zł)"**
  (`name="sale_price"`, puste = brak promocji), **wyłączone gdy `hasVariants(product)`** z hintem
  „Produkt ma warianty — ustaw promocję per kombinacja w sekcji Warianty". (Spójne z polem
  `stock`, które już jest disabled przy wariantach.)
- **`VariantsEditor`** (+ `updateProductVariants`): w każdej kombinacji nowe pole
  **„Cena promocyjna (zł)"** obok „Stan magazynowy" i „Modyfikator ceny".
- **Walidacja** (w obu akcjach): `sale_price` parsowane jak inne kwoty; jeśli ustawione musi być
  `>= 0` i `< cena regularna` danej jednostki — inaczej `ActionResult` błąd
  („Cena promocyjna musi być niższa od regularnej"). Puste → `null` (koniec promocji).
- Po zapisie obie akcje wołają `recordPriceHistory(productId)`.

## 7. i18n

- `pl.ts` / `de.ts` (typ + wartości), sekcja `product`:
  - `omnibusLabel`: PL „Najniższa cena z 30 dni przed obniżką" / DE „Niedrigster Preis der
    letzten 30 Tage vor der Ermäßigung".
  - `saleBadge`: PL „Promocja" / DE „Sale".
  - (opcjonalnie) `regularPriceLabel` jeśli potrzebne przy przekreślonej cenie.
- Kwoty pass-through przez `formatMoney` (EUR/PLN wg locale).

## 8. Testy (Vitest, czyste helpery — bez mockowania Supabase)

`app/_lib/__tests__/pricing.test.ts`:
- `effectivePrice` / `isOnSale`: sale < regular → sale/on-sale; sale >= regular → regular/not; sale null → regular/not.
- `computeOmnibus`:
  - cena stała >30 dni, potem obniżka → referencja = cena sprzed obniżki (z `atWindowStart`);
  - kilka zmian w oknie → MIN z okna;
  - wcześniejsza promocja w oknie niższa niż regularna → MIN łapie tę promocję;
  - brak wcześniejszej historii (tylko bieżący wiersz) → `null`;
  - stałość: ten sam wynik niezależnie od „teraz" (t0 z danych).
- `app/_lib/__tests__/variants.test.ts` (dopis): `getVariantSalePrice/Omnibus/isVariantOnSale`
  wybierają właściwą jednostkę (kombinacja vs poziom produktu).

## 9. Poza zakresem (YAGNI)

- Planowanie dat promocji (start/end, auto-wygaszanie) — promocja trwa do ręcznego wyłączenia.
- Rabaty procentowe (tylko kwotowo).
- Reklamowanie promocji per-wariant na kafelku listy (tylko na stronie produktu).
- Integracja z `promo_codes` (kody na koszyk) — to osobny mechanizm, poza Omnibus
  (kod rabatowy nakłada się na cenę już-po-promocji, jak dziś).

## Pliki dotykane

- `supabase/migrations/36_omnibus_pricing.sql` (nowy)
- `app/_lib/types.ts` (Product +2 pola, ProductVariant +2 pola)
- `app/_lib/pricing.ts` (nowy, czysty) + `app/_lib/__tests__/pricing.test.ts` (nowy)
- `app/_lib/price-history.ts` (nowy, server — `recordPriceHistory`)
- `app/_lib/variants.ts` (helpery cenowe per-jednostka) + test dopis
- `app/_lib/new-product.ts` (payload: `sale_price:null`, `omnibus_price:null`)
- `app/admin/produkty/actions.ts` (`updateProductBasics`, `updateProductVariants`, `createProduct`: sale_price + walidacja + `recordPriceHistory`)
- `app/admin/produkty/[id]/ProductEditor.tsx` (pole sale_price produktu, disabled przy wariantach)
- `app/admin/produkty/[id]/VariantsEditor.tsx` (pole sale_price per kombinacja)
- `app/_components/ui/ProductMainSection.tsx` (render regularna/promo/omnibus per wybór)
- `app/_components/ui/ProductActions.tsx` (currentPrice = cena efektywna, sale-aware)
- `app/_components/ui/AddToCartButton.tsx` (fallback ceny = efektywna)
- `app/_components/ui/ProductCard.tsx` (promocja produktowa + linia 30-dni)
- `app/api/checkout/route.ts` (select `sale_price`; cena pozycji = `effectivePrice`)
- `app/_lib/dictionaries/pl.ts`, `de.ts` (`omnibusLabel`, `saleBadge`)
