# Zdjęcia tkanin per kolor + „Zobacz więcej" na sklepie

Data: 2026-07-01

## Cel

Każdy kolor tkaniny (numer) ma własne zdjęcie próbki. Na sklepie opcja
„Tkanina" renderuje się jako okrągłe próbki ze zdjęciem + podpis + cena; po
kilku kafelkach „Zobacz więcej (+N)" rozwija resztę w miejscu (jak na
referencyjnym zrzucie deal­meble).

## Model danych (migracja 41, additywna)

`alter table public.fabrics add column if not exists color_images jsonb not null default '{}'`
— mapa `{ numer → URL zdjęcia }`. Kolumna `colors text[]` (kolejność numerów)
zostaje. Typ `Fabric` zyskuje `color_images: Record<string, string>`.

## Katalog admina (Tkaniny)

Zamiast pola tekstowego „Kolory" — lista wierszy koloru (klient):
- każdy wiersz: numer (input) + miniatura + upload/zmień/usuń zdjęcie,
- „+ Dodaj kolor" dodaje wiersz; usuwanie wiersza,
- upload reużywa `uploadProductImage` (bucket `products`) + `compressIfNeeded`.

Zapis: hidden `colors_json` = `[{code, image}]`. Akcje create/update parsują na
`colors: string[]` (kody, trim/dedupe/kolejność) + `color_images: Record`.
Dopłata (price) bez zmian.

## Sklep

- `buildFabricImageMap(fabrics)` (variants.ts, czysta): dla każdej tkaniny i
  każdego numeru z color_images → `map["Nazwa Numer"] = url`.
- Serwerowo `getFabricImageMap()` (fabrics.ts) + kontekst (obok mapy DE) →
  `useFabricImages()`.
- `VariantSelector`: opcja „Tkanina" jako okrągłe próbki ze zdjęciem (fallback:
  kółko-placeholder gdy brak URL), podpis (nazwa+numer), cena/dopłata pod spodem,
  zaznaczona = złota obwódka. Pozostałe opcje bez zmian.
- Pokazuj pierwsze **5**; gdy więcej → kafelek „Zobacz więcej (+N)" rozwija
  resztę w miejscu (`useState`), N = liczba ukrytych. Stała łatwa do zmiany.

## Zgodność wsteczna

Tkaniny/produkty bez zdjęć działają (placeholder). Wartości „Nazwa Numer",
dopłaty, koszyk/checkout/omnibus bez zmian.

## Weryfikacja

- Vitest: `buildFabricImageMap` (mapowanie, pominięcie braków), logika liczby
  ukrytych.
- Build + lint + pełny suite. Migracja zastosowana do prod DB. Playwright opc.

## Poza zakresem (YAGNI)

- Zdjęcie per kolekcja (wybrano per kolor).
- Osobny bucket na tkaniny (reużywamy `products`).
- Lightbox/zoom próbki.
