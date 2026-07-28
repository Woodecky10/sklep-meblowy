# Spec: Informacja o wariancie (tooltip na hover) + globalny słownik

Data: 2026-07-24
Status: zatwierdzony projekt

## Kontekst (stan obecny)

- Warianty produktu żyją w JSONB `products.variants` jako `ProductVariants { options: ProductOption[], overrides? }`. `ProductOption { name, values, value_prices?, value_images?, filterable? }`.
- Selektor `VariantSelector.tsx` renderuje wartości opcji czterema ścieżkami: „Tkanina" → `FabricSwatchGroup`, „Strona" (narożnik) → `CornerSideGroup`, opcje ze zdjęciami → `ValueImageSwatchGroup`, pozostałe → chipy tekstowe.
- Katalog tkanin (`fabrics`) ma `description`/`description_de` (rich text) pokazywane na `/tkaniny/[slug]` — to inny mechanizm (opis kolekcji na osobnej stronie), pozostaje bez zmian.
- Brak jakiegokolwiek „info na hover" przy wartościach wariantu.

## Cel

Admin wpisuje krótką informację do konkretnej wartości wariantu (np. „rodzaj tkaniny"). Klient najeżdża kursorem na wartość na karcie produktu i widzi tę informację w tooltipie. Informacje się powielają między produktami, więc są przechowywane **globalnie** (raz wpisane → reużywane wszędzie), bez ręcznego przepisywania.

## Zatwierdzone decyzje

1. **Zakres:** wszystkie opcje wariantów (tkaniny + np. „Kolor nóżek"), nie tylko tkaniny.
2. **Klucz słownika:** para **(nazwa opcji, wartość)**. Każda para ma własny wpis; reużycie następuje między produktami mającymi tę samą parę.
3. **Miejsce edycji:** inline w edytorze wariantów produktu (`VariantsEditor`), przy każdej wartości. Zapis idzie do **globalnego słownika**; przy innym produkcie z tą samą parą pole jest prefillowane. Edycja tutaj zmienia info wszędzie (zamierzone).
4. **Treść:** krótki **zwykły tekst** (bez rich-text), limit ~200 znaków. PL wymagany do pokazania tooltipa; DE opcjonalny (pusty → fallback do PL).
5. **UI klienta:** dyskretny znacznik „ⓘ" przy wartościach z wpisem + tooltip na **hover + focus (klawiatura) + tap (mobile)**, dostępnościowo (`aria-describedby`).

## Model danych (migracja — nowa tabela)

Tabela `public.variant_info`:

- `id uuid primary key default gen_random_uuid()`
- `option_name text not null`
- `value text not null`
- `info text` (PL)
- `info_de text` (DE, opcjonalne)
- `updated_at timestamptz not null default now()`
- `unique (option_name, value)`

RLS: wzorzec jak `fabrics` — publiczny `SELECT`, zapis tylko dla roli admina (te same polityki/role co istniejące tabele katalogowe). Dokładne polityki dobrane w planie po podejrzeniu istniejącej migracji `fabrics`.

Uwaga operacyjna: migracje NIE auto-aplikują się na tym projekcie — po merge do `main` zaaplikować ręcznie przez Supabase MCP (`list_tables` → `apply_migration`), connected project = produkcja.

## Komponenty i przepływ

### Serwer — `app/_lib/variant-info.ts`
- Czysty helper `variantInfoKey(optionName: string, value: string): string` (np. `${optionName}␟${value}` — separator spoza danych; jeden punkt prawdy o kluczowaniu, testowalny).
- `getVariantInfoMap(): Promise<Record<string, { info: string; info_de: string | null }>>` — czyta `variant_info`, buduje mapę po `variantInfoKey`. Tabela mała → jeden odczyt (bez filtra), analogicznie do map tkanin.
- Budowa mapy wydzielona jako czysta funkcja `buildVariantInfoMap(rows)` (testowalna bez DB), którą opakowuje serwerowy `getVariantInfoMap`.

### Serwer — akcja admina
- `upsertVariantInfo(entries: { option_name, value, info, info_de }[])` w akcjach admina produktów (`app/admin/produkty/actions.ts`): upsert po `(option_name, value)`; puste `info` i `info_de` → wpis usuwany (nie zaśmiecamy słownika). Walidacja: trim, limit długości (~200), tylko string.

### Klient — provider + tooltip
- `app/_lib/variant-info-context.tsx`: `VariantInfoProvider` + `useVariantInfo()` (wzorzec `FabricImageProvider`) — dostarcza mapę `key → {info, info_de}`; hook `useVariantInfoText(optionName, value, locale)` zwraca zlokalizowany tekst (DE→fallback PL) lub `null`.
- `app/_components/ui/ValueInfoTip.tsx`: mały, dostępny tooltip — trigger „ⓘ" (button, `aria-label`), pokazuje tekst na hover/focus/tap; `role="tooltip"` + `aria-describedby`. Bez zależności zewnętrznych (CSS + minimalny stan).
- `VariantSelector.tsx`: dla każdej renderowanej wartości (we wszystkich czterech gałęziach) — jeśli `useVariantInfoText(option.name, v, locale)` zwraca tekst, dołóż `ValueInfoTip` przy etykiecie wartości.
- `produkt/[id]/page.tsx`: pobiera `getVariantInfoMap()` i owija sekcję główną w `VariantInfoProvider` (obok istniejących `FabricImageProvider`/`FabricMetaProvider`).

### Admin — inline w `VariantsEditor`
- Przy każdej wartości opcji dodatkowe pole „info" (PL) + zwarte pole DE (np. rozwijane, jak panel zdjęć). Stan lokalny editora.
- Prefill: strona admina produktu (`app/admin/produkty/[id]/page.tsx`) pobiera z `variant_info` wpisy dla par (opcja, wartość) tego produktu i przekazuje do `VariantsEditor` jako initial.
- Zapis: przy „Zapisz warianty" — obok `updateProductVariants` — wywołanie `upsertVariantInfo` dla par produktu (tylko zmienione/niepuste). Info NIE jest zapisywane w `products.variants` (pozostaje globalne).

## Poza zakresem

- Rich text / formatowanie w tooltipie (krótki plain text).
- Osobna strona masowej edycji słownika (możliwa później; teraz edycja inline wystarcza).
- Automatyczne tłumaczenie PL→DE.
- Zmiana `fabrics.description` i strony `/tkaniny` (osobny, istniejący mechanizm — bez zmian).
- Wersjonowanie/historia zmian info.

## Testy

- Unit (`*.test.ts`, node): `variantInfoKey` (stabilny, separator), `buildVariantInfoMap` (dedup po kluczu, pominięcie pustych), lokalizacja `info_de` z fallbackiem do `info`.
- Walidacja `upsertVariantInfo` (trim, limit długości, usuwanie pustych) — jeśli wydzielona jako czysta funkcja pomocnicza, testowana jednostkowo.
- UI (Playwright): (a) klient — hover/focus nad wartością z wpisem pokazuje tooltip; wartość bez wpisu nie ma „ⓘ"; (b) admin — pole info prefillowane z globalnego słownika dla pary już opisanej gdzie indziej; zapis utrwala i pojawia się na kliencie.
- Wszystkie istniejące testy zielone.

## Kryteria akceptacji

1. Admin wpisuje info przy wartości wariantu w edytorze produktu i zapisuje; ta sama para (opcja+wartość) w innym produkcie ma pole już wypełnione (bez ponownego wpisywania).
2. Na karcie produktu wartość z wpisem pokazuje znacznik „ⓘ"; hover/focus/tap wyświetla krótką informację; PL i `/de` (z fallbackiem DE→PL).
3. Wartości bez wpisu wyglądają jak dziś (bez znacznika, bez tooltipa).
4. Brak migracji poza nową tabelą `variant_info`; brak regresji w galerii/selektorze wariantów, koszyku i na stronie `/tkaniny`.
