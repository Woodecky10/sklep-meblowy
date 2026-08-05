# Promocje — wstążka na zdjęciu i terminy promocji — projekt

**Data:** 2026-08-05
**Autor decyzji produktowych:** Mikołaj (właściciel)
**Status:** zatwierdzony, do implementacji

## Problem

Mechanizm promocji **już istnieje i jest kompletny cenowo**: kolumna
`products.sale_price`, pole „Cena promocyjna (zł)" w edytorze produktu
(`ProductEditor.tsx:315`), przekreślona cena regularna na kaflach
(`ProductCard.tsx:90`) i karcie produktu, złota plakietka „Promocja" obok ceny
(`ProductMainSection.tsx:139`) oraz pełna zgodność z Omnibusem — tabela
`price_history`, denormalizowany `omnibus_price`, transakcyjne RPC
`apply_price_changes` (migracja 39) i przetestowana czysta logika w `pricing.ts`.

Brakuje dwóch rzeczy:

1. **Oznaczenia na zdjęciu.** Koleżanka obsługująca panel chce, żeby na fotografii
   produktu widniał pasek „Promocja” — dziś na zdjęciu nie ma nic. Prop `badge`
   w `ProductCard` istnieje, ale zasila go wyłącznie `admin/polecane`
   (`featured_products.badge`, wolny tekst: „Bestseller”, „Nowość”) i działa tylko
   w sekcji „Polecane” na stronie głównej.
2. **Terminów.** Dziś promocja żyje tak długo, aż ktoś ręcznie wyczyści pole.

Stan bazy na 2026-08-05: **żaden produkt nie ma `sale_price`** (wszystkie `null`).
Cała ścieżka promocyjna — przekreślona cena, plakietka, etykieta Omnibus — nigdy
nie została zobaczona na produkcji. To jest wymaganie weryfikacyjne, nie ciekawostka.

## Decyzje właściciela

| Pytanie | Decyzja |
|---|---|
| Skąd bierze się wstążka | **Automat z ceny + ręczne nadpisanie tekstu** |
| Tekst paska bez ceny promocyjnej | **Pokazuj, ale ostrzegaj w adminie** o Omnibusie; zapis przechodzi |
| Gdzie widoczna | **Listingi (wszystkie kafle) + główne zdjęcie na karcie produktu**; plakietka przy cenie zostaje |
| Kolizja z badge’em z „Polecanych” | **Oba widoczne**, w różnych narożnikach |
| Forma | **Ukośna wstążka** (wariant C z makiet), granat + złoto, lewy dolny narożnik |
| Terminy | **Okno od–do na produkcie**, promocja włącza się i gaśnie sama |

Wariant z liczeniem okna przy renderze został odrzucony **z powodu Omnibusa, nie
z powodu ilości pracy**: `omnibus_price` jest denormalizowany, więc między
przejściami rozjechałby się z faktyczną ceną i etykieta „najniższa cena z 30 dni
przed obniżką" zaczęłaby kłamać. `pg_cron` odrzucony, bo logika Omnibusa jest
w TypeScripcie i musiałaby zostać zduplikowana w SQL-u — dwie implementacje tej
samej reguły prawnej to najgorsze możliwe miejsce na dryf.

## Zakres

W zakresie: migracja 69, nowy czysty moduł harmonogramu promocji, komponent
wstążki, jedna zmiana w `ProductCard` (obsługuje osiem miejsc z kaflem), nowy prop
w `ImageGallery`, rozbudowa bloku promocji w edytorze produktu wraz z walidacją
i ostrzeżeniem o Omnibusie, chip w liście produktów, endpoint crona plus wpis
w `vercel.json`, testy jednostkowe, weryfikacja na żywo Playwrightem.

Poza zakresem, świadomie: promocje na całą kategorię lub kolekcję, godzinowa
dokładność okien, wstążka na zestawach (`/zestaw` ma własny `BundleOffer`
z oszczędnością) i w feedzie do Merchant Center, procent zniżki na wstążce
(odrzucony wariant D z makiet), osobny tekst wstążki dla `/de`.

Jedna rzecz naprawiana po drodze, bo siedzi dokładnie w kodzie, który zmieniamy —
opisana w sekcji „Duplikat produktu”.

## Model danych

Migracja **`69_sale_schedule.sql`** dodaje do `products`:

