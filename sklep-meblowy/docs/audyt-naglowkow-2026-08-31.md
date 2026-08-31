# Audyt nagłówków H1/H2 — 2026-08-31

Powód: właściciel chciał „żeby ze względu na SEO były H1 zamiast H2, wszędzie
gdzie się da". Audyt pokazał, że zamiana jest niepotrzebna prawie wszędzie —
i szkodliwa. **Praca wstrzymana do czasu dostarczenia danych z Search Console.**

## Co zmierzono

Pobrany wyrenderowany HTML z produkcji (`https://www.mollien.pl`), policzone
`<h1>` i `<h2>` na każdej publicznej stronie.

| strona | H1 | H2 | pierwszy H1 |
|---|---|---|---|
| **strona główna** | **0** | **11** | **BRAK — jedyna taka strona** |
| /sklep | 1 | 0 | „Wszystkie produkty" |
| /sklep?kategoria=sofy | 1 | 0 | „Sofy" |
| karta produktu | 1 | 4 | nazwa produktu |
| /opinie | 1 | 0 | „Co mówią o naszych meblach" |
| /tkaniny | 1 | 3 | „Tkaniny" |
| /tkaniny/[slug] | 1 | 6 | nazwa tkaniny |
| /probki, /ulubione | 1 | 0 | „Zaloguj się" (strony za logowaniem) |
| /koszyk | 1 | 0 | „Koszyk jest pusty" |
| /o-nas, /kontakt | 1 | 5 / 2 | „O nas", „Kontakt" |
| /dostawa, /zwroty | 1 | 7 / 4 | „Dostawa i płatności", „Zwroty i reklamacje" |
| /regulamin, /prywatnosc | 1 | 10 / 9 | „Regulamin sklepu…", „Polityka prywatności" |
| /logowanie, /rejestracja | 1 | 0 | „Zaloguj się", „Zarejestruj się" |

**17 z 18 stron ma już dokładnie jeden H1. Żadna nie ma dwóch.**

## Wniosek

Masowa zamiana H2 → H1 **pogorszyłaby** pozycjonowanie: regulamin dostałby
11 nagłówków H1, polityka prywatności 10, a wyszukiwarka straciłaby informację,
który nagłówek jest tytułem strony. H1 działa zasadą „jeden na stronę, mówiący
czym ta strona jest" — więcej nie wzmacnia sygnału, tylko go rozmywa.

Jedyna realna luka to **strona główna**, i akurat najważniejsza.

## Czego NIE robić na stronie głównej

1. **Nie zamieniać haseł ze slidera na H1.** Slider trzyma wszystkie slajdy
   w DOM naraz, więc zamiast jednego H1 powstałyby cztery. Ostrzeżenie stoi
   w `app/_components/layout/HomeHeroSlider.tsx` i w `app/page.tsx`.
2. **Nie ukrywać H1 (`sr-only`) bez świadomej decyzji.** Poprzednio świadomie
   tego uniknięto — komentarz w kodzie ostrzegał, że ukrywanie tekstu Google
   traktuje jak cloaking. Przy treści zgodnej ze stroną ryzyko jest małe,
   ale to decyzja właściciela, nie domyślna.

## Historia, o której trzeba pamiętać

- **2026-08-10, commit `7feeb7f`** — dodano H1 „Sklep internetowy z meblami
  tapicerowanymi" plus zdanie wyjaśniające, po **TRZECIM odrzuceniu weryfikacji
  marki Google** z powodem „strona główna nie wyjaśnia celu aplikacji".
- **2026-08-17** — H1 usunięty **na wyraźne polecenie właściciela**, świadomie
  i wbrew rekomendacji. Ze słowników zniknęły też klucze `home.h1` i `home.h1Lead`.

Przywrócenie go jest więc cofnięciem decyzji właściciela — musi ją podjąć sam.

## Co jest już dobre (nie ruszać)

Tytuł i opis strony głównej przetrwały tamto usunięcie i są poprawne:

- tytuł: `Mollien.pl — sklep internetowy z meblami tapicerowanymi`
- opis: wymienia łóżka, materace, narożniki, sofy, fotele i pufy, produkcję
  w Polsce, darmowe próbki i dostawę

Brakuje wyłącznie tego, żeby **treść strony powtarzała obietnicę z tytułu**.
Dziś najwyższy nagłówek to hasło „Meble, które opowiadają historię" — nie zawiera
żadnej frazy, którą ktoś wpisuje w wyszukiwarkę.

## STAN WYKONANIA — co dalej

**Kodu nie tknięto ani w jednym pliku.** Właściciel wybrał: najpierw dane,
potem treść.

Potrzebne od właściciela (Search Console → właściwość mollien.pl →
**Skuteczność → Wyniki wyszukiwania**, zakres 3 miesiące, tabela **Zapytania**):

1. górne 20–30 zapytań posortowanych po **kliknięciach**,
2. ta sama tabela posortowana po **wyświetleniach** — frazy, na które Google
   już wyświetla sklep, ale nikt nie klika (najtańsza dźwignia).

Sklep NIE loguje własnych wyszukiwań (sprawdzono: brak tabel `search_queries`,
`search_log`, `searches`, `analytics_events`), więc Search Console jest jedynym
źródłem prawdziwych fraz. Nie zgadywać treści H1 bez tych danych.

Po otrzymaniu listy: dobrać treść H1 pod realne frazy, pokazać właścicielowi
do zatwierdzenia, dopiero potem kod (sekcja pod hero + klucze `home.h1`
i `home.h1Lead` w słownikach PL i DE). Przy okazji sprawdzić, czy nazwy
kategorii i tytuły stron nie rozmijają się z tym, czego ludzie szukają — to
bywa większa dźwignia niż sam nagłówek.

## Aktualizacja 2026-08-31 — wykonane

Dane z Search Console dostarczone tego samego dnia (zakres 3 miesiące):
**109 kliknięć / 954 wyświetlenia**. Dwa klastry fraz z wyświetleniami
i **zerem kliknięć**: PL „polski producent" (~20 wyświetleń), DE
„möbel aus polen online" (~41 wyświetleń).

Decyzją właściciela H1 na stronie głównej został **przywrócony**, z treścią
dobraną pod te frazy:

- PL: „Sklep internetowy z meblami tapicerowanymi od polskiego producenta"
- DE: „Polstermöbel aus Polen — Online-Shop"

DE jest **zamrożone**: front niemiecki odpuszczony decyzją właściciela, `/de`
stoi za flagą `DE_ENABLED`, więc niemiecki H1 czeka uśpiony w słowniku.

Zabezpieczenie przed powtórką z 2026-08-17 (nagłówek zniknął przez zmianę
w jednym pliku i nic tego nie wyłapało): test jednostkowy
`app/_lib/__tests__/home-h1.test.ts` (treść w słownikach + podpięcie w kodzie,
zero H1 w sliderze) oraz spec e2e `e2e/home-h1.spec.ts` (dokładnie jeden
widoczny H1 w wyrenderowanym DOM). H1 renderuje się pod hero, a gdy hero nie
otwiera strony — na jej górze; niezależnie od kolejności i duplikatów bloków
w `page_blocks`.
