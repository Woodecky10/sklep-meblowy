# Podpowiedź brakującego wyboru przy „Dodaj do koszyka" i „Kup teraz" — projekt

Data: 2026-11-18. Status: zaakceptowany przez właściciela (makieta, wariant ze stałą podpowiedzią, razem z zestawami).

## Po co

Na karcie produktu z wariantami oba przyciski są wyszarzone, dopóki klient nie wybierze
wszystkich opcji. „Dodaj do koszyka" zmienia napis na „Wybierz wariant", „Kup teraz" tylko
blednie, kliknięcie nic nie robi i nigdzie nie widać, której opcji brakuje. To samo dzieje się
w konfiguratorze zestawu (napis „Wybierz opcje dla każdego mebla").

## Zachowanie po zmianie

Dotyczy karty produktu (`ProductActions`) i konfiguratora zestawu (`BundleConfigurator`, czyli
okno „Kup w zestawie" i strona `/zestaw/[slug]`).

1. Przyciski mają stały napis („Dodaj do koszyka" / „Dodaj zestaw do koszyka", „Kup teraz")
   i nie są blokowane z powodu brakującego wyboru. Napisy „Wybierz wariant" i „Wybierz opcje
   dla każdego mebla" znikają z przycisków.
2. Dopóki czegoś brakuje, nad przyciskami stoi szara linijka „Do wyboru: Tkanina, Strona".
3. Kliknięcie przycisku przy niepełnym wyborze niczego nie dodaje. Linijka zmienia się
   w czerwony komunikat „Wybierz jeszcze: Tkanina, Strona", brakujące opcje dostają czerwoną
   obwódkę, a strona (albo okno zestawu) przewija się do pierwszej z nich. Kolejne kliknięcie
   przewija ponownie.
4. Po wybraniu opcji jej obwódka znika, a komunikat się skraca. Gdy nic nie brakuje, komunikat
   znika i przyciski działają jak dziś.
5. W zestawie komunikat wymienia meble osobno: „Nazwa mebla: Tkanina, Strona".

Nazwy opcji w komunikacie są te same, co nagłówki w selektorze (nadpisania admina, DE).

## Podejścia

- **Wybrane: przyciski aktywne + komunikat i podświetlenie po kliknięciu, ze stałą szarą
  podpowiedzią.** Klient zawsze wie, czego brakuje, i dostaje reakcję na kliknięcie.
- Odrzucone: zostawić blokadę i dodać sam tekst pod przyciskiem — kliknięcie nadal nic by nie
  robiło, a to jest zgłoszony problem.
- Odrzucone: dymek/tooltip na zablokowanym przycisku — nie działa na telefonie.

## Poza zakresem

- Okrągły przycisk na kartach w listach (`QuickAddButton`, link z etykietą „Wybierz wariant")
  zostaje bez zmian; klucz słownika `product.selectVariant` zostaje dla niego.
- Bez zmian w koszyku, checkoucie i bazie. Bez migracji.
- Blokada drugiego kliknięcia w trakcie przejścia na `/koszyk` zostaje.

## Decyzje autora

- Podświetlenie to obwódka (`outline`), nie ramka z odstępem, żeby układ selektora nie skakał.
- Flaga „klient już kliknął" nie gaśnie po uzupełnieniu jednej opcji; gaśnie naturalnie, gdy
  nic nie brakuje (komunikatu wtedy nie ma).
- W zestawie mebel jest nazywany pełną nazwą produktu, taką jak w nagłówku jego sekcji.
