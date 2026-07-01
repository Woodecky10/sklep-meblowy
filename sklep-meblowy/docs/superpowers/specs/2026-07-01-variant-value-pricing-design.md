# Dopłata ceny per wartość opcji wariantu

Data: 2026-07-01

## Cel

Umożliwić dopłatę do ceny per WARTOŚĆ opcji wariantu (np. „Pianka: Premium
+200 zł"). Dopłaty wybranych wartości sumują się do ceny bazowej. Zastępuje
dotychczasowe żmudne ustawianie „modyfikatora ceny" osobno dla każdej pełnej
kombinacji. Działa też dla już utworzonych produktów.

## Stan obecny

- `ProductOption = { name, values: string[] }`.
- `ProductVariant` (kombinacja) ma `price_modifier?` — ustawiany ręcznie per
  pełna kombinacja. Cena = `product.price + price_modifier`.
- `price_modifier` jest źródłem prawdy wszędzie: `getVariantPrice`, checkout
  (Stripe), walidacja promocji (`findInvalidVariantSale`), historia cen/Omnibus.
- `variants` to kolumna JSONB → dodanie pola NIE wymaga migracji DB.

## Model docelowy (wybrany: per wartość zastępuje, sumowanie)

Rozszerzenie opcji o mapę dopłat per wartość:

```ts
type ProductOption = {
  name: string;
  values: string[];
  value_prices?: Record<string, number>; // wartość -> dopłata zł (brak = 0)
};
```

`price_modifier` kombinacji staje się **pochodną**:
`price_modifier = Σ value_prices[v]` po wszystkich wartościach `v` kombinacji.
Liczone automatycznie. Dzięki temu warstwa niżej (strona produktu, koszyk,
checkout, promocje, Omnibus) **pozostaje bez zmian** — dalej czyta
`price_modifier`.

## Zakres zmian

### app/_lib/types.ts
Dodać `value_prices?: Record<string, number>` do `ProductOption`.

### app/_lib/variants.ts
- `sumValueSurcharges(options, values): number` — suma dopłat wartości kombinacji.
- `usesValuePricing(options): boolean` — czy jakakolwiek opcja ma `value_prices`.
- `applyValuePricing(options, combinations)` — zwraca kombinacje z
  `price_modifier` przeliczonym z dopłat; **tylko** gdy `usesValuePricing` =
  true (inaczej kombinacje bez zmian → zgodność wsteczna z ręcznymi modyfikatorami).
- Wywoływane po `rebuildCombinations` w edytorze i w akcji serwerowej.

### app/admin/produkty/[id]/VariantsEditor.tsx
- Przy każdej wartości opcji: małe pole „+zł" (dopłata). Handler
  `setValuePrice(optIdx, value, price)`.
- Rename wartości → przenosi klucz w `value_prices`; remove wartości → usuwa klucz.
- Po każdej zmianie wartości/dopłat: `applyValuePricing` przelicza modyfikatory.
- CombinationRow: usunąć input „modyfikator ceny"; pokazać read-only
  „Cena: baza + dopłaty = X zł". Zostają: stan magazynowy, cena promocyjna.

### app/admin/produkty/actions.ts (updateProductVariants)
- Krok czyszczący opcje musi zachować `value_prices` (przefiltrowane do
  istniejących wartości).
- Po zbudowaniu payloadu: serwerowo przeliczyć `price_modifier` z `value_prices`
  (defense-in-depth — nie ufamy klientowi). Zapisać `value_prices`.

### Sklep (widok klienta)
- W selektorze wariantu przy wartości pokazać dopłatę, np. „Premium (+200 zł)".
  Cena łączna i tak przelicza się po wyborze (już działa, bo modyfikator pochodny).

## Zgodność wsteczna

Produkt bez `value_prices` = tryb legacy: ręczne `price_modifier` kombinacji
nietknięte. Dopiero wpisanie dopłat przełącza produkt w tryb „per wartość" i
sumy dopłat stają się źródłem prawdy.

## Błędy / przypadki brzegowe

- Dopłata pusta/NaN → 0.
- Dopłaty ujemne dozwolone (rabat za wartość), ale cena regularna kombinacji
  nie może zejść < 0 — walidacja przy zapisie (klient + serwer).
- Walidacja promocji (`sale_price < baza + modyfikator`) działa na pochodnym
  modyfikatorze bez zmian.

## Testy / weryfikacja

- Vitest: `sumValueSurcharges` (1 i wiele opcji), `usesValuePricing`,
  `applyValuePricing` (przelicza gdy są dopłaty; nie rusza gdy brak — zgodność
  wsteczna), remap dopłaty przy zmianie nazwy wartości.
- Build + lint + istniejące 267 testów zielone.

## Poza zakresem (YAGNI)

- Migracja DB (JSONB — niepotrzebna).
- Druga, równoległa metoda ceny per kombinacja (odrzucona w projekcie).
- Dopłaty zależne od kombinacji dwóch wartości (tylko per pojedyncza wartość).
