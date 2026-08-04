# Jak dodać kategorię — instrukcja krok po kroku

Kategorie tworzysz w panelu sklepu i widać je natychmiast — nie ma żadnego
drugiego systemu ani synchronizacji. Wszystko dzieje się na
**https://mollien.pl/admin/kategorie**.

> **Jak to jest zorganizowane:** kategorie tworzą **drzewo**. Każda kategoria
> może mieć podkategorie, te mogą mieć swoje własne, i tak dowolnie głęboko.
> Pozycje **najwyższego poziomu** (te bez rodzica) to zakładki w górnym menu
> sklepu. Produkt przypisujesz do dowolnej kategorii — także takiej, która ma
> podkategorie.

Nie ma już osobnych „grup" i „kategorii". Jest jedna lista, w której o wszystkim
decyduje to, **co jest czyim rodzicem**.

---

## Krok 1 — Wejdź w kategorie

1. Wejdź na **https://mollien.pl/admin/kategorie** (zaloguj się jako admin, jeśli trzeba)
2. Zobaczysz drzewo: pozycje najwyższego poziomu, a pod nimi — z wcięciem — ich podkategorie
3. Przy każdej pozycji są dwie liczby: ile produktów ma **ona sama** i ile ma
   **razem z podkategoriami**

> ℹ️ **Te liczby obejmują też produkty ukryte**, a sklep pokazuje klientowi
> tylko widoczne. Dlatego panel może pisać „84 w poddrzewie", a listing w
> sklepie policzy 83 — różnica to produkty, które sama schowałaś. Nic się nie
> psuje, po prostu panel pokazuje pełny stan magazynu, a sklep ofertę.

## Krok 2 — Dodaj kategorię

Są dwie drogi — wybierz tę, która pasuje do sytuacji:

- **Nowa zakładka w menu** → przycisk **„+ Nowa pozycja menu"** na górze strony.
- **Podkategoria pod istniejącą pozycją** → przycisk **„+ Podkategoria"** przy
  tej pozycji, na jej wierszu. To najszybsza droga: pole „Rodzic" w formularzu
  jest już ustawione na tę pozycję, więc nie musisz go wybierać ręcznie.

Obie drogi otwierają ten sam formularz, tylko z inaczej ustawionym polem
„Rodzic":

1. Kliknij **„+ Nowa pozycja menu"** (albo **„+ Podkategoria"** przy wybranej pozycji)
2. Wypełnij formularz:
   - **Nazwa wyświetlana** *(wymagane)* → tekst, który zobaczy klient, np. `Komody`
   - **Rodzic** → gdzie ta kategoria ma wisieć. Zostaw **„— najwyższy poziom —"**,
     jeśli ma być nową zakładką w menu; wybierz istniejącą kategorię, jeśli ma być
     jej podkategorią. Po kliknięciu „+ Podkategoria" to pole jest już wypełnione
   - **Nazwa po niemiecku (DE)** → nazwa na `/de`. Puste = pokaże się polska
   - **Slug (link)** → zostaw puste, wygeneruje się z nazwy (`komody`)
   - **Kolejność** → mniejsze liczby idą pierwsze. Nie musisz tego ruszać —
     kolejność łatwiej ustawić przeciąganiem (Krok 3)
3. Kliknij **„Dodaj kategorię"**

> ✅ Kategoria pojawia się w menu sklepu i w filtrach **od razu**, bez czekania
> i bez deployu.

> ⚠️ Nowa kategoria jest na starcie **pusta** — dopóki nie przypiszesz do niej
> produktów ani podkategorii z produktami, klient zobaczy komunikat o braku
> produktów.

---

## Krok 3 — Ustaw kolejność i przenieś tam, gdzie chcesz

To są **dwie różne rzeczy** i warto je rozdzielić, bo to najczęstsze
nieporozumienie:

**Kolejność — przeciąganie.** Chwytasz pozycję za uchwyt i przesuwasz w górę
albo w dół. Przeciąganie działa **tylko wśród rodzeństwa**, czyli w obrębie
jednego rodzica. Nie da się przeciągnięciem wrzucić kategorii pod inną —
i to jest zamierzone, bo inaczej łatwo byłoby przenieść pół sklepu jednym
nieuważnym ruchem.

