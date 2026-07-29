# Jak dodać kategorię — instrukcja krok po kroku

Kategorie tworzysz w panelu sklepu i widać je natychmiast — nie ma żadnego
drugiego systemu ani synchronizacji. Wszystko dzieje się na
**https://mollien.pl/admin/kategorie**.

> **Jak to jest zorganizowane:** kategorie leżą w **grupach**. Grupa to pozycja
> w górnym menu sklepu (np. „SOFY", „ŁÓŻKA"), a kategorie w niej to rozwijana
> lista pod nią (np. „Sofa 2-osobowa", „Sofa 3-osobowa"). Produkt przypisujesz
> do **kategorii**, nie do grupy.

---

## Krok 1 — Wejdź w kategorie

1. Wejdź na **https://mollien.pl/admin/kategorie** (zaloguj się jako admin, jeśli trzeba)
2. Zobaczysz listę grup, a w każdej jej kategorie

## Krok 2 — Dodaj kategorię do grupy

1. Znajdź grupę, w której kategoria ma się znaleźć — np. „SOFY", „ŁÓŻKA", „PUFY"
2. Kliknij **„+ Dodaj kategorię do tej grupy"** pod jej listą
   - Jeśli potrzebujesz zupełnie nowej pozycji w menu, użyj **„+ Nowa grupa"** na górze strony
3. Wypełnij formularz:
   - **Nazwa wyświetlana** *(wymagane)* → tekst, który zobaczy klient, np. `Komody`
   - **Nazwa po niemiecku (DE)** → nazwa na `/de`. Puste = pokaże się polska
   - **Grupa** *(wymagane)* → już wybrana, jeśli kliknęłaś „Dodaj do tej grupy"
   - **Slug (link)** → zostaw puste, wygeneruje się z nazwy (`komody`)
   - **Kolejność** → mniejsze liczby idą pierwsze (`0`, `1`, `2`…). Można zmienić później
4. Kliknij **„Dodaj kategorię"**

> ✅ Kategoria pojawia się w menu sklepu i w filtrach **od razu**, bez czekania
> i bez deployu.

> ⚠️ Nowa kategoria jest na starcie **pusta** — dopóki nie przypiszesz do niej
> produktów, klient zobaczy komunikat o braku produktów.

---

## Krok 3 — Wrzuć do niej produkty

Produkty dodajesz i edytujesz w **https://mollien.pl/admin/produkty**.

**Nowy produkt:** przycisk **„+ Nowy produkt"** → wypełnij **Nazwa**,
**Cena (zł)** i **Kategoria** (tam wybierasz właśnie tę nową kategorię) →
zapisz. Potem w edycji produktu dodasz zdjęcia, opis, warianty, wymiary itd.

**Istniejący produkt przenieść do nowej kategorii:** wejdź w produkt na liście
i zmień pole **Kategoria** → zapisz.

---

## Dobór materacy do łóżek (tylko kategorie łóżek)

W formularzu **edycji kategorii**, na samym dole, jest sekcja **„Polecaj
klientom z tych kategorii (cross-sell)"**. Tam zaznaczasz, z jakich kategorii
mają się proponować produkty pod danym produktem i w koszyku — dla łóżek są to
kategorie materacy. Rozmiar dobiera się sam (łóżko 160×200 → materace 160×200),
na podstawie etykiety rozmiaru produktu.

> ⚠️ **Kolejność klikania = kolejność wyświetlania.** Kafelki zapisują się w tej
> kolejności, w jakiej je klikasz, i w takiej klient zobaczy materace. Dziś jest
> kieszeniowe → piankowe → nawierzchniowe, żeby pełnowartościowe materace szły
> przed cienkimi topperami. Żeby przestawić: odklikaj wszystkie i kliknij od nowa.

---

## Zmiana, ukrycie i usunięcie kategorii

### Edycja

`/admin/kategorie` → **„Edytuj"** przy kategorii → zmień → **„Zapisz"**.
Zmiany widać na stronie natychmiast.

> ⚠️ Zmiana **slugu** przestawia linki do kategorii (baza aktualizuje powiązania
> sama). Klient z otwartą starą zakładką zobaczy 404 — rzadki przypadek, ale
> lepiej nie zmieniać slugów bez potrzeby.

### Ukrycie (zalecane zamiast usuwania)

Edytuj kategorię → odznacz **„Pokazuj w sklepie"** → Zapisz.
Kategoria znika z nawigacji, produkty w niej zostają. Można ją włączyć z powrotem.

### Trwałe usunięcie

`/admin/kategorie` → kategoria → **„Usuń"**.

> ⚠️ **Nie da się usunąć kategorii, która ma produkty.** System pokaże, ile
> produktów trzeba najpierw przenieść. Przenieś je (pole **Kategoria** w edycji
> produktu) albo ukryj kategorię zamiast usuwać.

---

## Wersja niemiecka

Jeśli wypełnisz **Nazwa po niemiecku (DE)**, kategoria od razu ma poprawną nazwę
na `/de`. Bez tego pola na `/de` pokaże się nazwa polska — nic się nie psuje,
ale wygląda niespójnie.

---

## Streszczenie

```
/admin/kategorie → grupa → „+ Dodaj kategorię do tej grupy"
        ↓
Nazwa (+ DE), kolejność → „Dodaj kategorię"
        ↓
/admin/produkty → „+ Nowy produkt" (albo edycja istniejącego)
   → pole Kategoria = nowa kategoria
        ↓
✅ Kategoria w menu, produkty w niej widoczne od razu
```