| kolumna | typ | znaczenie |
|---|---|---|
| `sale_price_planned` | `numeric null` | cena promocyjna wpisywana w panelu |
| `sale_from` | `date null` | początek okna; puste = od razu |
| `sale_to` | `date null` | koniec okna **włącznie**; puste = bez końca |
| `promo_badge` | `text null` | ręczne nadpisanie napisu na wstążce, maks. 16 znaków |

`sale_price` **nie zmienia znaczenia dla frontu** — nadal jest „ceną obowiązującą
teraz”. Zmienia właściciela: formularz produktu przestaje ją zapisywać, pisze ją
wyłącznie reconciler. To jest sedno projektu — **żadne miejsce czytające cenę nie
wymaga zmiany**: `isOnSale`, `effectivePrice`, `variants.ts:salePriceFor`,
`feed.xml`, `product-feed.ts`, `api/checkout`, `BundleOffer`, `sleep-size.ts`,
JSON-LD na karcie produktu — wszystko zostaje jak jest.

Daty są **dniami w strefie Europe/Warsaw**. „Od 10.08” znaczy od 00:00 czasu
polskiego. Godzinowa dokładność jest poza zakresem — świadome zawężenie względem
słowa „terminy”.

## Harmonogram — kto i kiedy przełącza cenę

Nowy moduł `app/_lib/sale-schedule.ts`, dwuwarstwowo jak `pricing.ts` /
`price-history.ts` (czysta logika osobno od IO):

```ts
// czysta, testowalna bez Supabase — `today` wstrzykiwane
export function planSaleActivation(
  rows: {
    id: string; price: number; sale_price: number | null;
    sale_price_planned: number | null; sale_from: string | null; sale_to: string | null;
  }[],
  today: string,               // YYYY-MM-DD w strefie Europe/Warsaw
): { id: string; sale_price: number | null }[]
```

Cena obowiązuje, gdy `sale_price_planned` jest ustawione, **ściśle niższe od
`price`** (spójnie z `isOnSale`) i `today` mieści się w oknie (granice włącznie).
Zwracane są wyłącznie wiersze, w których stan faktyczny różni się od pożądanego —
funkcja jest **idempotentna**, drugie wywołanie na tych samych danych zwraca pustą
listę.

`today` liczone jest raz, po stronie wołającego:
`new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Warsaw" }).format(new Date())`
— format `sv-SE` daje `YYYY-MM-DD`, czyli dokładnie to, co trzyma kolumna `date`.
Wstrzykiwane jako parametr, żeby testy były deterministyczne (wzorem `now`
w `computePriceUpdates`).

Zapytanie crona nie skanuje całej tabeli — bierze wyłącznie wiersze, które mogą
wymagać przełączenia: `sale_price_planned is not null or sale_price is not null`.

Po zakończeniu okna `sale_price_planned` i daty **zostają w bazie** (zapis tego,
co było zaplanowane), a stan pokazuje „zakończona”. Reconciler nie wskrzesi takiej
promocji, bo `today` jest już za `sale_to`.

Warstwa IO: `applySaleSchedule(ids?)` — dla każdej zmiany `update sale_price`,
a następnie istniejące `recordPriceHistory(id)`, które dopisuje wiersz historii
i przelicza `omnibus_price` w jednej transakcji. **Zero nowej logiki Omnibusa.**
Kolejność jest istotna: najpierw cena, potem historia, bo `recordPriceHistory`
czyta aktualny stan produktu z bazy.

Wywoływana z dwóch miejsc:

- **po zapisie produktu** w `updateProductBasics` — promocja bez dat działa
  natychmiast, nie czeka na cron;
- **z crona** — przejścia o północy.

### Cron

`vercel.json` ma dziś `"crons": []`, więc wpis wchodzi bez nowej infrastruktury:

```json
{ "crons": [{ "path": "/api/cron/promocje", "schedule": "5 23 * * *" }] }
```

Godzina nie jest przypadkowa. Vercel liczy crony w **UTC**, a Polska ma zmianę
czasu — żadna stała godzina UTC nie trafia w lokalną północ przez cały rok.
`23:05 UTC` to `00:05` zimą i `01:05` latem, czyli **zawsze po lokalnej północy,
nigdy przed**. Wybieramy spóźnienie do 65 minut zamiast ryzyka, że promocja
„od 10.08" włączy się 9 sierpnia wieczorem. Na planie Hobby dzienny wpis jest
i tak jedyną legalną opcją; **na Pro wystarczy zmienić na `*/15 * * * *`** —
DST przestaje mieć znaczenie, dokładność schodzi do 15 minut, a idempotencja
sprawia, że częste odpalanie nic nie kosztuje.

