# Tłumaczenia DE — gdzie żyją i jak nie przeciekać polskim

Dev-doc. Sklep jest dwujęzyczny: **PL** (domyślny, korzeń) i **DE** (`/de/...`). Treść
po polsku przecieka do klienta DE, gdy dany napis nie ma ścieżki tłumaczenia.

## Dwie warstwy tłumaczeń

1. **Statyczne UI** — słownik `app/_lib/dictionaries/{pl,de}.ts` (deep-merge z fallbackiem
   do PL). Strony transakcyjne (checkout/konto/auth/legal) używają inline `de ? "DE" : "PL"`
   albo helpera `tr(pl, de)`. Komunikaty API zwracane do klienta TEŻ muszą iść przez `tr()`
   (route czyta locale z body lub query — `x-locale` na `/api/...` jest zawsze `pl`).

2. **Treść z DB** — lokalizowana na granicy odczytu helperami z `app/_lib/localize.ts`
   (`localizeProduct`, `localizeCategory`, `localizeCollection`, `localizeReview`).

## Co ma kolumny `_de`, a co polega na ręcznych mapach

**Kolumny `_de` w DB** (właścicielka uzupełnia w panelu, fallback do PL gdy puste):
- `products`: `name_de`, `description_de`, `description_sections_de`, `color_de`, `material_de`
- `categories` / `category_groups`: `label_de`
- `collections`: `label_de`, `description_de`
- `product_reviews`: `comment_de`
- treść home (`home_slides` / `home_tiles`): kolumny `_de` (od migracji 30)

**BEZ kolumn `_de` — tłumaczone WYŁĄCZNIE przez ręczne mapy w `app/_lib/de-content-maps.ts`**
(wzorzec `mapDe(MAPA, wartośćPL) ?? wartośćPL` — nieznana wartość przechodzi jako PL):
- pola produktu: `construction`, `delivery_time`, `warranty`
- cechy BL: klucz i (tłumaczalna) wartość
- warianty: nazwa opcji i (tłumaczalna) wartość
- plakietki (`featured_products.badge`) — zamknięty dropdown
- komunikaty błędów kodu rabatowego (`promo.ts`)
- `HOME_TEXT_DE` — legacy fallback dla treści home sprzed migracji 30

## KONTRAKT: dodajesz treść w polu „mapowanym" → dopisz tłumaczenie

Jeśli w katalogu pojawi się **nowa** wartość PL w polu z listy „BEZ kolumn `_de`"
(np. nowy `construction`, nowa nazwa wariantu, nowa kategoria/slug):

1. Dopisz tłumaczenie do właściwej mapy w `app/_lib/de-content-maps.ts`.
2. Dopisz tę wartość do snapshotu w `app/_lib/__tests__/de-content-maps.test.ts`.

Brak → na `/de` przeciekłby polski. **Siatka drift** w teście pilnuje pełnego pokrycia:
każda wartość ze snapshotu musi mieć niepuste tłumaczenie DE (inaczej czerwony test).
Snapshot jest niezależny od mapy, więc łapie też przypadkowe usunięcie wpisu.

> Ograniczenie: test nie odpytuje DB (zasada „bez Supabase w testach"), więc snapshot to
> ręcznie utrzymywany kontrakt — nową wartość trzeba dopisać w obu miejscach świadomie.
> Docelowo te pola mogłyby dostać własne kolumny `_de` (jak produkty) i zlikwidować mapy.

Kody tkanin, wymiary i nazwy własne (MANILA 01, 180x200, SISI) celowo NIE są tłumaczone —
przechodzą bez zmian i nie trafiają do snapshotów.
