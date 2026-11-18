# Uwagi do całego zamówienia — projekt (krótki)

Data: 2026-11-18. Status: zatwierdzony przez właściciela.

## Po co

Dziś klient może wpisać uwagi tylko przy pojedynczym produkcie w koszyku (`order_items.notes`).
Uwagę ogólną („proszę o telefon dzień przed dostawą") musi dopisywać przy którymś produkcie.

## Zachowanie

- Checkout: nowa sekcja „Uwagi do zamówienia (opcjonalnie)" między „Wniesieniem mebli"
  a „Płatnością". Pole wieloliniowe, placeholder „np. proszę o telefon dzień przed dostawą,
  domofon nie działa", licznik „N / 1000 znaków". DE: „Anmerkungen zur Bestellung (optional)".
- Limit 1000 znaków (przycinane na serwerze); puste lub same spacje = nic nie zapisujemy.
- Uwagi widać: w karcie zamówienia w panelu (karta obok „Adresu dostawy"), w mailu
  z potwierdzeniem dla klienta, w mailu o nowym zamówieniu dla sklepu, w historii zamówienia
  na koncie klienta. Można je poprawić w edycji zamówienia w panelu.
- Uwagi do produktów w koszyku i „Notatka admina" (wewnętrzna) bez zmian.

## Podejście

Jedna nowa kolumna `orders.customer_note text` (migracja 87). Odrzucone: wpisywanie uwagi do
`admin_note` (miesza wewnętrzne notatki z tym, co pisze klient, i klient widziałby notatki
sklepu) i doklejanie do uwag pierwszej pozycji (zamówienie bez pozycji-produktu, kasowanie
pozycji w edycji gubi uwagę).

## Decyzje autora

- Formularz nowego zamówienia z Allegro/OLX nie dostaje pola — uwagę dopisuje się w edycji.
- Zmiana samej uwagi w edycji zamówienia nie dopisuje linii śladu do notatki admina
  (ślad dotyczy sum); zapis bez zmian dalej nie dopisuje niczego.
- Kolumna opcjonalna w typie `Order` (`customer_note?: string | null`): `select("*")` przed
  migracją daje `undefined`.

## Wdrożenie

Migracja 87 PRZED merge — bez niej insert zamówienia z nową kolumną się wywraca, czyli
składanie zamówień przestaje działać. Tokeny Supabase dają 401, więc migrację wkleja
właściciel w SQL Editorze (albo nowy token w `.mcp.json`).