`app/api/cron/promocje/route.ts`: `GET`, sprawdza `Authorization: Bearer
${CRON_SECRET}` (Vercel wstrzykuje nagłówek sam, gdy zmienna istnieje), woła
`applySaleSchedule()`, zwraca JSON z listą przełączonych produktów do logu,
`export const dynamic = "force-dynamic"`. Bez poprawnego sekretu → 401.

### Awarie i wyjścia awaryjne

| Co się psuje | Skutek | Wyjście |
|---|---|---|
| Cron nie odpalił | Promocja nie startuje; front pokazuje cenę regularną, panel mówi „zaplanowana" | Wejść w produkt i zapisać — reconciler jedzie po każdym zapisie |
| `apply_price_changes` padnie | Jedna transakcja (migr. 39), więc brak stanu połowicznego | Wiersz zostaje „zaplanowany", kolejny przebieg powtarza |
| Cena regularna zjechała poniżej promocyjnej | Reconciler wylicza „brak promocji" i gasi ją | Samo się leczy, linijka stanu wyjaśnia dlaczego |
| Koniec okna | `sale_price` → null, wiersz historii z ceną regularną, `omnibus_price` → null | Robi to istniejący `computePriceUpdates` |

Świadomie **nie** dodajemy przycisku „zastosuj teraz" — zapis produktu już to robi.

## Wstążka

Nowy komponent `app/_components/ui/PromoRibbon.tsx` — czysto prezentacyjny, bez
`"use client"` i bez importów serwerowych, żeby dał się użyć **i** z drzewa
serwerowego (`ProductCard`) **i** z klienckiego (`ImageGallery`):

```tsx
export default function PromoRibbon({ text, size = "card" }: {
  text: string;
  size?: "card" | "hero";   // card: rounded-2xl kafla, hero: rounded-3xl galerii
})
```

Granatowe tło (`--color-navy`), złoty tekst (`--color-gold-light`), uppercase
z `tracking`, obrót −45°, przyklejona do **lewego dolnego** narożnika, delikatny
`box-shadow` na wypadek ciemnego dołu zdjęcia. Przycięcie po łuku narożnika robi
istniejący `overflow-hidden` kontenera.

Reguła widoczności — jedna funkcja obok `isOnSale` w `pricing.ts`:

```ts
export function ribbonText(
  p: { price: number; sale_price: number | null; promo_badge: string | null },
  fallback: string,          // t.product.saleBadge → "Promocja" / "Sale"
): string | null {
  if (p.promo_badge) return p.promo_badge;                  // ręczne wygrywa
  return isOnSale(p.price, p.sale_price) ? fallback : null;   // automat z ceny
}
```

Z tej reguły wynika jeden przypadek, który trzeba nazwać wprost, żeby nikt go nie
wziął za błąd: **promocja zaplanowana na przyszłość + wpisany `promo_badge` pokazuje
wstążkę od razu**, przy cenie jeszcze regularnej. Tekst ręczny jest niezależny od
okna cenowego — to jest dokładnie ta swoboda, o którą prosiła koleżanka, i dokładnie
ten przypadek, w którym odpali ostrzeżenie o Omnibusie (bo nie ma **aktywnej** ceny
promocyjnej).

**Gdzie się pokazuje.** Jedna zmiana w `ProductCard.tsx` obsługuje wszystkie osiem
miejsc z kaflem: `/sklep`, „Polecane" na home (`page.tsx:180`), `ProductsBlock`
w podstronach, trzy karuzele na karcie produktu (polecane / podobne / cross-sell),
`/ulubione` i cross-sell w `/koszyk`. Dodatkowo karta produktu: `ImageGallery`
dostaje nowy prop `ribbon`, liczony serwerowo w `produkt/[id]/page.tsx`.

**Gdzie się nie pokazuje** — decyzje, nie przeoczenia:

- **w lightboxie i na miniaturach** — po powiększeniu klient patrzy na mebel;
  wstążka jest elementem interfejsu, nie częścią fotografii;
- **na `/zestaw`** — zestawy mają własną prezentację oszczędności, dwa mechanizmy
  rabatu na jednym ekranie by się gryzły;
- **w feedzie i obrazkach OG** — feed przenosi cenę, nie plakietki.

**Narożniki.** „Bestseller" z Polecanych zostaje w lewym górnym, serce ulubionych
w prawym górnym, wstążka w lewym dolnym. Trzy różne narożniki, brak nakładania.

**Detale rozstrzygnięte przy projekcie:**

