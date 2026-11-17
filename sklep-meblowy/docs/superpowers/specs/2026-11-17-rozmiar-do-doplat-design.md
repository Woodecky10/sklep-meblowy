# Rozmiar mebla do dopłat za tkaninę — projekt

Data: 2026-11-17. Status: zaakceptowany; trzy decyzje autora przyjęte bez wyraźnego potwierdzenia właściciela (do potwierdzenia).

## Po co

Dopłata za tkaninę jest dziś taka sama dla każdego mebla: `dopłata grupy + korekta tkaniny`
(`expandFabrics`, `rebuildFabricValuePrices` w `app/_lib/variants.ts`). Fotel zużywa mniej
tkaniny niż narożnik, więc za tę samą tkaninę ma dopłacać mniej.

## Wybrane podejście

Osoba zarządzająca sklepem wybrała wariant „rozmiar z listy" i nie chce procentów.

- W panelu Tkaniny jest lista **rozmiarów do dopłat**. Każdy rozmiar ma nazwę i własną dopłatę
  w złotych dla każdej z trzech grup cenowych tkanin (`standard`, `premium`, `premium_high`).
- Kategoria może mieć rozmiar domyślny.
- Produkt może mieć rozmiar wybrany ręcznie albo własne dopłaty (mebel nietypowy).
- Dopłata wartości tkaniny w produkcie = `dopłata grupy wg rozmiaru + korekta tkaniny`.

Kolejność rozstrzygania dla produktu (pierwsze, co istnieje):

1. własne dopłaty produktu,
2. rozmiar wybrany na produkcie,
3. rozmiar domyślny kategorii **głównej** produktu,
4. globalna dopłata grupy (stan dzisiejszy).

Grupa, której rozmiar nie wycenia (brak klucza), bierze globalną dopłatę grupy, nigdy 0.

## Odrzucone podejścia

- **Procent per produkt** — ręczne wpisywanie przy każdym produkcie, niespójne.
- **Procent na kategorii / na rozmiarze** — najmniej utrzymania przy zmianie cen, ale osoba
  zarządzająca wybrała kwoty, nie procenty.
- **Sama tabela grupa × typ bez przypisania do produktu** — nie obsługuje wyjątków.

## Cele

- Nowy fotel dostaje niższą dopłatę bez dodatkowego kroku (rozmiar z kategorii).
- 421 istniejących produktów nie wymaga ręcznego przypisywania.
- Do czasu zdefiniowania rozmiarów ceny i wygląd sklepu się nie zmieniają.
- Klient na karcie produktu widzi dopłatę grupy właściwą dla tego mebla.

## Poza zakresem

- Procenty i automatyczne przeliczanie rozmiarów po zmianie globalnej dopłaty grupy.
- Skalowanie korekty pojedynczej tkaniny (`fabrics.price`) — zostaje doliczana bez zmian.
- Wersja DE poza dwoma nowymi napisami w słowniku.
- Zestawy, koszyk, checkout: czytają dopłaty zapisane w `products.variants`, bez zmian.

## Ustalenia z kodu, które kształtują projekt

- Dopłaty są zapisane per produkt w `variants.options[Tkanina].value_prices`; checkout liczy
  z nich (`checkout-pricing.ts`). Wystarczy więc zmienić mapę dopłat grup podawaną do
  `expandFabrics` i `rebuildFabricValuePrices`; ich sygnatury zostają.
- „Rozmiar" w edytorze produktu już istnieje (`size_label`, np. „140×200 cm") i znaczy co
  innego. Nowe pole nazywa się **„Rozmiar do dopłat za tkaninę"**, w kodzie `fabric_size`.
- Łóżka w różnych szerokościach to osobne produkty (`size_group`), więc każda szerokość może
  dostać własny rozmiar do dopłat. Osobny mechanizm dla szerokości nie jest potrzebny.
- Drzewa „Szybka dostawa" i „Nasze realizacje" dublują kategorie; każda z nich dostaje ten sam
  rozmiar domyślny.
- Baza jest wspólna z produkcją, migracje aplikuje się ręcznie.

## Decyzje podjęte przez autora (do potwierdzenia)

- Strony `/tkaniny` i `/tkaniny/[slug]`: napis „dopłata zależy od mebla" zamiast kwoty
  „+250 zł" pojawia się przy grupie tylko wtedy, gdy któryś rozmiar wycenia tę grupę inaczej
  niż jej globalna dopłata. Inaczej zostaje kwota (na stronie tkaniny: dopłata grupy + korekta
  tkaniny), a przy zerze „bez dopłaty". Własne dopłaty pojedynczych produktów tego napisu nie
  zmieniają.
- Plakietka „bez rozmiaru" na liście produktów pojawia się dopiero, gdy istnieje choć jeden
  rozmiar, i tylko przy produktach z opcją „Tkanina".
- Usunięcie rozmiaru nie jest blokowane: produkty i kategorie wracają do kolejnego poziomu
  rozstrzygania, a dopłaty są przeliczane.

## Znane ograniczenie zastane

Ręczna zmiana dopłaty tkaniny z katalogu w edytorze wariantów jest nadpisywana przy każdym
przeliczeniu katalogu. Tak jest dziś i ten projekt tego nie zmienia; właściwą drogą dla wyjątku
stają się własne dopłaty produktu.
