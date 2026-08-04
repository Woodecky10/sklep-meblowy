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

## Krok 2 — Dodaj kategorię

1. Kliknij **„+ Nowa kategoria"**
2. Wypełnij formularz:
   - **Nazwa wyświetlana** *(wymagane)* → tekst, który zobaczy klient, np. `Komody`
   - **Rodzic** → gdzie ta kategoria ma wisieć. Zostaw **„— najwyższy poziom —"**,
     jeśli ma być nową zakładką w menu; wybierz istniejącą kategorię, jeśli ma być
     jej podkategorią
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

> ⚠️ **Kolejność klikania NIE ma znaczenia.** Zaznaczone kategorie zapisują się
> w tej kolejności, w jakiej są wypisane w panelu, czyli **alfabetycznie** —
> niezależnie od tego, co kliknęłaś pierwsze. W takiej kolejności klient zobaczy
> propozycje.
>
> Ma to jeden praktyczny skutek, o którym trzeba wiedzieć: w bazie jest dziś
> ustawiona kolejność **kieszeniowe → piankowe → nawierzchniowe** (żeby
> pełnowartościowe materace szły przed cienkimi topperami), ale została wpisana
> ręcznie. **Przy pierwszym zapisie kategorii łóżka przestawi się na
> alfabetyczną** — czyli kieszeniowe, nawierzchniowe, piankowe — i toppery
> awansują na drugie miejsce. Jeśli to problem, powiedz, poprawimy panel tak,
> żeby respektował kolejność klikania.

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
/admin/kategorie → „+ Nowa kategoria"
        ↓
Nazwa (+ DE) + Rodzic (gdzie ma wisieć) → „Dodaj kategorię"
        ↓
Kolejność → przeciąganie (tylko wśród rodzeństwa)
Przeniesienie gdzie indziej → pole „Rodzic"
        ↓
/admin/produkty → „+ Nowy produkt" (albo edycja istniejącego)
   → pole Kategoria = dowolny poziom drzewa
        ↓
✅ Kategoria w menu, produkty w niej i we wszystkim pod nią widoczne od razu
```
