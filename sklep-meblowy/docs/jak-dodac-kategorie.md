# Jak dodać kategorię — instrukcja krok po kroku

Ta instrukcja pokazuje, jak dodać nową kategorię produktów (np. „Komoda", „Stół", „Półka") tak, żeby:

1. Pojawiła się w nawigacji **na stronie sklepu**
2. Produkty z **BaseLinkera** automatycznie się do niej zsynchronizowały

> **Najważniejsze:** kategoria musi istnieć **w dwóch miejscach**:
> - w panelu **BaseLinkera** (gdzie wgrywasz produkty)
> - w panelu **sklepu** (`/admin/kategorie` — ten ekran)
>
> Sklep i BaseLinker to **dwa osobne systemy**. Łączymy je przez liczbowe **ID kategorii BL**.

---

## Krok 1 — Dodaj kategorię w BaseLinkerze

1. Wejdź w **panel BaseLinker** → **Magazyn** → **Kategorie**
2. Kliknij **„Dodaj kategorię"** (przycisk + lub „Nowa kategoria" w prawym górnym rogu)
3. Wpisz nazwę (np. `Komody`)
4. Zapisz
5. **Zapisz sobie ID tej kategorii** — to liczba, np. `7489800`. Zobaczysz ją:
   - W URL przeglądarki po kliknięciu w kategorię (np. `…?category_id=7489800`)
   - Albo w liście kategorii — po prawej stronie nazwy

> 💡 **Tip:** możesz też pobrać listę wszystkich ID przez specjalny adres:
> `https://mollien.pl/api/baselinker/test`
> **Najpierw zaloguj się jako admin na mollien.pl** (adres działa tylko dla
> admina — bez zalogowania zobaczysz „Brak uprawnień").
> Otworzy się JSON — w sekcji `categories` zobaczysz wszystkie kategorie z BL razem z ich `category_id`.

---

## Krok 2 — Dodaj kategorię w panelu sklepu

1. Wejdź na **https://mollien.pl/admin/kategorie** (zaloguj się jako admin jeśli trzeba)
2. Znajdź odpowiednią **grupę** w której kategoria ma się znaleźć:
   - „Salon" — sofy, narożniki, fotele, pufy, zestawy, **meble pokojowe** (komody, stoły)
   - „Sypialnia" — łóżka, materace
   - Albo dodaj nową grupę przyciskiem **„+ Nowa grupa"** na górze (np. „Jadalnia")
3. W odpowiedniej grupie kliknij **„+ Dodaj kategorię do tej grupy"**
4. Wypełnij formularz:
   - **Nazwa wyświetlana** → tekst który zobaczy klient w nawigacji (np. `Komody`)
   - **Slug (link)** → zostaw puste, system wygeneruje sam (np. `komody`). Albo wpisz własny.
   - **Grupa** → już wybrana
   - **ID kategorii w BaseLinker** → liczba z **kroku 1** (np. `7489800`)
   - **Kolejność** → mniejsze pierwsze (np. `0`, `1`, `2`...). Możesz później zmienić.
5. Kliknij **„Dodaj kategorię"**

> ✅ Od tego momentu kategoria pojawia się w menu nawigacji sklepu (Salon → Komody / Sypialnia → ...) oraz na liście filtrów.

> 🇩🇪 **Wersja niemiecka:** nowa kategoria na `/de` pokaże się **po polsku**, dopóki deweloper nie doda jej tłumaczenia (mapa w kodzie — patrz `docs/i18n-tlumaczenia-de.md`). Daj znać deweloperowi nazwę + slug nowej kategorii.

---

## Krok 3 — Synchronizuj produkty z BaseLinkera

Produkty z BL **nie pojawiają się automatycznie** na stronie. Trzeba uruchomić synchronizację:

1. Wejdź na **https://mollien.pl/admin/baselinker**
2. Kliknij duży złoty przycisk **„Synchronizuj teraz"**
3. Poczekaj 5–30 sekund (zależy ile produktów masz w BL)
4. Zobaczysz wynik:
   - **Dodanych** — nowe produkty zaciągnięte z BL
   - **Zaktualizowanych** — istniejące produkty których dane zmieniłaś w BL
   - **Pominiętych** — produkty których z jakiegoś powodu nie udało się zaciągnąć (lista poniżej z powodami)

---

## Częste problemy

### ❌ „kategoria BL X nie zmapowana"
**Przyczyna:** Produkt w BL ma kategorię (ID `X`), której **nie ma jeszcze w panelu sklepu**.
**Rozwiązanie:** Wróć do **kroku 2**, dodaj kategorię w admin panelu z tym `X` jako BL ID. Potem znowu „Synchronizuj teraz".

### ❌ „brak ceny lub cena = 0"
**Przyczyna:** Produkt w BL nie ma ustawionej ceny.
**Rozwiązanie:** Wejdź w BL → Magazyn → produkt → Ceny → ustaw cenę → zapisz. Potem ponów synchronizację.

### ❌ „brak nazwy"
**Przyczyna:** Pole „nazwa" w BL jest puste.
**Rozwiązanie:** Wpisz nazwę w BL → zapisz → ponów synchronizację.

### ❌ „brak kategorii w BL"
**Przyczyna:** Produkt w BL nie jest przypisany do żadnej kategorii.
**Rozwiązanie:** W BL wejdź w produkt → Kategoria → wybierz odpowiednią → zapisz → ponów synchronizację.

---

## Zmiana lub usunięcie kategorii

### Edycja kategorii

`/admin/kategorie` → znajdź kategorię → kliknij **„Edytuj"** → zmień co potrzeba → **„Zapisz"**.

Zmiany widać na stronie **natychmiast**.

> ⚠️ Jeśli zmienisz **slug**, to wszystkie linki do tej kategorii automatycznie się zaktualizują (FK z `ON UPDATE CASCADE` w bazie). Klient który ma starą zakładkę otwartą zobaczy 404 — ale to rzadki przypadek.

### Ukrycie kategorii (np. czasowo)

Lepsze niż usuwanie. Edytuj kategorię → odznacz **„Pokazuj w sklepie"** → Zapisz.

Kategoria znika z nawigacji ale produkty w niej zostają. Możesz ją włączyć z powrotem później.

### Trwałe usunięcie

`/admin/kategorie` → kategoria → przycisk **„Usuń"**.

> ⚠️ **Nie da się usunąć kategorii która ma produkty.** System pokaże komunikat ile produktów trzeba najpierw przenieść.
> Co zrobić: w admin panelu zmienić tym produktom kategorię, ALBO w BL zmienić im przypisanie do innej kategorii i ponownie zsynchronizować.

---

## Streszczenie — flow przy dodaniu nowej kategorii

```
1. BL → Magazyn → Kategorie → Dodaj „Komody" → zapisz ID (np. 7489800)
       ↓
2. Sklep → /admin/kategorie → wybierz grupę → Dodaj kategorię
   - Nazwa: Komody
   - BL ID: 7489800
   - Zapisz
       ↓
3. (Opcjonalnie) Dodaj w BL produkty w kategorii „Komody"
       ↓
4. Sklep → /admin/baselinker → „Synchronizuj teraz"
       ↓
5. ✅ Produkty pojawiają się w nawigacji Salon → Komody na stronie
```

To wszystko. Cały proces zajmuje 2-3 minuty po pierwszym razie.