> ℹ️ **W momencie chwycenia karty podkategorie na tym poziomie się chowają**,
> a lista skraca się do samych przenoszonych pozycji. Tak ma być: dzięki temu
> widzisz dokładnie tę kolejność, która zostanie zapisana, i nie musisz się
> domyślać, gdzie karta wyląduje. Po puszczeniu (albo po wciśnięciu `Esc`)
> podkategorie wracają na swoje miejsce.

**Przeniesienie — pole „Rodzic".** Żeby kategoria trafiła w inne miejsce
drzewa, wejdź w **„Edytuj"** i zmień pole **Rodzic**. To wszystko. Wybór
„— najwyższy poziom —" wyciąga ją na własną zakładkę w menu.

> ℹ️ W polu „Rodzic" nie da się wybrać samej edytowanej kategorii ani żadnej
> z jej własnych podkategorii — te pozycje po prostu nie pojawiają się na
> liście. Gdyby były, dałoby się zrobić z drzewa pętlę i menu przestałoby
> działać.

---

## Ile z tego widzi klient

- W **górnym menu** klient widzi **trzy poziomy**: zakładkę, jej podkategorie
  i jeszcze jeden poziom pod nimi.
- Jeśli zejdziesz **głębiej niż trzy poziomy**, te głębsze kategorie nadal
  działają — klient znajdzie je jako **paski odnośników nad produktami** na
  stronie kategorii. Nic nie ginie, po prostu menu nie robi się nieskończone.
- **Listing kategorii pokazuje też produkty z jej podkategorii.** Klient, który
  kliknie „MATERACE", zobaczy wszystkie materace ze wszystkich podkategorii
  razem, a nie pustą stronę. Dlatego warto przypinać produkty do najbardziej
  szczegółowej kategorii, jaka pasuje — wyżej pojawią się same.

---

## Jak zbudować wspólną zakładkę „MEBLE"

Dziś w menu jest osiem osobnych zakładek. Jeśli chcesz je schować pod jedną
pozycją „MEBLE", zrób to tak:

1. **Dodaj kategorię „Meble"** z polem Rodzic ustawionym na
   „— najwyższy poziom —". Nic więcej.

   > ⚠️ Po tym kroku w menu jest **o jedną zakładkę więcej** i „Meble" jest
   > jeszcze pusta. Tak ma być — nie przerywaj, po prostu przejdź dalej.

2. **Wejdź w każdą dzisiejszą zakładkę po kolei** — Narożniki, Sofy, Fotele,
   Materace, Pufy, Łóżka, Nasze realizacje, Schodki dla pupila — kliknij
   **„Edytuj"** i ustaw **Rodzic = Meble**. Zapisz.

   Po każdym zapisie ta pozycja znika z górnego paska i pojawia się pod „Meble".
   Menu robi się coraz krótsze — to znak, że idzie dobrze.

3. **Na koniec ustaw kolejność.** Rozwiń „Meble" i poprzeciągaj jej
   podkategorie w takiej kolejności, w jakiej mają się pokazywać klientowi.

Efekt: jedna zakładka „MEBLE", pod nią dawne zakładki, a pod nimi ich
kategorie. Wtedy właśnie zaczynają działać wszystkie trzy poziomy menu.

> ⚠️ **Uprzedzenie: zmieni się też stopka.** Kolumny w stopce to pozycje
> najwyższego poziomu, a pod nimi ich podkategorie. Dziś jest tam osiem kolumn.
> Jeśli wciągniesz wszystko pod „MEBLE", **stopka zwinie się do jednej kolumny**
> „MEBLE" z listą dawnych zakładek. To nie awaria — stopka po prostu pokazuje
> to samo drzewo co menu. Jeśli wolisz zachować szeroką stopkę, zostaw część
> pozycji na najwyższym poziomie albo powiedz, zmienimy sposób, w jaki stopka
> czyta drzewo.

Nie musisz przenosić wszystkiego. Możesz zostawić część pozycji na najwyższym
poziomie — na przykład „Nasze realizacje" obok „MEBLE", jeśli mają być
równorzędne.

---

## Dobór materacy do łóżek (tylko kategorie łóżek)

W formularzu **edycji kategorii**, na samym dole, jest sekcja **„Polecaj
klientom z tych kategorii (cross-sell)"**. Tam zaznaczasz, z jakich kategorii
mają się proponować produkty pod danym produktem i w koszyku — dla łóżek są to
kategorie materacy. Rozmiar dobiera się sam (łóżko 160×200 → materace 160×200),
na podstawie etykiety rozmiaru produktu.

