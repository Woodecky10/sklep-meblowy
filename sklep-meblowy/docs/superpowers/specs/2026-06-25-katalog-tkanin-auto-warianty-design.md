# Katalog tkanin + auto-warianty — design

**Data:** 2026-06-25
**Status:** zaakceptowany (brainstorming), czeka na plan implementacji

## Problem

Osoba dodająca produkty tapicerowane wpisuje ten sam, długi zestaw tkanin ręcznie
na każdym produkcie — jedna wartość po drugiej w opcji wariantu. Tkanin jest dużo,
a powtarzają się między produktami. Cel: zdefiniować tkaniny **raz** w katalogu i
dodawać wybrany **podzbiór** do produktu jednym działaniem; warianty mają powstawać
automatycznie (istniejąca logika iloczynu kartezjańskiego już to robi po ustawieniu
wartości opcji).

## Wymagania (z brainstormingu)

1. **Katalog wielokrotnego użytku** — duża liczba tkanin, definiowana raz, zarządzana
   w adminie.
2. **Podzbiór per produkt** — różne produkty używają różnych zestawów tkanin → wybór
   wielokrotny (zaznacz, które).
3. **Współistnienie z innymi opcjami** — tkanina to JEDNA z opcji wariantu; produkt
   może mieć też np. „Strona: Lewa/Prawa". Warianty = iloczyn tkanin × pozostałe opcje.
4. **Brak wpływu na cenę** — wybór tkaniny nie zmienia ceny (modyfikator zawsze 0).
   Katalog przechowuje tylko nazwy.
5. **Nazwa DE per tkanina** — sklep jest dwujęzyczny, /de na żywo. Każda tkanina ma
   nazwę PL + opcjonalną nazwę DE (fallback do PL gdy pusta). Nazwa DE pokazuje się
   niemieckiemu klientowi wszędzie, gdzie widać tkaninę.

## Non-goals (YAGNI)

- Brak grup cenowych tkanin / dopłat (zdecydowane: cena bez wpływu).
- Brak zdjęć/próbek tkanin w katalogu (poza zakresem — zdjęcia per wariant istnieją
  już w `VariantsEditor`).
- Brak automatycznego wstecznego przypisywania katalogu do istniejących produktów.

## Konwencja

Opcja wariantu reprezentująca tkaninę nazywa się dokładnie **„Tkanina"**. Nazwa opcji
DE („Tkanina"/„TKANINA" → „Stoff"/„STOFF") już jest w `VARIANT_OPTION_DE`
(`de-content-maps.ts`), więc nazwa samej opcji nie wymaga zmian.

## 1. Model danych

Nowa tabela `public.fabrics`:

| kolumna     | typ           | uwagi                                              |
|-------------|---------------|----------------------------------------------------|
| id          | uuid pk       | `default uuid_generate_v4()`                       |
| name        | text not null | nazwa PL; **unikalna**; = wartość wariantu          |
| name_de     | text          | nazwa DE; null → fallback do `name`                |
| sort_order  | int           | `default 0`; kolejność na liście wyboru            |
| created_at  | timestamptz   | `default now()`                                    |

- RLS **public-read** (storefront potrzebuje mapy PL→DE do renderu wartości tkanin),
  **admin-write** — wzorzec dokładnie jak `collections`.
- Migracja: `supabase/migrations/37_fabrics.sql` (idempotentna; `create table if not exists`,
  policies, indeks na `sort_order`). Człowiek odpala w Supabase po wdrożeniu kodu.
- `name` jest jednocześnie wartością zapisywaną w wariancie
  (`combinations[].values["Tkanina"]`). Katalog = źródło prawdy; zmiana `name_de`
  natychmiast zmienia render DE wszędzie (brak denormalizacji DE do produktów).

**Uwaga migracyjna:** numer 37 zakłada, że 35/36 są już wdrożone (są — DB na 36).

## 2. Zarządzanie katalogiem — `/admin/tkaniny`

Strona CRUD wzorowana na `/admin/kolekcje`:
- Lista tkanin: nazwa PL, nazwa DE, kolejność; akcje edytuj/usuń.
- Formularz dodawania: nazwa PL (wymagana), nazwa DE (opcjonalna), sort_order.
- Server actions w `app/admin/tkaniny/actions.ts`: `createFabric`, `updateFabric`,
  `deleteFabric` — każda przez `requireAdmin()` + `createAdminClient()`, zwraca
  `ActionResult`, `revalidatePath`.
- Walidacja: nazwa PL niepusta i unikalna (błąd przyjazny zamiast surowego 23505),
  trim/limit długości jak w istniejących actions.
- Link w nawigacji admina (obok Kolekcje/Kategorie).
- **Usunięcie tkaniny z katalogu NIE rusza produktów**, które już ją mają — wartość
  wariantu pozostaje zapisana w produkcie; tkanina znika tylko z listy do wyboru i z
  mapy DE (jej wartość zacznie renderować się jako PL). To akceptowalne i jawne.

## 3. Dodawanie tkanin do produktu (sedno)

W `VariantsEditor` (`app/admin/produkty/[id]/VariantsEditor.tsx`):
- Przy opcji o nazwie „Tkanina": przycisk **„Wybierz z katalogu tkanin"**.
- Gdy produkt nie ma jeszcze opcji „Tkanina": przycisk na poziomie sekcji opcji
  **„+ Dodaj tkaniny z katalogu"** — tworzy opcję „Tkanina" i ją wypełnia.
- Klik → modal z checkbox-listą wszystkich tkanin z katalogu. Katalog pobierany
  **server-side na stronie edytora** (`app/admin/produkty/[id]/page.tsx`, gdzie już
  ładowane są dane produktu) i przekazany do `VariantsEditor` jako prop — bez
  dodatkowego fetcha po stronie klienta. Zaznaczone = tkaniny już obecne w `values`
  opcji „Tkanina".