- `promo_badge` **maks. 16 znaków** (walidacja + podpowiedź). Wstążka ma stałą
  geometrię: „Wyprzedaż −30%” (14) wchodzi, dłuższy tekst rozjeżdża kąt.
- **DE dostaje ten sam tekst ręczny** (pass-through, jak `size_label`), bo
  `promo_badge` nie ma kolumny `_de`. Napis automatyczny idzie ze słownika, więc
  `/de` samo pokaże „Sale". `/de` jest i tak zamrożone flagą `DE_ENABLED`.
- **Na karcie produktu wstążka dostaje `aria-hidden`**, bo obok ceny stoi już
  plakietka „Promocja" i czytnik przeczytałby to dwa razy. Na kaflach wstążka
  jest jedynym takim komunikatem, więc tam zostaje czytana.

## Panel admina

Pole „Cena promocyjna (zł)" w sekcji *Podstawy* (`ProductEditor.tsx:315`) rozwija
się w blok **Promocja**. Zostaje w tym samym formularzu co `price`, bo walidacja
porównuje cenę planowaną z regularną i obie muszą jechać jednym zapisem.

| pole | kolumna | podpowiedź |
|---|---|---|
| Cena promocyjna (zł) | `sale_price_planned` | „Musi być niższa od ceny regularnej." |
| Od | `sale_from` | „Puste = promocja startuje od razu." |
| Do (włącznie) | `sale_to` | „Puste = promocja bez końca — trzeba ją wyłączyć ręcznie." |
| Napis na wstążce | `promo_badge` | „Puste = «Promocja». Maks. 16 znaków." |

Nad blokiem **linijka stanu tylko do czytania**, liczona tą samą czystą funkcją co
reconciler: „aktywna — do 17.08" / „zaplanowana — startuje 10.08" / „zakończona
17.08" / „brak promocji". Jest wymaganiem, nie ozdobą: `sale_price` nie jest już
edytowalne, więc bez tej linijki system wygląda na zepsuty.

Walidacja w `updateProductBasics`, dokładana do istniejących reguł:

- cena promocyjna ≥ cena regularna → błąd (reguła istnieje, treść bez zmian);
- `sale_to` wcześniejsze niż `sale_from` → „Data końca nie może być przed datą początku";
- daty bez ceny promocyjnej → „Podaj cenę promocyjną albo wyczyść daty";
- `promo_badge` ucinany do 16 znaków istniejącym `sanitize`.

### Ostrzeżenie o Omnibusie

Czysta funkcja obok reguły widoczności:

```ts
export function looksLikeDiscountClaim(text: string): boolean
// dopasowuje: promocja/promo, sale, rabat, %, wyprzedaż, obniż, taniej, okazja
// po normalizacji polskich znaków i lowercase
```

Napis sugerujący obniżkę + brak **aktywnej** ceny promocyjnej → ostrzeżenie
**na żywo pod polem**, bez zapisu, czerwona ramka:

> Ten napis sugeruje obniżkę, a produkt nie ma aktywnej ceny promocyjnej.
> Dyrektywa Omnibus wymaga wtedy pokazania najniższej ceny z 30 dni przed
> obniżką. Ustaw cenę promocyjną albo zmień napis na taki, który nie mówi
> o cenie — np. „Nowość", „Ostatnie sztuki".

Zapis przechodzi — decyzja zostaje po stronie człowieka, zgodnie z decyzją
właściciela.

### Chip w liście produktów

`ProductsList.tsx:105` pokazuje dziś `kategoria · cena · stock`. Dokładamy chip
w jednym z trzech stanów, liczony tą samą funkcją co linijka stanu w edytorze:
**„Promocja"** (cena promocyjna aktywna teraz), **„Zaplanowana"** (okno jeszcze nie
otwarte) albo **„Wstążka"** (sam `promo_badge`, bez obniżki ceny). Brak oznaczeń =
brak chipa. Powód jest konkretny: promocja z datami gaśnie sama, ale
**ręczny `promo_badge` nie ma terminu i nigdy nie zgaśnie**. Bez widoku „które
produkty mają oznaczenie" po kilku miesiącach na sklepie wisi kilka wstążek,
o których nikt nie pamięta. Dwie linijki w projekcji w `page.tsx` i jedna w liście.

## Duplikat produktu — naprawa po drodze