> ℹ️ **Możesz zaznaczyć całą pozycję menu zamiast pojedynczych podkategorii.**
> Zaznaczenie „MATERACE" znaczy „ten węzeł i wszystko pod nim" — tak samo jak
> listing kategorii. Wtedy kolejność propozycji bierze się **z drzewa**, czyli
> z tej, którą ustawiasz przeciąganiem w panelu.
>
> ⚠️ Ale uwaga, bo to zmienia asortyment propozycji: dziś dla „Łóżek
> tapicerowanych" zaznaczone są **tylko materace kieszeniowe i piankowe** —
> nawierzchniowe (toppery) są **świadomie pominięte**. Gdybyś zaznaczyła całe
> „MATERACE", toppery zaczęłyby się proponować razem z pełnowartościowymi
> materacami. Jeśli mają być dalej pomijane, zostaw zaznaczone pojedyncze
> podkategorie.
>
> ⚠️ **Przy zaznaczaniu pojedynczych podkategorii kolejność klikania NIE ma
> znaczenia** — zapisują się w kolejności, w jakiej są wypisane w panelu, czyli
> alfabetycznie. Dziś to nic nie psuje (alfabetycznie wypada kieszeniowe przed
> piankowymi, czyli tak jak ma być), ale gdybyś chciała kolejność inną niż
> alfabetyczna, samym klikaniem jej nie ustawisz — powiedz, poprawimy panel.

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

> ⚠️ **Ukrycie kategorii chowa całą gałąź pod nią.** Jeśli odznaczysz to na
> pozycji z menu, zniknie ona **razem ze wszystkimi swoimi podkategoriami** —
> z menu, ze stopki i z filtrów. Nie musisz chować ich po jednej.
>
> Produkty z tych kategorii **zostają w sklepie** i nadal da się do nich dojść
> (wyszukiwarka, bezpośredni link, polecane). Ukrycie porządkuje nawigację, nie
> wycofuje towaru ze sprzedaży.

Można ją włączyć z powrotem w każdej chwili.

### Trwałe usunięcie

`/admin/kategorie` → kategoria → **„Usuń"**.

Są dwie blokady i obie powiedzą wprost, co zrobić:

> ⚠️ **Nie da się usunąć kategorii, która ma podkategorie.** System pokaże, ile
> ich jest. Najpierw przenieś je gdzie indziej (pole **Rodzic**) albo usuń.

> ⚠️ **Nie da się usunąć kategorii, która ma produkty.** System pokaże, ile
> produktów trzeba najpierw przenieść. Przenieś je (pole **Kategoria** w edycji
> produktu) albo ukryj kategorię zamiast usuwać.

---

## Krok 4 — Wrzuć produkty

Produkty dodajesz i edytujesz w **https://mollien.pl/admin/produkty**.

**Nowy produkt:** przycisk **„+ Nowy produkt"** → wypełnij **Nazwa**,
**Cena (zł)** i **Kategoria** → zapisz. Potem w edycji produktu dodasz zdjęcia,
opis, warianty, wymiary itd.

**Istniejący produkt przenieść:** wejdź w produkt na liście i zmień pole
**Kategoria** → zapisz.

> ℹ️ Lista kategorii w formularzu produktu pokazuje **całe drzewo z wcięciami**,
> pogrupowane po zakładkach menu. Możesz wybrać dowolny poziom — także pozycję
> menu, jeśli produkt nie pasuje do żadnej z jej podkategorii.

---

## Wersja niemiecka

Jeśli wypełnisz **Nazwa po niemiecku (DE)**, kategoria od razu ma poprawną nazwę
na `/de`. Bez tego pola na `/de` pokaże się nazwa polska — nic się nie psuje,
ale wygląda niespójnie.

---

## Streszczenie

```
/admin/kategorie → „+ Nowa pozycja menu" (albo „+ Podkategoria" przy wierszu)
        ↓
Nazwa (+ DE) + Rodzic (gdzie ma wisieć, „+ Podkategoria" wypełnia to za Ciebie) → „Dodaj kategorię"
        ↓
Kolejność → przeciąganie (tylko wśród rodzeństwa)
Przeniesienie gdzie indziej → pole „Rodzic"
        ↓
/admin/produkty → „+ Nowy produkt" (albo edycja istniejącego)
   → pole Kategoria = dowolny poziom drzewa
        ↓
✅ Kategoria w menu, produkty w niej i we wszystkim pod nią widoczne od razu
```