- Zatwierdzenie ustawia `values` opcji „Tkanina" na dokładnie zaznaczony zbiór
  (dodaje nowe, usuwa odznaczone) → wywołuje istniejące `rebuildCombinations`:
  kombinacje z przetrwałym kluczem zachowują stock/zdjęcia/modyfikator, nowe dostają
  `stock: 0, price_modifier: 0` (identycznie jak dziś przy ręcznym `addValue`).
- Zapis przez istniejące `updateProductVariants` (bez zmian w server action wariantów).

**Czysta funkcja** (testowalna bez UI), w `app/_lib/`:
```ts
applyFabricSelection(
  options: ProductOption[],
  combinations: ProductVariant[],
  selectedFabricNames: string[]
): { options: ProductOption[]; combinations: ProductVariant[] }
```
Ustawia (lub tworzy) opcję „Tkanina" z `values = selectedFabricNames`, zachowuje
pozostałe opcje bez zmian, przelicza kombinacje przez tę samą logikę co edytor.

**Refaktor wymagany:** `cartesianProduct` i `rebuildCombinations` są dziś prywatne w
`VariantsEditor.tsx`. Wydzielić je do `app/_lib/variants.ts` (czyste, już tam mieszka
`variantKey`), a edytor importuje je stamtąd. `applyFabricSelection` korzysta z tych
samych funkcji → jeden punkt prawdy o generowaniu kombinacji, testowalny bez UI.

## 4. Render DE na storefront

Tłumaczenie wartości wariantów dziś idzie przez statyczną mapę `VARIANT_VALUE_DE`
(`de-content-maps.ts`) używaną w:
- `VariantSelector` (klient) — chipy wyboru na karcie produktu,
- `formatVariantLabel` (`variants.ts`) — serwer: nazwa pozycji w checkout
  (`api/checkout/route.ts`), koszyk, podsumowania zamówień.

Katalog DB nie jest dostępny statycznie, więc:
- Cached helper serwerowy `getFabricDeMap(): Promise<Record<string,string>>` (PL→DE,
  pomija puste `name_de`), opakowany cache'em (wzorzec jak `getEurRate`).
- Udostępnienie klientowi przez **kontekst seedowany w root layout** — dokładnie
  wzorzec `RateProvider`/`useEurRate` z prac nad EUR. Nowy `FabricLabelProvider` +
  hook `useFabricLabels()`.
- `VariantSelector.getValueLabel` dla opcji „Tkanina": kolejność fallbacku
  **mapa katalogu → `VARIANT_VALUE_DE` → wartość PL**. Dla innych opcji bez zmian.
- `formatVariantLabel` dostaje opcjonalny param `fabricMap?: Record<string,string>`:
  wołający serwerowi (checkout/zamówienia) przekazują `await getFabricDeMap()`;
  wołający kliencki (koszyk) czyta z `useFabricLabels()` (cienki wrapper).

Efekt: nazwa DE tkaniny spójna wszędzie, katalog jedynym źródłem prawdy. Gdy
`name_de` puste lub tkanina spoza katalogu → render PL (bez regresji wobec dziś).

## 5. Edge cases

- Pusty katalog → modal pokazuje komunikat „Brak tkanin w katalogu — dodaj w
  /admin/tkaniny", przycisk nie psuje edytora.
- Odznaczenie wszystkich tkanin → opcja „Tkanina" zostaje bez wartości; przy zapisie
  istniejące czyszczenie (`save()` w edytorze) usunie pustą opcję — spójne z obecnym
  zachowaniem.
- Tkanina obecna w produkcie, ale usunięta z katalogu → w modalu pojawia się jako
  zaznaczona „spoza katalogu" (żeby jej nie zgubić przy edycji); render DE spada do PL.
- Duplikat nazwy przy tworzeniu w katalogu → przyjazny błąd (unikalność `name`).
- Produkty made-to-order: nowe kombinacje ze `stock: 0` są zamawialne (checkout
  waliduje tylko kompletność wyboru, nie stan) — bez zmiany istniejącego zachowania.

## 6. Testy

- `applyFabricSelection`: dodanie tkanin do produktu bez wariantów; dodanie/usunięcie
  przy istniejącej opcji „Tkanina"; zachowanie stock/zdjęć przetrwałych kombinacji;
  współistnienie z drugą opcją (iloczyn); odznaczenie wszystkich.
- builder mapy DE (PL→DE, pomijanie pustych `name_de`, fallback).
- walidacja server actions katalogu (nazwa wymagana; unikalność).
- Bramki: `tsc` czysty, eslint 0, pełny `vitest` zielony.

## Kolejność wdrożenia (dla planu)

1. Migracja `37_fabrics.sql` + typy `Fabric` w `types.ts`.
2. Data layer: `app/_lib/fabrics.ts` (`listFabrics`, `getFabricDeMap`), server actions katalogu.
3. Admin `/admin/tkaniny` (strona + edytor) + link w nawigacji.
4. Wydzielenie `cartesianProduct`/`rebuildCombinations` do `_lib/variants.ts`;
   `applyFabricSelection` (czysta) + przycisk/modal w `VariantsEditor` (katalog jako prop).
5. DE render: `FabricLabelProvider`/`useFabricLabels`, seed w layout, param w
   `formatVariantLabel`, fallback w `VariantSelector`, przekazanie mapy w checkout.
6. Testy + bramki.

**Deploy:** migracja 37 odpalana ręcznie w Supabase (jedna instancja = produkcyjna;
patrz pamięć ops — `next dev` pisze do prod).
