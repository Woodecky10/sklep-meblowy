# Spec: Krótkie info o tkaninie obok „szczegóły" w pickerze

Data: 2026-07-24
Status: zatwierdzony projekt

## Kontekst (stan obecny)

- Katalog tkanin (`public.fabrics`) ma m.in. `name`, `name_de`, `slug`, `group_id`,
  `colors`, `color_images`, `description`, `description_de`. `description` (rich text)
  jest pokazywany na stronie `/tkaniny/[slug]`.
- Edytor tkaniny: `app/admin/tkaniny/FabricsEditor.tsx` (pola nazwy, opisu PL/DE
  jako RichTextEditor, kolory, zdjęcia). Zapis przez akcję w `app/admin/tkaniny/…`.
- Picker tkanin na karcie produktu: `VariantSelector.tsx` → `FabricSwatchGroup`.
  W widoku ROZWINIĘTYM tkaniny są pogrupowane w karty grup cenowych; przy nazwie
  każdej tkaniny jest link „szczegóły" → `/tkaniny/[slug]`. W widoku KOMPAKTOWYM
  (pierwsze 5 próbek) nazwy ani „szczegóły" nie ma.
- `FabricValueMeta` (`variants.ts`) + `buildFabricMetaMap` dostarczają do pickera
  meta per wartość wariantu tkaniny (fabricName, slug, grupa…). Seed: `getFabricMetaMap`
  (`fabrics.ts`) → `FabricMetaProvider` → `useFabricMeta` w `FabricSwatchGroup`.
- Istnieje `ValueInfoTip` (`app/_components/ui/ValueInfoTip.tsx`): dostępny tooltip
  „ⓘ" (hover/focus/tap), użyty już przy wartościach wariantów.

## Cel

Admin może dodać krótką informację o danym rodzaju tkaniny (per tkanina/kolekcja)
w panelu `/admin/tkaniny`. Klient w pickerze, w widoku rozwiniętym, widzi obok
linku „szczegóły" ikonę „ⓘ"; hover/tap pokazuje ten krótki tekst.

## Zatwierdzone decyzje

1. **Wyświetlanie:** ikona „ⓘ" z tooltipem (reużycie `ValueInfoTip`), obok „szczegóły".
2. **Źródło treści:** NOWE, krótkie pole per tkanina (osobne od `description`).
   Zwykły tekst, limit ~200 znaków, PL + DE (DE opcjonalne → fallback PL).
3. **Miejsce edycji:** edytor tkaniny w `/admin/tkaniny` (obok pola opisu).
4. Widok kompaktowy pickera bez zmian (brak „szczegóły" = brak ⓘ). `/tkaniny` bez zmian.

## Model danych (migracja)

Dodaj do `public.fabrics` dwie kolumny (nullable):
- `short_info text`
- `short_info_de text`

Bez zmian RLS/indeksów. Migracja `NN_fabric_short_info.sql` (kolejny wolny numer;
61 zajęte). Aplikacja na produkcję ręcznie przez Supabase MCP (`apply_migration`),
jak migracja 61 — connected project = produkcja.

## Komponenty i przepływ

### Typy — `app/_lib/types.ts`
- `Fabric`: dodaj `short_info: string | null`, `short_info_de: string | null`.

### Czysty helper — `app/_lib/variants.ts`
- `FabricValueMeta`: dodaj `shortInfo: string | null`, `shortInfoDe: string | null`.
- `buildFabricMetaMap`: rozszerz wejściowy typ fabryk o `short_info` / `short_info_de`
  i przenieś je do meta (per wartość; wszystkie wartości tej samej tkaniny dostają
  ten sam shortInfo). Puste/whitespace → `null`.

### Serwer — `app/_lib/fabrics.ts`
- `getAllFabrics` używa `select("*")` → nowe kolumny dojdą automatycznie po migracji.
- `getFabricMetaMap` przekazuje `short_info`/`short_info_de` do `buildFabricMetaMap`
  (bez zmian sygnatury publicznej — mapuje z pełnych obiektów `Fabric`).

### Klient — `VariantSelector.tsx` (`FabricSwatchGroup`, widok rozwinięty)
- Podczas budowania kubełków grup, dla każdej tkaniny (fabricName) pobierz krótkie
  info z `meta[dowolnaWartość]` (np. pierwszej wartości tkaniny): `shortInfo`/`shortInfoDe`.
- Obok linku „szczegóły" (lub gdy brak slug — obok nazwy) renderuj
  `<ValueInfoTip text={pickLocalized(shortInfo, shortInfoDe, locale)} />`, jeśli
  po lokalizacji tekst jest niepusty. Brak info → nic.

### Admin — `FabricsEditor.tsx` + akcja zapisu tkaniny
- Nowe pola: „Krótkie info (PL)" + „Krótkie info (DE)" — `<textarea maxLength={200}>`
  (zwykły tekst, nie RichText), prefill z `initial?.short_info` / `short_info_de`,
  ukryte inputy/FormData jak istniejące pola.
- Akcja tworzenia/edycji tkaniny (w `app/admin/tkaniny/…actions`): odczyt i zapis
  `short_info` / `short_info_de` (trim, limit 200, puste → null). Inwalidacja cache
  tkanin (istniejący mechanizm) po zapisie.

## Poza zakresem

- Rich text / formatowanie w krótkim info (zwykły tekst).
- Pokazywanie krótkiego info na stronie `/tkaniny/[slug]` (tam jest pełny `description`).
- Krótkie info w widoku kompaktowym pickera (brak tam „szczegóły").
- Zmiana istniejącego `description` / mechanizmu wariantów (`variant_info`).

## Testy

- Unit (`variants.test.ts` lub obok): `buildFabricMetaMap` — `shortInfo`/`shortInfoDe`
  trafiają do meta wszystkich wartości tkaniny; puste → `null`; brak pól → `null`.
- UI (Playwright): (a) picker rozwinięty — tkanina z krótkim info pokazuje ⓘ obok
  „szczegóły", hover/tap pokazuje tekst; tkanina bez info — brak ⓘ. (b) admin —
  pole prefillowane, zapis utrwala i widać w pickerze.
- Wszystkie istniejące testy zielone.

## Kryteria akceptacji

1. Admin wpisuje krótkie info przy tkaninie w `/admin/tkaniny`, zapisuje.
2. W pickerze (widok rozwinięty) obok „szczegóły" tej tkaniny pojawia się ⓘ; hover/tap
   pokazuje krótki tekst (PL i `/de` z fallbackiem DE→PL).
3. Tkanina bez krótkiego info — brak ⓘ (bez regresji wyglądu).
4. Brak migracji poza dwiema kolumnami w `fabrics`; brak regresji `/tkaniny`, koszyka,
   wariantów.