`buildDuplicatePayload` (`_lib/new-product.ts:164`) kopiuje `sale_price` do
duplikatu, ale **świadomie zeruje `omnibus_price`** — komentarz w linii 155 wprost
mówi „zgodność z Omnibusem". Te dwie decyzje są ze sobą sprzeczne: kopia dostaje
obniżoną cenę z przekreśloną regularną, nie mając ani „najniższej ceny z 30 dni",
ani jednego wiersza w `price_history`. Duplikat powstaje jako ukryty szkic
(`is_active: false`), więc dziś nie wisi publicznie — ale wystarczy, że ktoś go
aktywuje bez dotykania cen.

Poprawka: duplikat **nie dziedziczy promocji** — `sale_price: null` oraz puste
`sale_price_planned`, `sale_from`, `sale_to`, `promo_badge`. Dla świeżej oferty nie
istnieje cena sprzed 30 dni, więc nie ma czego ogłaszać; promocję włącza się po
utworzeniu i wtedy historia startuje poprawnie. Jedna linia i test.

Formularz nowego produktu (`NewProductForm`) **nie dostaje pól promocji** — nowy
produkt zakłada się bez promocji, ustawia się ją po utworzeniu.

## Testy

Jednostkowe (vitest, wzorem `pricing.test.ts`):

- `planSaleActivation` — okno otwarte / zamknięte / bez dat / cena planowana ≥
  regularna / **idempotencja** (drugie wywołanie zwraca pustą listę) / granice
  okna włącznie z pierwszym i ostatnim dniem;
- `ribbonText` — precedencja: ręczne > automat z ceny > nic;
- `looksLikeDiscountClaim` — „Wyprzedaż −30%", „PROMOCJA", „obniżka" → true;
  „Nowość", „Ostatnie sztuki" → false;
- złożenie `planSaleActivation` + `computePriceUpdates` — po przejściu okna wchodzi
  wiersz historii, `omnibus_price` ustawia się przy starcie i zeruje przy końcu;
- `buildDuplicatePayload` — kopia bez promocji.

E2E (Playwright): wstążka widoczna na kaflu w `/sklep` i na głównym zdjęciu karty
produktu; brak wstążki w lightboxie.

## Weryfikacja na żywo i znane blokery

Ta ścieżka **nigdy nie działała na produkcji** — żaden produkt nie ma `sale_price`,
więc przekreślona cena, plakietka przy cenie i etykieta Omnibus są nieprzetestowane
w realnym renderze. Plan: ustawić promocję na jednym produkcie, zrobić zrzuty
`/sklep` i karty produktu Playwrightem **w jasnym i ciemnym motywie** (kontrast
granatowej wstążki na zdjęciu trzeba zobaczyć, nie wydedukować), sprawdzić etykietę
Omnibus, odpalić route crona ręcznie z sekretem.

Blokery do obsłużenia przy wdrożeniu:

- **Migracje w tym projekcie nie aplikują się same.** Po merge trzeba puścić
  `apply_migration` przez MCP i potwierdzić `list_tables`.
- **Sesja admina do e2e wygasła** (2026-07-29), a `.env.e2e` nie ma danych
  logowania — e2e panelu wymaga najpierw odnowienia sesji. Zrzuty frontu (kafle,
  karta produktu) nie wymagają logowania.
- **`CRON_SECRET` w Vercelu wymaga Redeploy** — samo dodanie zmiennej nie wystarczy.
- Wpisy `crons` z `vercel.json` aktywują się dopiero na deploymencie produkcyjnym.
- `feed.xml` ma `revalidate = 3600`, więc feed do Merchant Center dogoni zmianę
  ceny z opóźnieniem do godziny — tak samo jak dziś przy ręcznej zmianie ceny.

## Pliki

Nowe: `supabase/migrations/69_sale_schedule.sql`, `app/_lib/sale-schedule.ts`,
`app/_lib/__tests__/sale-schedule.test.ts`,
`app/_components/ui/PromoRibbon.tsx`, `app/api/cron/promocje/route.ts`.

Zmieniane: `app/_lib/pricing.ts` (+`ribbonText`, +`looksLikeDiscountClaim`),
`app/_lib/types.ts` (nowe kolumny w `Product`), `app/_lib/new-product.ts`
(duplikat bez promocji), `app/_components/ui/ProductCard.tsx`,
`app/_components/ui/ImageGallery.tsx`, `app/produkt/[id]/page.tsx`,
`app/admin/produkty/[id]/ProductEditor.tsx`, `app/admin/produkty/actions.ts`,
`app/admin/produkty/page.tsx`, `app/admin/produkty/ProductsList.tsx`,
`vercel.json`.
