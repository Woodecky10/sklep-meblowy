# Podkategorie — drzewo kategorii bez limitu głębokości — plan wdrożenia

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Kategorie stają się jednym drzewem bez limitu głębokości, którym Ola zarządza w panelu — układ, kolejność i przenoszenie gałęzi — a sklep pokazuje je jako megamenu do trzech poziomów, gdzie listing każdego węzła zbiera produkty z całego poddrzewa.

**Architecture:** Dwie tabele (`category_groups` + `categories`) zastępuje jedno drzewo w `categories` z kolumną `parent_id` (migracja 68, model expand-first — stara tabela zostaje jako martwy balast). Cała logika drzewa idzie do czystego modułu `app/_lib/category-tree.ts` bez importów serwerowych, testowanego bez bazy; `categories.ts` zostaje warstwą fetch + cache. Konsumenci (pasek, mobile, stopka, listing, filtry, panel, selecty produktu) dostają gotowe projekcje z tego modułu.

**Tech Stack:** Next.js 16 (App Router, Server Components, Server Actions), Supabase (Postgres + RLS + RPC), dnd-kit, Tailwind, vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-04-podkategorie-drzewo-design.md`

---

## ✅ STAN WYKONANIA (2026-08-04)

Wszystkie 9 tasków zaimplementowane, każdy z recenzją (spec + jakość) i rundami
naprawczymi tam, gdzie recenzja coś znalazła. Gałąź: `feat/kategorie-drzewo`,
start `84f7a72` (= `main`).

### Bramki końcowe

| Bramka | Wynik |
|---|---|
| `npx tsc --noEmit` | **0 błędów** w całym projekcie |
| `npm test` | **1100 testów w 86 plikach**, 0 failed (start: 1060) |
| `npm run lint` | **0 błędów**, 4 warningi — wszystkie pre-existing (`fabrics.test.ts`, `bundles-server.ts`, `variants.ts`) |
| `npm run build` | **przechodzi**, 59/59 stron |
| e2e publiczne | `category-menu` 2/2 (na buildzie produkcyjnym), regresyjnie `corner-side`/`filter-pending`/`home-collections` 6/6 |

### Recenzja całej gałęzi: Approved with conditions → wszystkie 4 warunki SPEŁNIONE (`871e75c`)

1. **Migracja 68 nie była idempotentna.** Przemianowania slugów stały PRZED
   guardem, a backfill w tym samym przebiegu tworzy korzeń o slugu `materace` —
   więc drugie odpalenie albo wywalało się na unikalnym slugu, albo (gdyby liść
   `materace-kieszeniowe` kiedyś zniknął) **po cichu przemianowywało żywy
   korzeń** i gasiło zaindeksowany adres. Cały backfill (slugi + cross-sell +
   insert grup) stoi teraz pod jednym guardem „drzewo już zbudowane".
   Zmiana pliku NIE rusza produkcji — migracja jest tam już zaaplikowana.
2. **`/sklep?kategoria=a&kategoria=b` dawało 500.** Next oddaje wtedy `string[]`,
   a `SearchParams` obiecuje `string`, więc `.trim()` rzucał `TypeError` na
   publicznej stronie (stary kod pokazywał pustą listę). Helper `first()`
   zastosowany do `kategoria`, `sekcja`, `q` i `kolekcja`. Zweryfikowane
   curl-em na buildzie produkcyjnym: wszystkie cztery warianty **HTTP 200**.
3. **Surowy błąd Postgresa przy rodzicu-widmie.** FK `23503` obsłużony w
   `createCategory` i `updateCategory`; `validateParent` rozdziela „rodzic nie
   istnieje" od „rodzic jest twoim potomkiem" — wcześniej oba dawały komunikat
   o cyklu i wysyłały administratorkę szukać problemu, którego nie ma.
   **+6 testów** (`app/admin/kategorie/__tests__/actions.test.ts`) na fake
   kliencie Supabase, w tym asercja, że kod `23505` został nietknięty.
4. **Instrukcja podawała nazwę przycisku, którego nie ma** — panel ma
   „+ Nowa pozycja menu" i skrót „+ Podkategoria" przy wierszu.

### Stan produkcji PRZED wdrożeniem kodu (zmierzony, nie wywnioskowany)

Migracja poszła przed kodem, więc produkcja stoi na starym kodzie z nowym
schematem. Sprawdzone `curl`em na mollien.pl 2026-08-04:

```
?kategoria=materace              → HTTP 200, 0 produktów
?kategoria=pufy                  → HTTP 200, 0 produktów
?kategoria=materace-kieszeniowe  → HTTP 200, 24 linki (12 produktów)
```

Stary kod dopasowuje kategorię dokładnie (`eq("category", slug)`), a produkty
pojechały kaskadą FK na nowe slugi — więc **dwa zaindeksowane adresy oddają dziś
puste strony**. Nowy kod rozwiązuje je jako korzenie (83 i 6 produktów).
**Deploy to naprawia, nie psuje** — to argument za wdrożeniem szybciej, nie
później. W menu tych pozycji nie ma (stary kod czyta `group_id`, nowe korzenie
mają je puste), więc dotyczy tylko wejść z linków i wyszukiwarki.

### Migracja 68 — ZAAPLIKOWANA na produkcji

Projekt `tlvgsddpiikolgdwuwmc`. Sześć zapytań kontrolnych po aplikacji:
`parent_id` + indeks istnieją, `group_id` jest nullable, drzewo to **8 korzeni /
15 dzieci / 23 węzły**, produktów bez istniejącej kategorii **0**, starych
slugów w `cross_sell_categories` **0**, `reorder_categories` +
`categories_no_cycle` + trigger na miejscu.

Grupy przejęły zwolnione slugi: korzeń `materace` = „MATERACE", korzeń `pufy` =
„PUFY", a dawne kategorie dostały `materace-kieszeniowe` i `naroznik-u`. Ósmy
korzeń to „Schodki dla pupila" — grupa o identycznym slugu celowo nie utworzyła
węzła.

### Co ZWERYFIKOWANO na żywo (localhost, produkcyjna baza, Playwright)

- **Poddrzewo naprawdę się zbiera:** `?kategoria=materace` → **83 produkty**,
  `?kategoria=materace-kieszeniowe` → **40**. (Uwaga na pułapkę: listing ma
  paginację, więc liczba kart na stronie to zawsze 12 — dowodem są liczniki, nie
  karty.) Drugi dowód pod limitem strony: `pufy` 6 vs `naroznik-u` 4.
- **Pasek nawigacji:** 8 korzeni, każdy z panelem zawierającym skrót
  „Wszystkie …" + dzieci, wszystkie linki przez `?kategoria=`.
- **Okruszki:** `materace-kieszeniowe` → „MATERACE / Materace kieszeniowe",
  `naroznik-u` → „Narożniki / Narożnik w kształcie U". Dla korzenia okruszków
  nie ma i **tak ma być** (`trail.length > 1`).
- **Pasek dzieci na korzeniu:** `materace` → piankowe / nawierzchniowe /
  kieszeniowe; `pufy` → Pufy tapicerowane.
- **Legacy alias:** `?sekcja=salon` daje identyczną stronę co
  `?kategoria=salon` (oba „Narożniki", te same liczniki); to samo dla
  `sypialnia` → „ŁÓŻKA". Historyczne slugi grup (`salon`, `sypialnia`,
  `z-produkcji`) nadal działają jako slugi korzeni.
- **Stopka:** kolumny = korzenie, pozycje = ich dzieci.
- **Mobile 390 px:** hamburger (`aria-label="Menu"`) otwiera akordeon, pierwszy
  poziom to dokładnie te 8 korzeni, rozwinięcie „Fotele" pokazuje
  „Wszystkie fotele" + „Fotele tapicerowane".
- **Cross-sell przeżył przemianowanie slugu:** strona łóżka tapicerowanego
  pokazuje sekcję „Materace w rozmiarze 140×200 cm" z **14 materacami**.

### Czego NIE sprawdzono na żywo (ważne — nie zakładać, że działa)

1. ~~CAŁY panel `/admin/kategorie`~~ → **ZWERYFIKOWANY NA ŻYWO 2026-08-04**,
   po tym jak właściciel podał dane logowania. Sesja odnowiona przez
   `auth.setup`, testy przez Playwrighta na buildzie produkcyjnym
   (`localhost:3100`, produkcyjna baza). Wyniki:
   - **drzewo i liczniki** — 23 wiersze, 8 korzeni / 15 dzieci, liczniki
     „własne · w poddrzewie" zgadzają się arytmetycznie (ŁÓŻKA 98+35+41 = 174),
     odmiana liczebnika poprawna („1 własny produkt");
   - **przeciąganie myszą wśród rodzeństwa** — „Materace kieszeniowe"
     przesunięte na koniec, **zmiana przetrwała odświeżenie** (czyli zapis do
     bazy działa), potem **przywrócone klawiaturą** i po odświeżeniu stan
     identyczny z wyjściowym;
   - **przeciąganie klawiaturą** działa (Space / strzałki / Space) —
     `KeyboardSensor` z `sortableKeyboardCoordinates` jest zarejestrowany;
   - **utworzenie pozycji menu i podkategorii** — „+ Podkategoria" ustawia pole
     „Rodzic" z góry, dziecko ląduje na poziomie 1;
   - **ukrycie** — wiersz dostaje oznaczenie `(ukryta)` i pozostaje edytowalny;
   - **guard usuwania z dzieckiem** — „ma 1 podkategorię. Najpierw przenieś je
     pod inną kategorię (pole „Rodzic") albo usuń.";
   - **ochrona przed pętlą** — pole „Rodzic" nie zawiera ani samej kategorii,
     ani jej potomków (25 opcji, `allowedParents` wycina poddrzewo); po
     **wstrzyknięciu własnego id przez DOM** i zapisie wychodzi polski
     komunikat „Kategoria nie może być swoim własnym rodzicem", nie surowy błąd
     Postgresa;
   - **sprzątanie** — obie kategorie testowe usunięte, stan końcowy identyczny
     z wyjściowym (23 wiersze), zero śladów w produkcyjnej bazie.

   **ZNALEZIONY PRZY TYM DEFEKT (naprawiany osobno, gałąź
   `fix/kategorie-podglad-przeciagania`):** podgląd przeciągania na najwyższym
   poziomie pokazuje **nieprawdziwe drzewo**. `verticalListSortingStrategy`
   przesuwa transformami tylko karty, a poddrzewa zostają na miejscu. Zmierzone
   przy ciągnięciu „Fotele" nad „Narożniki" (karty 66 px):
   `Fotele +482px`, `MATERACE −156px`, `Narożniki −320px` — nierówne i
   wielokrotnie większe od karty. Na ekranie „Fotele tapicerowane" wygląda wtedy
   jak dziecko MATERACE, a materace jak dzieci Narożników. **Zapis wychodzi
   poprawny — kłamie wyłącznie animacja.** Decyzja właściciela: zwijać
   podkategorie na czas przeciągania, żeby karty były ciągłą kolumną i podgląd
   pokazywał to, co zostanie zapisane.

   Weryfikację geometrii da się robić **bez mutacji bazy**: przeciągnięcie
   anulowane `Escape` nie woła `reorderCategories`, a dnd-kit wystawia w
   `aria-live` wynik detekcji kolizji. Skrypt tej metody jest w scratchpadzie
   sesji (`panel-04-geometria-bez-zapisu.mjs`) — warto go odtworzyć, jeśli
   ktoś będzie ruszał dnd w tym panelu.
2. **Trzeci poziom megamenu.** W produkcyjnym drzewie są dziś tylko dwa poziomy
   (korzenie = dawne grupy, dzieci = dawne kategorie), więc trzeci poziom
   **nie miał na czym się pokazać**. Zacznie działać dokładnie wtedy, gdy Ola
   zbuduje „MEBLE" (MEBLE → Sofy → Sofa 3-osobowa). Logika jest pokryta testami
   `menuProjection`, ale nie widziałem jej na ekranie.
3. **Zachowanie przeciągania po refaktorze `ref`** (patrz rozstrzygnięcie 4
   poniżej) — zmiana była oceniona wyłącznie po kodzie, w dwóch niezależnych
   recenzjach, bez kliknięcia w przeglądarce.
4. **Strony `/de`** — locale zamrożone flagą `DE_ENABLED`, nie ruszane.

### Rozstrzygnięcia PONAD planem (nie „naprawiać" ich z powrotem)

1. **`buildTree` w planie zwracał strukturę cykliczną** — snippet z Taska 2
   Step 3 tworzył cykl, na którym każde przejście drzewa bez zbioru odwiedzonych
   zapętlało się (menu, filtry, panel, selekty). Implementer dodał filtr
   krawędzi wstecznych w `walk`; recenzja potwierdziła trzema reprodukcjami.
   Snippet w planie poprawiony commitem `11f6f04`.
2. **`app/not-found.tsx`** nie był na liście wyjątku bramki, a używał usuniętego
   `getSections` — przepisany w Tasku 3 na `buildTree(getCategories())`.
3. **Odmiana liczebnika:** brief podawał `childCount === 1 ? "podkategorię" :
   "podkategorii"`, co dla 2–4 dawało „ma 3 podkategorii". Wiąże Global
   Constraint „PL-only, pełnymi zdaniami", nie snippet → użyta istniejąca
   `pluralForm` z `app/_lib/plural.ts`. **Wyjątek 12–14 świadomie nieobsłużony**
   — tak działa cała aplikacja (komentarz w `plural.ts`), zmiana ruszyłaby
   widoczne etykiety sklepu.
4. **`useSortable` mierzył całe poddrzewo.** Struktura z briefu trzymała
   `ref={setNodeRef}` na kontenerze obejmującym kartę wiersza **i** jej
   potomków, więc `closestCenter` liczył środek pełnej wysokości poddrzewa —
   przy korzeniu z kilkunastoma dziećmi upuszczenie obok nagłówka nie trafiało
   tam, gdzie widać. Wiąże wymaganie właściciela („kolejność ustawialna w
   jakikolwiek sposób") → `ref` przeniesiony na sam wiersz, `{children}` jako
   rodzeństwo poza refem. Przy okazji wydzielona czysta
   `reorderSiblings(items, parentId, activeId, overId)` do `category-tree.ts`
   (bez importu `@dnd-kit` — moduł jest celowo bez zależności).
5. **`corner-side.ts` — luka SPECYFIKACJI, nie implementacji.** Spec przewidział
   dwie konsekwencje przemianowania slugów (kaskada FK na `products`, przepisanie
   `cross_sell_categories`) i przeoczył trzecią: `EXTRA_CORNER_CATEGORY_SLUGS =
   new Set(["pufy"])` istniało tylko dlatego, że kategoria „Narożnik w kształcie
   U" miała rozjechany slug `pufy`. Po migracji `pufy` to nowy węzeł „PUFY", więc
   produkt w tej grupie dostawałby wybór strony narożnika. Lista wyjątków
   usunięta (commit `6935dce`). **Klasa błędu do zapamiętania:** przemianowanie
   slugu w bazie dotyka też miejsc, gdzie slug jest zaszyty w kodzie jako
   *znaczenie*, nie jako klucz.
6. **`check (category in (...))` z `schema.sql:48-52` jest MARTWY** —
   sprawdzone, nie założone: migracja 09 zdejmuje wszystkie ograniczenia check
   pętlą `execute format('alter table public.products drop constraint %I', cname)`
   i wstawia FK `products_category_fk`. `schema.sql` to nieaktualny zrzut bazowy.
   Żadnej listy dozwolonych slugów na produkcji nie ma.
7. **Test e2e nie zakłada, KTÓRY korzeń ma dzieci** — pierwsza wersja
   (z briefu) brała `categoryLinks.first()` i padłaby, gdyby najniższy
   `sort_order` trafił na płaską kategorię. Teraz szuka dowolnego korzenia
   z duplikatem `href`. Jedyne pozostałe założenie — „istnieje przynajmniej
   jeden korzeń z dziećmi" — jest nazwane w komentarzu w teście.
8. **Martwy prop `categories` w `ProductEditor`** usunięty; uzasadnienie briefu
   („karmi komunikat o dobieraniu rozmiaru") odnosiło się do lokalnej zmiennej
   w `[id]/page.tsx`, nie do propa komponentu.

### Follow-upy DOPISANE przez recenzję gałęzi (ważniejsze od listy poniżej)

**A. ZROBIONE** (gałąź `fix/cross-sell-poddrzewo`, commit `3bc7b7f`): wydzielona
czysta `expandCrossSellTargets(nodes, rawTargets, sourceSlugs)` w
`category-tree.ts` (+6 testów), `resolveCrossSellTargets` przepuszcza przez nią
surowe wpisy. Filtr same-sell działa **po** rozwinięciu, nieznany slug zostaje
zachowany, kolejność = kolejność pierwszego wystąpienia (czyli kolejność drzewa).
Zweryfikowane na żywo z przywróceniem stanu: „Łóżka tapicerowane" z
`["materace-kieszeniowe","materace-piankowe"]` → 14 materacy na stronie łóżka;
przestawione na sam korzeń `["materace"]` → **20** (przed poprawką byłoby 0 i
sekcja by zgasła); po przywróceniu znów 14 i konfiguracja identyczna.

SPROSTOWANIE do follow-upu 3 poniżej (kolejność alfabetyczna): stan bazy jest
inny, niż zapisałem. Dla „Łóżek tapicerowanych" zaznaczone są **tylko dwie**
kategorie — `materace-kieszeniowe` i `materace-piankowe`. **Toppery
(`materace-nawierzchniowe`) są świadomie pominięte**, nie „trzecie w kolejności".
Alfabetycznie te dwie wypadają w tej samej kolejności co teraz, więc pierwszy
zapis kategorii łóżka **niczego dziś nie przestawi** — ryzyko jest generyczne, na
przyszłe zestawy, nie aktualne. Instrukcja dla właścicielki poprawiona.

Konsekwencja tej poprawki, o której trzeba wiedzieć: zaznaczenie korzenia
„MATERACE" DZIAŁA, ale **wciąga też toppery** (28 produktów), czyli zmienia
asortyment propozycji. Dlatego NIE zalecam tego jako domyślnej drogi — zapisane
w instrukcji jako świadomy wybór z ostrzeżeniem.

**A-stare. Cross-sell nie rozwija poddrzewa — zrobić PRZED pierwszą samodzielną sesją
Oli w panelu.** `resolveCrossSellTargets` (`app/_lib/products.ts:292-312`)
dopasowuje kategorie dokładnie (`.in("category", targetSlugs)`), a panel
pokazuje jako kandydatów **wszystkie 23 węzły**, w tym korzenie. Ola zaznaczy
naturalnie brzmiące „MATERACE" zamiast trzech liści → `targetSlugs = ['materace']`
→ żaden produkt nie ma tej kategorii bezpośrednio → **sekcja polecanych materacy
gaśnie na stronie każdego łóżka, bez żadnego komunikatu**. Fix trzyliniowy i w
duchu tej gałęzi: przepuścić wynik przez `descendantSlugs`, dokładnie jak
listing. Waży więcej niż follow-up 3 poniżej: tamten przestawia kolejność, ten
gasi sekcję całkowicie.

**B. Geometria przeciągania — pierwsza rzecz do odklikania.** `renderLevel`
tworzy osobny, zagnieżdżony `DndContext` na każdy poziom, a `{children}` leży
między kartami rodzeństwa. Przeniesienie `ref` (rozstrzygnięcie 4) było
konieczne, ale `verticalListSortingStrategy` zakłada, że elementy jednego
`SortableContext` tworzą **ciągłą kolumnę** — tu między kartą korzenia A i B leży
całe poddrzewo A. Wyliczona kolejność będzie poprawna (`reorderSiblings` ma 9
testów), ale **animacja podglądu w trakcie ciągnięcia** może skakać. Statycznie
nierozstrzygalne — patrzeć nie na wynik po odświeżeniu, a na to, jak się to
rusza.

**C. Kolejność odklikania panelu** (wg recenzji): (1) przeciągnięcie w
zagnieżdżonym poziomie w gałęzi z kilkoma dziećmi, (2) przeciągnięcie zakładki
na najwyższym poziomie — tam między kartami leżą całe poddrzewa, (3)
przeniesienie gałęzi z dziećmi polem „Rodzic" i sprawdzenie, czy wnuki nie
wyparowały z megamenu, (4) oba guardy usuwania z odmianą liczebnika przy 2, 3 i
5, (5) utworzenie kategorii o zajętym slugu → polski komunikat, nie surowy błąd.

**D. Ze SPECU USUNĄĆ wiersz o sierocie** (`...design.md`, okolice linii 341):
wymaga, żeby węzeł z nieistniejącym rodzicem „nie renderował się w menu". FK
`parent_id → categories(id) on delete restrict` czyni ten stan **niedosiężnym**,
a kod świadomie robi coś innego (traktuje sierotę jak korzeń) i ma na to
komentarz plus testy. Naprawianie kodu pod ten wiersz byłoby cofaniem się.

**E. Spec kłamie o kanonikalach** (linia 248: „kanonikale są rozłączne per
węzeł"). `app/sklep/page.tsx:35` ustawia `canonical: /sklep` dla KAŻDEGO
wariantu z filtrem, a `app/sitemap.ts:61-65` wypisuje 23 adresy `?kategoria=`,
z których każdy kanonikalizuje się do `/sklep`. Pre-existing, praktycznie
nieszkodliwe (Google i tak nie indeksuje tych filtrów), ale spec do poprawienia.

**F. Luki testowe wskazane imiennie:** migracja nie ma żadnego testu, choć spec
go wymagał (i to dokładnie tam wyszedł warunek 1); warstwa danych też była w
specu i ma pokrytą tylko czystą `resolveCategoryFilter` — sklejenie z
`.in("category", ...)`, gałąź „nieznany slug → sentinel UUID" i `effectiveActive`
w `getCategories` są bez testu; przypadek `parent_id === id` nie ma testu w
żadnej funkcji, mimo że `buildTree:67` ma na to jawny warunek.

**G. Drobiazgi z recenzji gałęzi:** pasek dzieci (`sklep/page.tsx:150-156`) nie
sortuje `byTreeOrder`, więc przy remisie `sort_order` może pokazać inną
kolejność niż megamenu (jedno `.sort()`); `admin/kategorie/page.tsx:26-33`
czyta `select("category")` bez paginacji, więc po przekroczeniu domyślnego
limitu PostgREST (1000 wierszy) liczniki poddrzewa zaniżą się i będzie to
wyglądać na błąd drzewa; usunięcie kategorii nie sprząta jej sluga z
`cross_sell_categories` innych węzłów (tablica bez FK); `FilterBar.tsx:268`
dla węzła z poziomu 4+ pokazuje „1 filtr aktywny" bez zdejmowalnego chipa;
`home-tiles.ts:110` linkuje `?kategoria=lozko-tapicerowane`, a żywy slug to
`lozka-tapicerowane` (pre-existing, martwe dopóki `home_tiles` niepuste).

**H. Stopka zwinie się do jednej kolumny po zbudowaniu „MEBLI"** —
`Footer.tsx:26` woła `menuProjection(categories, 2)`, czyli kolumna = korzeń,
pozycje = poziom 2. To wymusza spec i nie jest defektem, ale jest **widoczną
zmianą wyglądu, która nastąpi dokładnie w momencie, gdy Ola wykona instrukcję
z dokumentacji**. Warto ją o tym uprzedzić albo zmienić projekcję stopki.

**I. Komunikaty dnd-kit dla czytników ekranu są PO ANGIELSKU i wypisują UUID-y.**
Zmierzone w trakcie przeciągania: `"Draggable item c0fba5ff-88ba-47ec-bc60-…
was moved over droppable area 6e4fcb18-…"`, a po Escape `"Dragging was
cancelled. Draggable item … was dropped."`. To domyślne `announcements` dnd-kit,
których nikt nie nadpisał. Panel jest **PL-only** (Global Constraint), więc to
realna, choć drobna, luka — dnd-kit przyjmuje własne `announcements` i
`screenReaderInstructions`, a etykiety samych uchwytów są już poprawnie polskie
(„Przeciągnij żeby zmienić kolejność: Fotele"). Dotyczy też
`CollectionsEditor`/`SliderEditor`/`FeaturedEditor`/`TilesEditor` — ten sam
wzorzec, jedno miejsce do naprawienia raz dla wszystkich.

**J. Panel liczy produkty UKRYTE, sklep nie — i nikt o tym nie wie.**
Panel pokazuje dla MATERACE „84 w poddrzewie", a `/sklep?kategoria=materace`
liczy 83. Różnica jest poprawna: `admin/kategorie/page.tsx` czyta
`select("category")` klientem admina bez filtra, a sklep widzi tylko aktywne
produkty (RLS). Czyli jeden materac jest ukryty. Nie błąd, ale liczby się
rozjeżdżają i przy pierwszym zauważeniu wygląda to na usterkę drzewa —
warto albo dopisać to do instrukcji, albo rozbić licznik na „aktywne / wszystkie".

### Follow-upy w kolejności wagi

1. ~~Odkliknąć panel na żywo~~ **ZROBIONE 2026-08-04** — właściciel podał dane
   logowania, sesja odnowiona, wszystkie punkty Step 3 przeszły. Szczegóły w
   sekcji „Czego NIE sprawdzono", punkt 1. Zostaje z tego jeden defekt
   (podgląd przeciągania) naprawiany na gałęzi
   `fix/kategorie-podglad-przeciagania` i jedna obserwacja (follow-up I:
   angielskie komunikaty dnd-kit dla czytników ekranu).
2. **Migracja 69 — sprzątanie po modelu expand-first:** usunąć
   `categories.group_id` i tabelę `category_groups`. Dopiero **gdy nowa wersja
   posiedzi na produkcji** i będzie jasne, że nie wracamy.
3. **Cross-sell zapisuje kolejność alfabetyczną, nie kolejność klikania.**
   Rozjazd istniał przed tą gałęzią: `candidates` w `KategorieEditor` są
   sortowane alfabetycznie, a `formData.getAll` oddaje kolejność DOM.
   Konsekwencja: ustawiona dziś ręcznie kolejność (kieszeniowe → piankowe →
   nawierzchniowe) **przestawi się na alfabetyczną przy pierwszym zapisie
   kategorii łóżka**, czyli toppery awansują na drugie miejsce.
   `docs/jak-dodac-kategorie.md` mówi teraz prawdę o tym zachowaniu; jeśli ma
   działać kolejność klikania, trzeba poprawić panel.
4. **`.env.e2e` to niewypełniony szablon** — 174 bajty samych komentarzy, zero
   zmiennych. Dlatego `grep` nie znajduje w nim żadnego `NAZWA=`. (W trakcie tej
   gałęzi postawiłem tu fałszywą hipotezę o zapisie w UTF-16 — nie jest to
   problem kodowania, plik po prostu nigdy nie został wypełniony.) Odblokowanie
   follow-upów 1 i 5: właściciel wpisuje `E2E_ADMIN_EMAIL` i
   `E2E_ADMIN_PASSWORD`, potem `npx playwright test auth.setup` odnawia sesję
   w `e2e/.auth/admin.json`.
5. **Brak testu e2e przeciągania w panelu** — czeka na odnowioną sesję admina.
   Wzorzec: `e2e/samples.spec.ts`, kilkanaście linijek.
6. **Okruszki `<nav>` bez `aria-label`** (`app/sklep/page.tsx:246`) — na stronie
   jest kilka elementów `<nav>` i czytnik ekranu ich nie rozróżni. Drobiazg
   dostępnościowy, jedna linijka.
7. **Drobiazgi zaparkowane w recenzjach:** dwie funkcje odmiany w repo
   (`pluralForm` bez wyjątku 12–14 i prywatna `pluralPl` z wyjątkiem — duplikat
   sprzed tej gałęzi); `flattenMenuNodes` mieszka w `FilterBar.tsx`, a pasowałby
   do `category-tree.ts`, gdzie dostałby test za darmo; `parseParentId` bez
   testu jednostkowego; niekonsekwentne cudzysłowy w `KategorieEditor.tsx`
   (typograficzny + prosty w tym samym stringu); etykiety opcji w edytorze
   produktu doklejają `(slug)`, a w formularzu nowego produktu nie.

### Czego ta gałąź świadomie NIE robi

Nie tworzy „MEBLI" (buduje je Ola w panelu — instrukcja w
`docs/jak-dodac-kategorie.md`), nie zmienia adresów na `/kategoria/<slug>`,
nie przegląda wartości tłumaczeń DE, nie dodaje obrazków w megamenu ani
przenoszenia produktów hurtem.

---

## Global Constraints

- **To NIE jest Next.js z treningu** — wersja 16 ma breaking changes. Przed kodem Server Component/Action sprawdź `node_modules/next/dist/docs/`. `params`/`searchParams` to Promise. (`sklep-meblowy/AGENTS.md`)
- Wszystkie polecenia uruchamiać z katalogu `sklep-meblowy/`.
- Panel admina jest **PL-only** (bez i18n). Front dwujęzyczny, ale `/de` jest zamrożone flagą `DE_ENABLED`.
- Server actions: `"use server"` + `requireAdmin()` + `createAdminClient()` + `revalidatePath`, zwracają `ActionResult` (`{ ok: true; message?: string } | { ok: false; error: string }`), updaty castowane `as never`.
- **localhost i preview używają PRODUKCYJNEJ bazy Supabase** — każda mutacja w panelu dotyka żywego sklepu. Kategorie testowe kasować po sobie.
- Migracje **nie aplikują się automatycznie** — wgrywa je człowiek albo agent przez Supabase MCP (`apply_migration`), za zgodą właściciela.
- **Czysty moduł nie może importować niczego serwerowego** (`next/cache`, `next/headers`, `server-only`) — `category-tree.ts` jest importowany z komponentów `"use client"` (FilterBar, KategorieEditor). Wzorzec: `collection-tiles.ts` vs `collections.ts`.
- **Widoczność (`active`) dotyczy nawigacji i filtrów, nie dostępności produktu.** Tak jest dziś i tak zostaje: ukrycie węzła zdejmuje go z menu, filtrów i sitemapy, ale produkty pozostają w `/sklep`, w wyszukiwarce i pod własnymi adresami. To NIE jest błąd do naprawienia.
- Slug jest unikalny w całej tabeli `categories` — dla każdego poziomu. `?kategoria=<slug>` musi wskazywać jednoznacznie.
- Bramki przed każdym commitem: `npx tsc --noEmit` (0 błędów), `npm test` (wszystko zielone), `npm run build` (przechodzi), `npm run lint` (0 błędów).
- **WYJĄTEK od bramki `tsc`/`build`, rozstrzygnięty przez właściciela 2026-08-04:** Task 3 usuwa stare API kategorii, którego konsumenci są przepisywani w Taskach 4-8. Dlatego **w Taskach 3-7 `tsc` może zgłaszać błędy — ale WYŁĄCZNIE w plikach należących do późniejszych tasków** (lista plików jest w sekcji „Struktura plików"), a `npm run build` może nie przechodzić. Każdy taki task nadal musi mieć zielone `npm test` i `npm run lint` dla plików, które tknął. **Pełne zero `tsc` i przechodzący `build` obowiązują od Taska 8** — to pierwszy commit, na którym gałąź jest budowalna. Błąd `tsc` w pliku, którego żaden dalszy task nie wymienia, jest zawsze usterką do naprawienia, nie skutkiem tego wyjątku.
- W repo **nie ma git hooków** (`.git/hooks` puste, brak husky/lint-staged), więc `--no-verify` niczego nie pomija i nie należy go używać.
- **Stan wyjściowy testów: 1060 testów w 85 plikach.** Odpal `npm test` przed Taskiem 1 i zapisz realną liczbę — będzie punktem odniesienia.
- E2E bez `E2E_BASE_URL` lecą **w produkcję**. Lokalnie: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e -- <plik>`.

## Kolejność wdrożenia (przeczytaj, zanim zaczniesz)

Migracja 68 jest bezpieczna do zaaplikowania **przed** deployem kodu i to jest zamierzone:

- Nowe węzły-rodzice (dawne grupy) wchodzą do `categories` z `group_id = null`. Stary kod na produkcji grupuje kategorie przez `group_slug` (z relacji `group:category_groups`), więc dla tych wierszy dostaje `""` i **nie renderuje ich** ani w pasku, ani w stopce, ani w filtrach, ani w selektach produktu.
- Jedyny widoczny efekt na starym kodzie: sitemap zyskuje kilka adresów `?kategoria=<slug rodzica>` (prowadzą do pustych listingów, dopóki nie wejdzie nowy kod) i dwa slugi kategorii się zmieniają. Linki w menu generują się z bazy, więc naprawiają się same — z opóźnieniem do 5 minut (`unstable_cache`, `revalidate: 300`).
- Dlatego: **nie próbuj deployować kodu przed migracją.** Odwrotna kolejność (kod przed migracją) wywala sklep, bo nowy kod czyta `parent_id`, którego nie ma.

## Struktura plików

| Plik | Odpowiedzialność |
|---|---|
| `supabase/migrations/68_categories_tree.sql` | **Nowy.** `parent_id`, rozwiązanie kolizji slugów, przeniesienie grup, trigger antycykliczny, RPC `reorder_categories`. |
| `app/_lib/category-tree.ts` | **Nowy.** Czysty moduł: `buildTree`, `descendantSlugs`, `pathTo`, `effectiveActive`, `menuProjection`, `flattenForSelect`, `allowedParents`, `resolveCategoryFilter`, `subtreeProductCounts`. Zero importów serwerowych. |
| `app/_lib/__tests__/category-tree.test.ts` | **Nowy.** Testy całego modułu, bez bazy. |
| `app/_lib/categories.ts` | **Zmiana.** Fetch + cache + lokalizacja. Traci `Section`, `getSections`, `getAllSections`, `getCategoriesBySection`, `groupCategoriesForSelect`; `CategoryDef` traci `group_id`/`group_slug`, zyskuje `parent_id`. |
| `app/_lib/__tests__/categories.test.ts` | **Zmiana.** Testy `groupCategoriesForSelect` odchodzą razem z funkcją (zastąpione testami `flattenForSelect`). |
| `app/_lib/products.ts` | **Zmiana.** Jeden filtr kategorii przez `resolveCategoryFilter` + `.in("category", slugi)` zamiast dwóch gałęzi. |
| `app/_components/layout/Navbar.tsx` | **Zmiana.** Projekcja `menuProjection` zamiast ręcznego grupowania po `group_slug`. |
| `app/_components/layout/NavStrip.tsx` | **Zmiana.** Megamenu do trzech poziomów, linki `?kategoria=`. |
| `app/_components/layout/MobileMenu.tsx` | **Zmiana.** Akordeon do trzech poziomów. |
| `app/_components/layout/Footer.tsx` | **Zmiana.** Kolumna = korzeń, w niej poziom 2 (bez wnuków). |
| `app/sklep/page.tsx` | **Zmiana.** Nagłówek i okruszki z `pathTo`, pasek dzieci nad produktami, projekcja drzewa do filtrów. |
| `app/sklep/CategoryChildren.tsx` | **Nowy.** Pasek dzieci węzła — jedyna droga klienta do poziomu 4+. |
| `app/_components/ui/FilterBar.tsx` | **Zmiana.** Dropdown kategorii rysuje drzewo z wcięciami. |
| `app/admin/kategorie/actions.ts` | **Zmiana.** Akcje na drzewie: `parent_id`, `reorderCategories`, walidacje cyklu i dzieci; akcje grup odchodzą. |
| `app/admin/kategorie/page.tsx` | **Zmiana.** Podaje płaską listę węzłów + liczniki produktów. |
| `app/admin/kategorie/KategorieEditor.tsx` | **Zmiana.** Lista-drzewo z przeciąganiem i polem „Rodzic"; `GroupForm` odchodzi. |
| `app/admin/produkty/nowy/page.tsx`, `nowy/NewProductForm.tsx` | **Zmiana.** `flattenForSelect` zamiast `groupCategoriesForSelect`. |
| `app/admin/produkty/[id]/page.tsx`, `[id]/ProductEditor.tsx` | **Zmiana.** Ten sam select z wcięciami. |
| `app/_lib/de-content-maps.ts` | **Zmiana.** Jedna mapa `CATEGORY_LABEL_DE` po slugu, bez martwych kluczy. |
| `e2e/category-menu.spec.ts` | **Nowy.** Guard: pasek linkuje `?kategoria=`, dropdown ma „Wszystkie w …". |
| `docs/jak-dodac-kategorie.md` | **Zmiana.** Instrukcja dla Oli: drzewo, przeciąganie, „Rodzic". |

---

### Task 1: Migracja 68 — drzewo, kolizje slugów, guardy

**Files:**
- Create: `supabase/migrations/68_categories_tree.sql`
- Modify: `app/_lib/de-content-maps.ts:13-35`

**Interfaces:**
- Consumes: nic (pierwszy task).
- Produces: kolumna `public.categories.parent_id uuid null`; funkcja `public.reorder_categories(p_parent uuid, p_ids uuid[]) returns void`; trigger `trg_categories_no_cycle`; slugi `materace-kieszeniowe` i `naroznik-u` w miejsce `materace` i `pufy`; mapa `CATEGORY_LABEL_DE` jako jedyna mapa etykiet DE dla kategorii.

- [ ] **Step 1: Zapisz stan wyjściowy testów**

Run: `npm test`
Zanotuj liczbę testów i plików. Jeśli cokolwiek jest czerwone **przed** twoimi zmianami — zatrzymaj się i zgłoś to, nie naprawiaj po drodze.

- [ ] **Step 2: Napisz plik migracji**

Utwórz `supabase/migrations/68_categories_tree.sql`:

```sql
-- Migracja 68: kategorie jako jedno drzewo bez limitu głębokości.
-- Spec: docs/superpowers/specs/2026-08-04-podkategorie-drzewo-design.md
--
-- Dwa poziomy były zaszyte w schemacie: category_groups (pasek) + categories
-- (rozwijana lista). Po tej migracji jest JEDNO drzewo w categories z parent_id,
-- a produkt może wisieć na dowolnym węźle.
--
-- MODEL EXPAND-FIRST (jak migracja 67): group_id i tabela category_groups
-- ZOSTAJĄ nietknięte jako martwy balast. Kod przestaje je czytać, ale cofnięcie
-- deployu nie wywala sklepu. Sprzątanie = osobna migracja 69, dopiero gdy nowa
-- wersja posiedzi na produkcji.

-- ============================================================
-- 1. Pole rodzica
-- ============================================================
-- on delete restrict jak products_category_fk: usunięcie węzła z dziećmi ma
-- blokować baza, nie tylko UI panelu.
alter table public.categories
  add column if not exists parent_id uuid references public.categories(id) on delete restrict;

create index if not exists idx_categories_parent on public.categories (parent_id);

-- Węzeł najwyższego poziomu nie należy do żadnej grupy.
alter table public.categories alter column group_id drop not null;

-- ============================================================
-- 2. Kolizje slugów — PRZED wstawieniem grup
-- ============================================================
-- slug jest unikalny w całej tabeli, a trzy grupy mają dziś slug identyczny ze
-- slugiem istniejącej kategorii: materace, pufy, schodki-dla-pupila.
--
-- materace  → kategoria „Materace kieszeniowe" (slug rozjechany z etykietą)
-- pufy      → kategoria „Narożnik w kształcie U" (slug z migracji 09 to naroznik-u)
-- schodki-dla-pupila → grupa i kategoria mają tę SAMĄ nazwę (nagłówek-atrapa)
--                      → grupa nie tworzy węzła, patrz krok 3.
--
-- products.category jedzie samo: products_category_fk ma on update cascade.
-- Warunek `where slug = ...` jest sam z siebie idempotentny.
update public.categories set slug = 'materace-kieszeniowe' where slug = 'materace';
update public.categories set slug = 'naroznik-u'           where slug = 'pufy';

-- cross_sell_categories to TABLICA slugów (text[] not null default '{}',
-- migracja 16) i żaden FK jej nie pilnuje. Bez tego dobór materaca do łóżka
-- przestaje proponować kieszeniowe i NIE zgłasza błędu — sekcja „Polecane
-- materace" po prostu robi się pusta.
update public.categories
   set cross_sell_categories = array_replace(cross_sell_categories, 'materace', 'materace-kieszeniowe')
 where 'materace' = any(cross_sell_categories);

update public.categories
   set cross_sell_categories = array_replace(cross_sell_categories, 'pufy', 'naroznik-u')
 where 'pufy' = any(cross_sell_categories);

-- ============================================================
-- 3. Grupy → węzły najwyższego poziomu
-- ============================================================
-- GUARD wzorem migracji 66: projekt aplikuje migracje ręcznie i ma niepełny
-- rejestr, więc plik może zostać odpalony ponownie. Bez guarda drugie odpalenie
-- przestawiłoby układ zrobiony przeciąganiem w panelu z powrotem na ten sprzed
-- migracji.
do $$
begin
  if exists (select 1 from public.categories where parent_id is not null) then
    raise notice 'Drzewo kategorii jest juz zbudowane - backfill pominiety';
    return;
  end if;

  -- Grupa, której slug pokrywa się ze slugiem istniejącej kategorii, NIE tworzy
  -- węzła (dziś: schodki-dla-pupila). Kategoria zostaje na najwyższym poziomie.
  -- needs_translation/translated_at jadą razem (obie tabele mają te kolumny od
  -- migracji 29) — inaczej przetłumaczona grupa wraca jako „do tłumaczenia".
  insert into public.categories
    (slug, label, label_de, parent_id, sort_order, active, needs_translation, translated_at)
  select g.slug, g.label, g.label_de, null, g.sort_order, g.active,
         g.needs_translation, g.translated_at
    from public.category_groups g
   where not exists (select 1 from public.categories c where c.slug = g.slug);

  -- Kategoria, której grupa nie dostała węzła, zostaje z parent_id = null.
  update public.categories c
     set parent_id = p.id
    from public.category_groups g
    join public.categories p on p.slug = g.slug and p.parent_id is null
   where c.group_id = g.id
     and c.id <> p.id;
end $$;

-- ============================================================
-- 4. Brak cykli
-- ============================================================
-- Bez tego pole „Rodzic" w panelu jednym zapisem odcina gałąź od drzewa,
-- a każdy przebieg po ścieżce w górę (okruszki, efektywna widoczność) wisi.
create or replace function public.categories_no_cycle()
returns trigger language plpgsql as $$
declare
  cur  uuid := new.parent_id;
  hops int  := 0;
begin
  if new.parent_id is null then
    return new;
  end if;

  if new.parent_id = new.id then
    raise exception 'Kategoria nie moze byc swoim wlasnym rodzicem';
  end if;

  while cur is not null loop
    if cur = new.id then
      raise exception 'Cykl w drzewie kategorii';
    end if;
    select parent_id into cur from public.categories where id = cur;
    hops := hops + 1;
    if hops > 50 then
      raise exception 'Drzewo kategorii zbyt glebokie (mozliwy cykl)';
    end if;
  end loop;

  return new;
end $$;

drop trigger if exists trg_categories_no_cycle on public.categories;
create trigger trg_categories_no_cycle
  before insert or update of parent_id on public.categories
  for each row execute function public.categories_no_cycle();

-- ============================================================
-- 5. Atomowy reorder wśród rodzeństwa
-- ============================================================
-- 1:1 wzorem reorder_collections (migracja 66). Pętla UPDATE po jednym wierszu
-- przy padzie w połowie zostawia rodzeństwo z pomieszanymi numerami.
--
-- `is not distinct from` jest nośne: dla najwyższego poziomu p_parent jest null,
-- a `c.parent_id = null` nigdy nie jest prawdą — bez tego przeciąganie na
-- najwyższym poziomie zapisywałoby ciszę. Klauzula jest jednocześnie
-- zabezpieczeniem: żądanie z id z innej gałęzi nie przestawi niczego.
create or replace function public.reorder_categories(p_parent uuid, p_ids uuid[])
returns void language sql as $$
  update public.categories c
     set sort_order = (o.ord - 1)::int
    from unnest(p_ids) with ordinality as o(id, ord)
   where c.id = o.id
     and c.parent_id is not distinct from p_parent;
$$;

revoke execute on function public.reorder_categories(uuid, uuid[]) from public;
grant  execute on function public.reorder_categories(uuid, uuid[]) to service_role;
```

- [ ] **Step 3: Sprawdź plik migracji przeciwko tej liście**

Projekt **nie ma lokalnej bazy** — localhost i preview celują w produkcyjnego Supabase, więc migracji nie da się „odpalić na próbę". Jedyne dostępne bramki to ten przegląd i zapytania weryfikacyjne po aplikacji (Step 8). Tak samo weryfikowano migracje 66 i 67.

Przeczytaj to, co napisałeś, i potwierdź każdy punkt (to nie jest formalność — migracja pójdzie na żywą bazę ze 16 kategoriami i produktami):

1. Oba `update ... set slug` stoją **przed** blokiem `do $$` wstawiającym grupy. Odwrotna kolejność wywala migrację na `categories_slug_key`.
2. Oba `array_replace` dla `cross_sell_categories` są obecne — po jednym na każdy przemianowany slug.
3. Blok `do $$` wychodzi przez `return`, gdy jakikolwiek węzeł ma już `parent_id`.
4. `alter column group_id drop not null` jest przed wstawianiem grup (nowe wiersze mają `group_id = null`).
5. `reorder_categories` ma `is not distinct from`, a nie `=`.
6. Nazwa pliku to `68_categories_tree.sql` — 67 jest zajęte przez próbki.

- [ ] **Step 4: Przepisz mapę etykiet DE**

W `app/_lib/de-content-maps.ts` zamień OBA eksporty (`GROUP_LABEL_DE` i `CATEGORY_LABEL_DE`, linie 13-35) na jedną mapę:

```ts
// ── Kategorie (klucz = slug; categories.label_de wygrywa, gdy admin uzupełni) ──
// Jedna mapa dla całego drzewa — od migracji 68 grupy i kategorie to jedna
// tabela, więc dwie mapy nie mają po czym się rozdzielać.
//
// Świadomie BEZ wpisów dla `fotele` i `materace-kieszeniowe`: stara mapa
// tłumaczyła `fotele` jako „2-Sitzer-Sofa", a `materace` jako „Topper-Matratzen"
// i obie wartości są po prostu złe. Brak wpisu = fallback do PL, czyli widocznie
// nieprzetłumaczone — lepsze niż cicho błędne. `/de` jest zamrożone flagą
// DE_ENABLED, więc przegląd wartości DE to zadanie na odmrożenie.
export const CATEGORY_LABEL_DE: Record<string, string> = {
  salon: "Ecksofas",
  sofy: "Sofas",
  sypialnia: "Betten",
  "naroznik-l": "L-förmiges Ecksofa",
  "naroznik-u": "U-förmiges Ecksofa",
  "sofa-3-osobowa": "3-Sitzer-Sofa",
  "lozko-kontynentalne": "Boxspringbetten",
  "lozka-tapicerowane": "Polsterbetten",
  "lozka-dzieciece": "Kinderbetten",
  "materace-piankowe": "Schaumstoffmatratzen",
};
```

- [ ] **Step 5: Usuń użycia GROUP_LABEL_DE**

W `app/_lib/categories.ts` (linia 13) import zmienia się na jedną nazwę, a funkcja `deGroup` znika w Tasku 3. Na teraz wystarczy, żeby kompilowało: podmień w `deGroup` `GROUP_LABEL_DE` na `CATEGORY_LABEL_DE` i popraw import:

```ts
import { CATEGORY_LABEL_DE } from "./de-content-maps";
```

```ts
function deGroup(g: Section, locale: Locale): Section {
  const r = localizeCategoryGroup(g, locale);
  if (locale === "de" && !(g.label_de && g.label_de.trim())) {
    const de = CATEGORY_LABEL_DE[g.slug];
    if (de) return { ...r, label: de };
  }
  return r;
}
```

- [ ] **Step 6: Bramki**

Run: `npx tsc --noEmit`
Expected: 0 błędów.

Run: `npm test`
Expected: tyle samo testów zielonych co w Step 1.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/68_categories_tree.sql app/_lib/de-content-maps.ts app/_lib/categories.ts
git commit -m "feat(kategorie): migracja 68 - drzewo kategorii, kolizje slugow, RPC reorder"
```

- [ ] **Step 8: Zapytaj właściciela o zgodę na aplikację migracji**

**NIE aplikuj bez zgody.** Napisz właścicielowi dokładnie to:

> Migracja 68 gotowa. Aplikacja na produkcji jest bezpieczna przed deployem kodu (nowe węzły mają `group_id = null`, więc stary sklep ich nie renderuje), ale ZMIENIA dwa slugi kategorii: `materace` → `materace-kieszeniowe` i `pufy` → `naroznik-u`. Produkty przejdą same (kaskada FK), cross-sell przepisuje migracja. Aplikować teraz?

Po zgodzie: `apply_migration` przez Supabase MCP, potem weryfikacja na żywej bazie:

```sql
-- 23 węzły: 16 kategorii + 8 grup minus scalone schodki-dla-pupila
select count(*) from public.categories;
-- 8 korzeni (7 dawnych grup + schodki-dla-pupila jako scalona kategoria)
select count(*) from public.categories where parent_id is null;
-- 0 wierszy — żaden produkt nie został osierocony przez zmianę slugów
select count(*) from public.products p
  where not exists (select 1 from public.categories c where c.slug = p.category);
-- 0 wierszy — cross-sell nie wskazuje na nieistniejące slugi
select unnest(cross_sell_categories) as s from public.categories
  except select slug from public.categories;
```

Jeśli właściciel nie da zgody: idź dalej. Taski 2-8 przechodzą testy jednostkowe bez bazy; weryfikacja na żywo (Task 9) czeka na migrację.

---

### Task 2: Czysty moduł `category-tree.ts`

**Files:**
- Create: `app/_lib/category-tree.ts`
- Test: `app/_lib/__tests__/category-tree.test.ts`

**Interfaces:**
- Consumes: nic z poprzedniego taska (moduł jest czysty i samowystarczalny).
- Produces:
  - `type CategoryNode = { id, slug, label, label_de: string | null, parent_id: string | null, sort_order: number, active: boolean, crossSellCategories: string[] }`
  - `type CategoryTreeNode = CategoryNode & { depth: number; children: CategoryTreeNode[] }`
  - `type MenuNode = { slug: string; label: string; children: MenuNode[] }`
  - `type SelectGroup = { label: string; options: { slug: string; label: string; depth: number }[] }`
  - `MENU_MAX_DEPTH: 3`
  - `byTreeOrder(a: CategoryNode, b: CategoryNode): number`
  - `buildTree(nodes: CategoryNode[]): CategoryTreeNode[]`
  - `descendantSlugs(nodes: CategoryNode[], slug: string): string[]`
  - `pathTo(nodes: CategoryNode[], slug: string): CategoryNode[]`
  - `effectiveActive(nodes: CategoryNode[]): Set<string>`
  - `menuProjection(nodes: CategoryNode[], maxDepth?: number): MenuNode[]`
  - `flattenForSelect(nodes: CategoryNode[]): SelectGroup[]`
  - `allowedParents(nodes: CategoryNode[], id: string): { id: string; label: string; depth: number }[]`
  - `resolveCategoryFilter(nodes, params: { kategoria?: string; sekcja?: string }): { slug: string; slugs: string[] } | null`
  - `subtreeProductCounts(nodes, ownCounts: Record<string, number>): Map<string, { own: number; subtree: number }>`

- [ ] **Step 1: Napisz testy**

Utwórz `app/_lib/__tests__/category-tree.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  buildTree,
  descendantSlugs,
  pathTo,
  effectiveActive,
  menuProjection,
  flattenForSelect,
  allowedParents,
  resolveCategoryFilter,
  subtreeProductCounts,
  type CategoryNode,
} from "@/app/_lib/category-tree";

// Fabryka węzłów — testy podają tylko to, co dla nich istotne.
function node(partial: Partial<CategoryNode> & { id: string; slug: string }): CategoryNode {
  return {
    label: partial.slug.toUpperCase(),
    label_de: null,
    parent_id: null,
    sort_order: 0,
    active: true,
    crossSellCategories: [],
    ...partial,
  };
}

// Drzewo używane przez większość testów:
// meble (0)
//   narozniki (0)
//     naroznik-modulowy (0)
//     naroznik-l (1)
//   sofy (1)
//     sofa-2 (0)
// inspiracje (1)
const TREE: CategoryNode[] = [
  node({ id: "1", slug: "meble", sort_order: 0 }),
  node({ id: "2", slug: "narozniki", parent_id: "1", sort_order: 0 }),
  node({ id: "3", slug: "naroznik-modulowy", parent_id: "2", sort_order: 0 }),
  node({ id: "4", slug: "naroznik-l", parent_id: "2", sort_order: 1 }),
  node({ id: "5", slug: "sofy", parent_id: "1", sort_order: 1 }),
  node({ id: "6", slug: "sofa-2", parent_id: "5", sort_order: 0 }),
  node({ id: "7", slug: "inspiracje", sort_order: 1 }),
];

describe("buildTree", () => {
  it("składa las z płaskiej listy i liczy głębokość od zera", () => {
    const tree = buildTree(TREE);
    expect(tree.map((n) => n.slug)).toEqual(["meble", "inspiracje"]);
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children.map((n) => n.slug)).toEqual(["narozniki", "sofy"]);
    expect(tree[0].children[0].depth).toBe(1);
    expect(tree[0].children[0].children.map((n) => n.slug)).toEqual([
      "naroznik-modulowy",
      "naroznik-l",
    ]);
    expect(tree[0].children[0].children[0].depth).toBe(2);
  });

  it("sortuje rodzeństwo po sort_order, a przy remisie po etykiecie", () => {
    const nodes = [
      node({ id: "a", slug: "zeta", label: "Zeta", sort_order: 0 }),
      node({ id: "b", slug: "alfa", label: "Alfa", sort_order: 0 }),
      node({ id: "c", slug: "pierwszy", label: "Pierwszy", sort_order: -1 }),
    ];
    expect(buildTree(nodes).map((n) => n.slug)).toEqual(["pierwszy", "alfa", "zeta"]);
  });

  it("traktuje sierotę (rodzic nie istnieje) jako korzeń", () => {
    const nodes = [node({ id: "1", slug: "sierota", parent_id: "nie-ma-mnie" })];
    const tree = buildTree(nodes);
    expect(tree.map((n) => n.slug)).toEqual(["sierota"]);
    expect(tree[0].depth).toBe(0);
  });

  it("nie gubi węzłów w cyklu (i nie wisi)", () => {
    const nodes = [
      node({ id: "a", slug: "a", parent_id: "b" }),
      node({ id: "b", slug: "b", parent_id: "a" }),
    ];
    const tree = buildTree(nodes);
    const slugs: string[] = [];
    const walk = (list: typeof tree) => {
      for (const n of list) {
        slugs.push(n.slug);
        walk(n.children);
      }
    };
    walk(tree);
    expect(slugs.sort()).toEqual(["a", "b"]);
  });

  it("nie mutuje wejścia", () => {
    const nodes = [node({ id: "1", slug: "x" })];
    buildTree(nodes);
    expect(nodes[0]).not.toHaveProperty("children");
  });
});

describe("descendantSlugs", () => {
  it("zwraca własny slug plus całe poddrzewo", () => {
    expect(descendantSlugs(TREE, "narozniki")).toEqual([
      "narozniki",
      "naroznik-modulowy",
      "naroznik-l",
    ]);
  });

  it("dla liścia zwraca tylko jego slug", () => {
    expect(descendantSlugs(TREE, "sofa-2")).toEqual(["sofa-2"]);
  });

  it("dla korzenia zbiera wszystko pod nim", () => {
    expect(descendantSlugs(TREE, "meble").sort()).toEqual(
      ["meble", "narozniki", "naroznik-modulowy", "naroznik-l", "sofy", "sofa-2"].sort()
    );
  });

  it("dla nieznanego sluga zwraca pustą listę", () => {
    expect(descendantSlugs(TREE, "nie-ma-takiej")).toEqual([]);
  });

  it("nie wisi na cyklu", () => {
    const nodes = [
      node({ id: "a", slug: "a", parent_id: "b" }),
      node({ id: "b", slug: "b", parent_id: "a" }),
    ];
    expect(descendantSlugs(nodes, "a").sort()).toEqual(["a", "b"]);
  });

  it("zbiera też poddrzewo węzłów nieaktywnych", () => {
    const nodes = [
      node({ id: "1", slug: "rodzic" }),
      node({ id: "2", slug: "ukryte-dziecko", parent_id: "1", active: false }),
    ];
    expect(descendantSlugs(nodes, "rodzic")).toEqual(["rodzic", "ukryte-dziecko"]);
  });
});

describe("pathTo", () => {
  it("zwraca ścieżkę od korzenia do węzła", () => {
    expect(pathTo(TREE, "naroznik-l").map((n) => n.slug)).toEqual([
      "meble",
      "narozniki",
      "naroznik-l",
    ]);
  });

  it("dla korzenia zwraca jednoelementową ścieżkę", () => {
    expect(pathTo(TREE, "meble").map((n) => n.slug)).toEqual(["meble"]);
  });

  it("dla nieznanego sluga zwraca pustą ścieżkę", () => {
    expect(pathTo(TREE, "nie-ma-takiej")).toEqual([]);
  });

  it("nie wisi na cyklu", () => {
    const nodes = [
      node({ id: "a", slug: "a", parent_id: "b" }),
      node({ id: "b", slug: "b", parent_id: "a" }),
    ];
    expect(pathTo(nodes, "a").length).toBeLessThanOrEqual(2);
  });
});

describe("effectiveActive", () => {
  it("ukryty przodek chowa całe poddrzewo", () => {
    const nodes = [
      node({ id: "1", slug: "meble", active: false }),
      node({ id: "2", slug: "narozniki", parent_id: "1", active: true }),
      node({ id: "3", slug: "naroznik-l", parent_id: "2", active: true }),
      node({ id: "4", slug: "inne", active: true }),
    ];
    const visible = effectiveActive(nodes);
    expect(visible.has("inne")).toBe(true);
    expect(visible.has("meble")).toBe(false);
    expect(visible.has("narozniki")).toBe(false);
    expect(visible.has("naroznik-l")).toBe(false);
  });

  it("aktywny węzeł pod aktywnym rodzicem jest widoczny", () => {
    expect(effectiveActive(TREE).size).toBe(TREE.length);
  });

  it("sierota jest widoczna (rodzica nie ma, więc nie ma kto jej ukryć)", () => {
    const nodes = [node({ id: "1", slug: "sierota", parent_id: "nie-ma-mnie" })];
    expect(effectiveActive(nodes).has("sierota")).toBe(true);
  });
});

describe("menuProjection", () => {
  it("pokazuje trzy poziomy i odcina czwarty", () => {
    const nodes = [
      ...TREE,
      node({ id: "8", slug: "modulowy-2os", parent_id: "3", sort_order: 0 }),
    ];
    const menu = menuProjection(nodes);
    const meble = menu.find((n) => n.slug === "meble")!;
    const narozniki = meble.children.find((n) => n.slug === "narozniki")!;
    const modulowy = narozniki.children.find((n) => n.slug === "naroznik-modulowy")!;
    expect(modulowy.children).toEqual([]);
  });

  it("pomija poddrzewo ukrytego przodka", () => {
    const nodes = [
      node({ id: "1", slug: "meble", active: false }),
      node({ id: "2", slug: "narozniki", parent_id: "1" }),
    ];
    expect(menuProjection(nodes)).toEqual([]);
  });

  it("respektuje maxDepth podany jawnie (stopka bierze dwa poziomy)", () => {
    const menu = menuProjection(TREE, 2);
    const meble = menu.find((n) => n.slug === "meble")!;
    expect(meble.children.map((n) => n.slug)).toEqual(["narozniki", "sofy"]);
    expect(meble.children[0].children).toEqual([]);
  });
});

describe("flattenForSelect", () => {
  it("grupuje po korzeniu i podaje głębokość każdej opcji", () => {
    const groups = flattenForSelect(TREE);
    expect(groups.map((g) => g.label)).toEqual(["MEBLE", "INSPIRACJE"]);
    expect(groups[0].options).toEqual([
      { slug: "meble", label: "MEBLE", depth: 0 },
      { slug: "narozniki", label: "NAROZNIKI", depth: 1 },
      { slug: "naroznik-modulowy", label: "NAROZNIK-MODULOWY", depth: 2 },
      { slug: "naroznik-l", label: "NAROZNIK-L", depth: 2 },
      { slug: "sofy", label: "SOFY", depth: 1 },
      { slug: "sofa-2", label: "SOFA-2", depth: 2 },
    ]);
  });

  it("korzeń bez dzieci daje grupę z jedną opcją (produkt może wisieć na nim)", () => {
    const groups = flattenForSelect([node({ id: "1", slug: "schodki" })]);
    expect(groups).toEqual([
      { label: "SCHODKI", options: [{ slug: "schodki", label: "SCHODKI", depth: 0 }] },
    ]);
  });

  // W przeciwieństwie do menuProjection ta funkcja NIE filtruje widoczności:
  // decyduje caller. Formularz „nowy produkt" podaje getCategories() (widoczne),
  // a edytor istniejącego produktu getAllCategories() — inaczej produkt siedzący
  // w ukrytej kategorii nie miałby swojej wartości na liście i „Zapisz"
  // przeniósłby go po cichu do pierwszej opcji.
  it("NIE filtruje ukrytych gałęzi — widoczność jest decyzją wołającego", () => {
    const nodes = [
      node({ id: "1", slug: "meble" }),
      node({ id: "2", slug: "ukryte", parent_id: "1", active: false }),
    ];
    expect(flattenForSelect(nodes)[0].options.map((o) => o.slug)).toEqual([
      "meble",
      "ukryte",
    ]);
  });
});

describe("allowedParents", () => {
  it("nie pozwala wybrać samego siebie ani własnego potomka", () => {
    const slugs = allowedParents(TREE, "2").map((p) => p.id);
    expect(slugs).not.toContain("2"); // sam węzeł
    expect(slugs).not.toContain("3"); // dziecko
    expect(slugs).not.toContain("4"); // dziecko
    expect(slugs).toContain("1"); // rodzic
    expect(slugs).toContain("5"); // rodzeństwo
    expect(slugs).toContain("7"); // inny korzeń
  });

  it("dla nowego węzła (bez id) zwraca całe drzewo", () => {
    expect(allowedParents(TREE, "").length).toBe(TREE.length);
  });

  it("podaje głębokość do wcięcia w liście", () => {
    const parents = allowedParents(TREE, "7");
    expect(parents.find((p) => p.id === "3")?.depth).toBe(2);
  });
});

describe("resolveCategoryFilter", () => {
  it("kategoria wygrywa nad legacy sekcja", () => {
    const res = resolveCategoryFilter(TREE, { kategoria: "sofy", sekcja: "meble" });
    expect(res).toEqual({ slug: "sofy", slugs: ["sofy", "sofa-2"] });
  });

  it("sekcja działa, gdy nie ma kategorii (stare zaindeksowane linki)", () => {
    const res = resolveCategoryFilter(TREE, { sekcja: "sofy" });
    expect(res?.slug).toBe("sofy");
    expect(res?.slugs).toEqual(["sofy", "sofa-2"]);
  });

  it("brak obu parametrów to brak filtra", () => {
    expect(resolveCategoryFilter(TREE, {})).toBeNull();
    expect(resolveCategoryFilter(TREE, { kategoria: "  " })).toBeNull();
  });

  it("nieznany slug daje pustą listę slugów, nie brak filtra", () => {
    expect(resolveCategoryFilter(TREE, { kategoria: "nie-ma" })).toEqual({
      slug: "nie-ma",
      slugs: [],
    });
  });
});

describe("subtreeProductCounts", () => {
  it("liczy własne i z poddrzewa", () => {
    const counts = subtreeProductCounts(TREE, {
      "naroznik-modulowy": 3,
      "naroznik-l": 7,
      "sofa-2": 8,
      meble: 1,
    });
    expect(counts.get("naroznik-modulowy")).toEqual({ own: 3, subtree: 3 });
    expect(counts.get("narozniki")).toEqual({ own: 0, subtree: 10 });
    expect(counts.get("meble")).toEqual({ own: 1, subtree: 19 });
    expect(counts.get("inspiracje")).toEqual({ own: 0, subtree: 0 });
  });
});
```

- [ ] **Step 2: Odpal testy i potwierdź, że padają**

Run: `npx vitest run app/_lib/__tests__/category-tree.test.ts`
Expected: FAIL — `Failed to resolve import "@/app/_lib/category-tree"`.

- [ ] **Step 3: Napisz moduł**

Utwórz `app/_lib/category-tree.ts`:

```ts
// Czysta logika drzewa kategorii — BEZ ŻADNYCH server-only importów
// (next/cache, next/headers), więc bezpieczna do importu z komponentów
// klienckich (FilterBar.tsx, KategorieEditor.tsx). I/O i cache żyją w
// categories.ts — ten sam podział co collection-tiles.ts vs collections.ts.
//
// Wejściem jest zawsze PŁASKA lista węzłów (z categories.ts, już zlokalizowana),
// wyjściem gotowa projekcja. Żadna funkcja tu nie mutuje wejścia.

// Ile poziomów drzewa pokazuje megamenu. Głębsze poziomy są dostępne wyłącznie
// paskiem dzieci na stronie kategorii (CategoryChildren.tsx) — panel rozwijany
// ma skończoną wysokość, a wcięcia na wąskich ekranach zjadają szerokość.
export const MENU_MAX_DEPTH = 3;

export type CategoryNode = {
  id: string;
  slug: string;
  label: string;
  label_de: string | null;
  // null = węzeł najwyższego poziomu (pozycja w pasku nawigacji).
  parent_id: string | null;
  sort_order: number;
  active: boolean;
  crossSellCategories: string[];
};

export type CategoryTreeNode = CategoryNode & {
  depth: number; // 0 = najwyższy poziom
  children: CategoryTreeNode[];
};

export type MenuNode = { slug: string; label: string; children: MenuNode[] };

export type SelectOption = { slug: string; label: string; depth: number };
export type SelectGroup = { label: string; options: SelectOption[] };

// Kolejność rodzeństwa: sort_order rosnąco, przy remisie etykieta. Ten sam
// komparator obowiązuje w sklepie i w panelu — inaczej po pierwszym
// przeciągnięciu panel pokazywałby inny układ niż klient.
export function byTreeOrder(a: CategoryNode, b: CategoryNode): number {
  return a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pl");
}

// Indeks dzieci po rodzicu — jedna iteracja zamiast filtrowania per węzeł.
function childrenByParent(nodes: CategoryNode[]): Map<string, CategoryNode[]> {
  const map = new Map<string, CategoryNode[]>();
  for (const n of nodes) {
    if (!n.parent_id) continue;
    const arr = map.get(n.parent_id) ?? [];
    arr.push(n);
    map.set(n.parent_id, arr);
  }
  for (const arr of map.values()) arr.sort(byTreeOrder);
  return map;
}

// Płaska lista → las. Węzeł, którego rodzic nie istnieje w podanej liście
// (sierota po usunięciu poza aplikacją), trafia na najwyższy poziom — inaczej
// zniknąłby z panelu i nikt by go nie naprawił. Węzły w cyklu też nie giną:
// pierwszy nieodwiedzony zostaje dopięty jako korzeń.
export function buildTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const byId = new Map<string, CategoryTreeNode>();
  for (const n of nodes) byId.set(n.id, { ...n, depth: 0, children: [] });

  const roots: CategoryTreeNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent && parent.id !== node.id) parent.children.push(node);
    else roots.push(node);
  }

  const seen = new Set<string>();
  function walk(list: CategoryTreeNode[], depth: number) {
    list.sort(byTreeOrder);
    for (const n of list) {
      if (seen.has(n.id)) continue;
      seen.add(n.id);
      n.depth = depth;
      // Krawędź wsteczna musi wypaść ze ZWRACANEJ struktury, nie tylko
      // z tego przebiegu. Faza budowania wyżej wpycha każdy węzeł do tablicy
      // `children` rodzica bez sprawdzania cyklu, więc przy A→B→A zwrócone
      // drzewo zawiera `tree[0].children[0].children[0] === tree[0]`. Sam
      // zbiór `seen` chroni tylko przypisywanie `depth` — konsument, który
      // schodzi rekurencyjnie po `children` (menu, filtry, panel, selecty),
      // wpadłby w nieskończoną rekurencję. W drzewie bez cyklu ten filtr jest
      // matematycznym no-op: każdy węzeł ma jeden `parent_id`, więc trafia do
      // dokładnie jednej tablicy `children` i nie może być jeszcze odwiedzony.
      n.children = n.children.filter((c) => !seen.has(c.id));
      walk(n.children, depth + 1);
    }
  }
  walk(roots, 0);

  // Cykl: A→B→A nie jest osiągalny z żadnego korzenia. Dopinamy pierwszy
  // nieodwiedzony węzeł jako korzeń; `seen` gwarantuje, że walk się zatrzyma.
  for (const node of byId.values()) {
    if (seen.has(node.id)) continue;
    node.depth = 0;
    roots.push(node);
    seen.add(node.id);
    node.children = node.children.filter((c) => !seen.has(c.id));
    walk(node.children, 1);
  }

  roots.sort(byTreeOrder);
  return roots;
}

// Slug węzła + slugi CAŁEGO poddrzewa, w kolejności DFS. To jest definicja
// „co pokazuje listing kategorii": produkty węzła i wszystkiego pod nim.
// Nie filtruje po `active` — ukrycie węzła zdejmuje go z nawigacji, a nie
// odbiera dostępu do produktów (patrz Global Constraints).
export function descendantSlugs(nodes: CategoryNode[], slug: string): string[] {
  const start = nodes.find((n) => n.slug === slug);
  if (!start) return [];

  const children = childrenByParent(nodes);
  const out: string[] = [];
  const seen = new Set<string>();

  function visit(node: CategoryNode) {
    if (seen.has(node.id)) return; // cykl
    seen.add(node.id);
    out.push(node.slug);
    for (const child of children.get(node.id) ?? []) visit(child);
  }
  visit(start);

  return out;
}

// Ścieżka od korzenia do węzła — nagłówek i okruszki. Pusta, gdy sluga nie ma.
export function pathTo(nodes: CategoryNode[], slug: string): CategoryNode[] {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const path: CategoryNode[] = [];
  const seen = new Set<string>();

  let cur = nodes.find((n) => n.slug === slug);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id); // cykl
    path.unshift(cur);
    cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
  }
  return path;
}

// Slugi widoczne w nawigacji: węzeł ORAZ wszyscy jego przodkowie muszą być
// aktywni. Bez tego wyłączenie „MEBLI" zostawia ich dzieci w pasku jako
// pozycje najwyższego poziomu. Sierota (rodzica nie ma w liście) jest widoczna
// — nie ma kto jej ukryć, a chowanie jej po cichu ukrywałoby produkty.
export function effectiveActive(nodes: CategoryNode[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const visible = new Set<string>();

  for (const n of nodes) {
    const seen = new Set<string>();
    let cur: CategoryNode | undefined = n;
    let ok = true;
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (!cur.active) {
        ok = false;
        break;
      }
      cur = cur.parent_id ? byId.get(cur.parent_id) : undefined;
    }
    if (ok) visible.add(n.slug);
  }
  return visible;
}

function visibleTree(nodes: CategoryNode[]): CategoryTreeNode[] {
  const visible = effectiveActive(nodes);
  return buildTree(nodes.filter((n) => visible.has(n.slug)));
}

// Projekcja dla paska i stopki: poziom 1 = pozycje paska, 2 = nagłówki kolumn,
// 3 = linki. Głębsze poziomy są odcięte świadomie (patrz MENU_MAX_DEPTH).
export function menuProjection(
  nodes: CategoryNode[],
  maxDepth: number = MENU_MAX_DEPTH
): MenuNode[] {
  function project(list: CategoryTreeNode[], depth: number): MenuNode[] {
    if (depth >= maxDepth) return [];
    return list.map((n) => ({
      slug: n.slug,
      label: n.label,
      children: project(n.children, depth + 1),
    }));
  }
  return project(visibleTree(nodes), 0);
}

// Projekcja dla <select> w formularzach produktu. HTML nie zna zagnieżdżonych
// <optgroup>, więc grupa to KORZEŃ, a opcje to wszyscy jego potomkowie
// z głębokością do wcięcia. Korzeń jest też opcją — produkt może wisieć
// na dowolnym węźle.
//
// Świadomie BEZ filtra widoczności (inaczej niż menuProjection): decyduje
// wołający. Formularz „nowy produkt" podaje getCategories() (tylko widoczne),
// a edytor istniejącego produktu getAllCategories() — produkt siedzący
// w ukrytej kategorii musi widzieć swoją własną wartość na liście, bo inaczej
// przeglądarka pokaże pierwszą opcję, a „Zapisz" po cichu go przeniesie.
export function flattenForSelect(nodes: CategoryNode[]): SelectGroup[] {
  return buildTree(nodes).map((root) => {
    const options: SelectOption[] = [];
    function walk(n: CategoryTreeNode, depth: number) {
      options.push({ slug: n.slug, label: n.label, depth });
      for (const c of n.children) walk(c, depth + 1);
    }
    walk(root, 0);
    return { label: root.label, options };
  });
}

// Lista do pola „Rodzic" w panelu: całe drzewo BEZ samego węzła i bez jego
// potomków. Wybór potomka odciąłby gałąź od drzewa (baza i tak odrzuci to
// triggerem, ale lepiej nie pokazywać opcji, która zawsze kończy się błędem).
// Pusty `id` (nowy węzeł) → całe drzewo.
export function allowedParents(
  nodes: CategoryNode[],
  id: string
): { id: string; label: string; depth: number }[] {
  const blocked = new Set<string>();
  const start = nodes.find((n) => n.id === id);
  if (start) {
    const bySlug = new Map(nodes.map((n) => [n.slug, n]));
    for (const slug of descendantSlugs(nodes, start.slug)) {
      const n = bySlug.get(slug);
      if (n) blocked.add(n.id);
    }
  }

  const out: { id: string; label: string; depth: number }[] = [];
  function walk(n: CategoryTreeNode, depth: number) {
    if (blocked.has(n.id)) return; // potomkowie też wypadają
    out.push({ id: n.id, label: n.label, depth });
    for (const c of n.children) walk(c, depth + 1);
  }
  for (const root of buildTree(nodes)) walk(root, 0);
  return out;
}

// JEDYNE miejsce, w którym rozstrzyga się, co filtruje listing. `kategoria`
// wygrywa nad legacy `sekcja` (klient kliknął konkretniejszy filtr), a wynik to
// zawsze CAŁE poddrzewo. Nieznany slug zwraca pustą listę slugów, a nie null —
// listing ma wtedy pokazać zero produktów, nie wszystkie.
export function resolveCategoryFilter(
  nodes: CategoryNode[],
  params: { kategoria?: string; sekcja?: string }
): { slug: string; slugs: string[] } | null {
  const raw = params.kategoria?.trim() || params.sekcja?.trim();
  if (!raw) return null;
  return { slug: raw, slugs: descendantSlugs(nodes, raw) };
}

// Liczniki dla panelu: własne produkty i produkty z całego poddrzewa. Sam
// licznik poddrzewa ukrywałby fakt, że rodzic nie ma nic swojego.
export function subtreeProductCounts(
  nodes: CategoryNode[],
  ownCounts: Record<string, number>
): Map<string, { own: number; subtree: number }> {
  const result = new Map<string, { own: number; subtree: number }>();
  for (const n of nodes) {
    const subtree = descendantSlugs(nodes, n.slug).reduce(
      (sum, slug) => sum + (ownCounts[slug] ?? 0),
      0
    );
    result.set(n.slug, { own: ownCounts[n.slug] ?? 0, subtree });
  }
  return result;
}
```

- [ ] **Step 4: Odpal testy**

Run: `npx vitest run app/_lib/__tests__/category-tree.test.ts`
Expected: PASS, wszystkie bloki `describe` zielone.

- [ ] **Step 5: Bramki i commit**

Run: `npx tsc --noEmit && npm test`
Expected: 0 błędów, liczba testów wzrosła o testy z tego pliku.

```bash
git add app/_lib/category-tree.ts app/_lib/__tests__/category-tree.test.ts
git commit -m "feat(kategorie): czysty modul drzewa kategorii z projekcjami i guardami"
```

---

### Task 3: Warstwa danych — `categories.ts` i filtr produktów

**Files:**
- Modify: `app/_lib/categories.ts` (cały plik — przepisanie publicznego API)
- Modify: `app/_lib/products.ts:80-133`
- Modify: `app/_lib/__tests__/categories.test.ts` (usunięcie testów `groupCategoriesForSelect`)
- Modify: `app/sitemap.ts:57-64` (komentarz — zachowanie bez zmian)

**Interfaces:**
- Consumes: wszystko z `category-tree.ts` (Task 2).
- Produces:
  - `CategoryDef` = alias na `CategoryNode` (import z `category-tree.ts`)
  - `getCategories(locale?): Promise<CategoryDef[]>` — tylko **efektywnie** widoczne
  - `getAllCategories(locale?): Promise<CategoryDef[]>` — wszystkie, dla panelu i filtrów produktów
  - `getCategory(slug, locale?)`, `getCategoryLabel(slug, locale?)`, `isCategorySlug(slug)`, `invalidateCategoriesCache()`, `CATEGORIES_CACHE_TAG` — bez zmian w sygnaturach
  - **Usunięte:** `Section`, `getSections`, `getAllSections`, `getSection`, `getCategoriesBySection`, `groupCategoriesForSelect`
  - `getProducts({ category, sectionSlug, ... })` — `sectionSlug` zostaje w typie jako legacy alias

- [ ] **Step 1: Przepisz `categories.ts`**

Zamień zawartość `app/_lib/categories.ts` na:

```ts
// Source of truth dla kategorii — tabela `categories` w Supabase, od migracji 68
// jedno DRZEWO (kolumna parent_id). Edytowane w /admin/kategorie.
//
// Ten plik to WYŁĄCZNIE I/O + cache + lokalizacja. Cała logika drzewa
// (poddrzewa, ścieżki, projekcje menu i selectów) żyje w category-tree.ts,
// który jest czysty i testowalny bez bazy.
//
// Wszystkie helpery są ASYNC. W Server Components dane cache'ujemy per-request
// przez React `cache()`. Mutacje (admin) revalidują tag `categories`, żeby
// Navbar, stopka i filtry odświeżyły się natychmiast.

import { cache } from "react";
import { unstable_cache, revalidateTag } from "next/cache";
import { createAdminClient } from "./supabase/server";
import { localizeCategory } from "./localize";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import { CATEGORY_LABEL_DE } from "./de-content-maps";
import { effectiveActive, type CategoryNode } from "./category-tree";

// Kategoria = węzeł drzewa. Alias trzymamy, bo `CategoryDef` jest zaimportowane
// w kilkunastu miejscach, a nazwa nadal opisuje to samo pojęcie.
export type CategoryDef = CategoryNode;

// Lokalizacja etykiety DE: najpierw kolumna `label_de` z DB (gdy admin uzupełni),
// w przeciwnym razie ręczna mapa po slug (de-content-maps), na końcu fallback PL.
function deCat(c: CategoryDef, locale: Locale): CategoryDef {
  const r = localizeCategory(c, locale);
  if (locale === "de" && !(c.label_de && c.label_de.trim())) {
    const de = CATEGORY_LABEL_DE[c.slug];
    if (de) return { ...r, label: de };
  }
  return r;
}

// Tag używany przez `unstable_cache` i `revalidateTag` po mutacjach z admina.
export const CATEGORIES_CACHE_TAG = "categories";

// `unstable_cache` cache'uje cross-request — admin po mutacji wywoła
// `revalidateTag(CATEGORIES_CACHE_TAG)` żeby wymusić refresh.
//
// UWAGA: używamy `createAdminClient()` (service role, bez cookies), bo Next 16
// zabrania użycia dynamic data sources (cookies/headers) wewnątrz `unstable_cache`.
// Kategorie są danymi publicznymi (RLS: public read), więc bypass RLS przez
// admin client jest tu bezpieczny.
const fetchCategoriesData = unstable_cache(
  async (): Promise<CategoryNode[]> => {
    const supabase = await createAdminClient();

    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("sort_order", { ascending: true });

    return ((data ?? []) as Array<{
      id: string;
      slug: string;
      label: string;
      label_de: string | null;
      parent_id: string | null;
      cross_sell_categories: string[] | null;
      sort_order: number;
      active: boolean;
    }>).map((c) => ({
      id: c.id,
      slug: c.slug,
      label: c.label,
      label_de: c.label_de ?? null,
      parent_id: c.parent_id ?? null,
      crossSellCategories: c.cross_sell_categories ?? [],
      sort_order: c.sort_order,
      active: c.active,
    }));
  },
  ["categories-tree"],
  { tags: [CATEGORIES_CACHE_TAG], revalidate: 300 }
);

// React `cache()` deduplikuje wywołania w tym samym renderze — kilka komponentów
// pobiera tę samą strukturę bez wielokrotnego trafienia DB.
const getData = cache(fetchCategoriesData);

// ============================================================
// Public API (async)
// ============================================================

// UWAGA architektura cache: `getData()` (unstable_cache) trzyma SUROWE wiersze
// PL+_de — locale NIE wchodzi do klucza cache (jeden cache dla obu języków).
// Lokalizacja dzieje się tu, w publicznym API, które dostaje `locale` od strony.

// Nawigacja, stopka, filtry, sitemap. Filtruje EFEKTYWNĄ widoczność: ukrycie
// węzła chowa całe jego poddrzewo. Zwykłe `.filter(c => c.active)` zostawiałoby
// dzieci ukrytego rodzica w pasku jako pozycje najwyższego poziomu.
export async function getCategories(
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  const nodes = await getData();
  const visible = effectiveActive(nodes);
  return nodes.filter((c) => visible.has(c.slug)).map((c) => deCat(c, locale));
}

// Panel admina ORAZ filtrowanie listingu: bez filtra widoczności. Ukryta
// kategoria nie znika z listingu swojego rodzica — widoczność dotyczy
// nawigacji, nie dostępności produktu (patrz Global Constraints).
export async function getAllCategories(
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef[]> {
  const nodes = await getData();
  return nodes.map((c) => deCat(c, locale));
}

export async function getCategory(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<CategoryDef | undefined> {
  if (!slug) return undefined;
  const nodes = await getData();
  const found = nodes.find((c) => c.slug === slug);
  return found ? deCat(found, locale) : undefined;
}

export async function getCategoryLabel(
  slug: string | undefined | null,
  locale: Locale = DEFAULT_LOCALE
): Promise<string | undefined> {
  return (await getCategory(slug, locale))?.label;
}

export async function isCategorySlug(
  value: string | undefined | null
): Promise<boolean> {
  if (!value) return false;
  const nodes = await getData();
  return nodes.some((c) => c.slug === value);
}

// ============================================================
// Helpery dla admina (mutacje)
// ============================================================

// Wywoływać po INSERT/UPDATE/DELETE w admin UI — wymusza refetch DB
// na kolejnym renderze (sklep, navbar, footer odświeżają się).
// Profile "max" = natychmiastowa inwalidacja (Next 16 wymaga 2. argumentu).
export function invalidateCategoriesCache() {
  revalidateTag(CATEGORIES_CACHE_TAG, "max");
}
```

- [ ] **Step 2: Sprawdź, czy `localizeCategoryGroup` ma jeszcze konsumentów**

Run: `npx tsc --noEmit`

Zobaczysz błędy w każdym pliku, który używał usuniętego API — to jest zamierzone i jest twoją listą pracy na Taski 4-8. Zanotuj ją.

Run: `grep -rn "localizeCategoryGroup" app/`
Jeśli nie ma już żadnego użycia poza definicją w `app/_lib/localize.ts`, usuń tę funkcję z `localize.ts`. Jeśli ma — zostaw.

- [ ] **Step 3: Przepisz filtr kategorii w `products.ts`**

W `app/_lib/products.ts` zamień komentarz i gałąź filtrowania (linie ~80-85 w typie i ~117-133 w zapytaniu).

Typ (opis pola `sectionSlug`):

```ts
  // Legacy alias `?sekcja=` — od migracji 68 sekcje i kategorie to jedno drzewo,
  // więc ten parametr rozwiązuje się dokładnie tak samo jak `category`.
  // Zostaje dla zaindeksowanych i zabookmarkowanych linków. Gdy oba są
  // ustawione, `category` wygrywa (patrz resolveCategoryFilter).
  sectionSlug?: string;
```

Zapytanie:

```ts
  // Jeden filtr dla całego drzewa: węzeł pokazuje produkty z siebie ORAZ z całego
  // poddrzewa. Wcześniej były dwie gałęzie (dokładny `category` i lookup po
  // `group_slug`), bo model miał dokładnie dwa poziomy.
  //
  // getAllCategories(), NIE getCategories(): ukryta podkategoria nie ma chować
  // swoich produktów przed listingiem rodzica (patrz Global Constraints).
  const categoryFilter = resolveCategoryFilter(await getAllCategories(), {
    kategoria: category,
    sekcja: sectionSlug,
  });

  if (categoryFilter) {
    if (categoryFilter.slugs.length === 0) {
      // Nieznany slug → pusty listing, nie „wszystkie produkty".
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    } else {
      query = query.in("category", categoryFilter.slugs);
    }
  }
```

Import na górze pliku:

```ts
import { getAllCategories } from "./categories";
import { resolveCategoryFilter } from "./category-tree";
```

⚠️ Sprawdź, co `products.ts` importowało dotąd — jeśli miał `import { getCategories }`, usuń go, gdy nie ma już innych użyć.

- [ ] **Step 4: Usuń martwe testy `groupCategoriesForSelect`**

Cały plik `app/_lib/__tests__/categories.test.ts` testuje tylko `groupCategoriesForSelect`, którego już nie ma. Jego rolę przejęły testy `flattenForSelect` z Taska 2.

```bash
git rm app/_lib/__tests__/categories.test.ts
```

- [ ] **Step 5: Popraw komentarz w sitemapie**

W `app/sitemap.ts:57` zamień komentarz (kod bez zmian — `getCategories()` nadal zwraca to, co ma trafić do sitemapy):

```ts
    // Każdy WIDOCZNY węzeł drzewa jako filtr /sklep?kategoria=X. Listing węzła
    // jest nadzbiorem listingów jego dzieci — to zwykły układ kategorii
    // w sklepie, kanonikale są rozłączne per węzeł. Ukryte gałęzie nie wchodzą
    // (getCategories filtruje efektywną widoczność).
```

- [ ] **Step 6: Sprawdź konsumentów, którzy się NIE zmieniają**

`app/feed.xml/route.ts`, `app/api/search/suggest/route.ts` i `app/sitemap.ts` wołają `getCategories(locale)` — sygnatura się nie zmieniła, więc kompilują się bez zmian. Po zmianie zwracają też węzły-rodzice: feed dostaje etykietę `g:product_type` dla produktu przypiętego do rodzica (dotąd nie miał żadnej), a podpowiedzi wyszukiwania mają o kilka etykiet więcej. Oba efekty są pożądane — nie „naprawiaj" ich filtrowaniem po poziomie.

**Dlaczego nie ma tu testów jednostkowych:** `getProducts` i `getCategories` robią I/O do Supabase, a projekt nie ma warstwy mocków bazy (żaden istniejący test jej nie mockuje). Logika, która mogłaby się zepsuć, została celowo wyciągnięta do `category-tree.ts` i jest przetestowana w Tasku 2 (`resolveCategoryFilter`, `descendantSlugs`, `effectiveActive`). To, co zostało tutaj, to trzy linijki składania zapytania — pokrywa je guard e2e z Taska 8 (ten sam listing przez `?kategoria=` i `?sekcja=`).

- [ ] **Step 7: Bramki**

Run: `npx tsc --noEmit`
Expected: błędy WYŁĄCZNIE w plikach z Tasków 4-8 (Navbar, NavStrip, MobileMenu, Footer, sklep/page, FilterBar, admin/kategorie, admin/produkty). Jeśli błąd jest gdzie indziej — dopisz ten plik do listy pracy, nie obchodź problemu rzutowaniem.

Run: `npm test`
Expected: zielone (testy `category-tree` przechodzą, testy `categories` usunięte).

- [ ] **Step 8: Commit**

Czerwony `tsc` jest tu sankcjonowany wyjątkiem z Global Constraints — pod warunkiem, że **każdy** zgłoszony plik jest wymieniony w „Strukturze plików" jako zmieniany w Taskach 4-8. Jeśli `tsc` wskazuje jakikolwiek inny plik, to usterka: napraw ją, zanim scommitujesz.

```bash
git add app/_lib/categories.ts app/_lib/products.ts app/sitemap.ts
git commit -m "refactor(kategorie): warstwa danych na drzewie, jeden filtr poddrzewem

Konsumenci starego API (nawigacja, listing, panel, selecty produktu) sa
przepisywani w Taskach 4-8, wiec na tym commicie tsc jest czerwony
w plikach tych taskow - wyjatek uzgodniony w Global Constraints."
```

---

### Task 4: Nawigacja — pasek, mobile, stopka

**Files:**
- Modify: `app/_components/layout/Navbar.tsx:12-60,90-94,112-127`
- Modify: `app/_components/layout/NavStrip.tsx` (cały plik)
- Modify: `app/_components/layout/MobileMenu.tsx:8-12,63-110`
- Modify: `app/_components/layout/Footer.tsx:15-42,74-92`

**Interfaces:**
- Consumes: `menuProjection`, `MenuNode` (Task 2); `getCategories` (Task 3).
- Produces: `NavStripNode = MenuNode` przekazywane jako prop `nodes` do `NavStrip` i `MobileMenu`.

- [ ] **Step 1: Przepisz `NavStrip.tsx`**

Zamień zawartość na:

```tsx
import LocalizedLink from "../ui/LocalizedLink";
import type { MenuNode } from "@/app/_lib/category-tree";

export type NavStripPageLink = { id: string; href: string; label: string };

// Wspólne klasy wyzwalacza pozycji paska. BEZ h-24: przy zawijaniu do drugiego
// rzędu pozycje wysokie na całą wysokość headera dałyby pasek na ~190 px.
const TRIGGER_CLS =
  "font-sans text-xs uppercase tracking-widest py-2 flex items-center whitespace-nowrap text-[var(--muted)] transition-colors";
const PANEL_CLS =
  "absolute top-full left-1/2 -translate-x-1/2 z-20 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all";

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Pasek nawigacji desktopowej: korzenie drzewa kategorii + linki do podstron.
//
// Poziom 1 = pozycja paska, poziom 2 = nagłówek kolumny, poziom 3 = linki pod
// nagłówkiem. Głębsze poziomy są odcięte w menuProjection (MENU_MAX_DEPTH)
// i dostępne paskiem dzieci na stronie kategorii — panel rozwijany ma skończoną
// wysokość i przy głębokim drzewie zrobiłby się nieczytelny.
//
// Gdy pozycji jest więcej, niż mieści się w szerokości kontenera, ZAWIJAJĄ SIĘ
// do kolejnego rzędu (flex-wrap) i header rośnie w dół — strona nigdy nie
// rozszerza się w prawo.
//
// Czysty CSS, zero JS: brak przeskoku po hydracji i brak CLS.
export default function NavStrip({
  nodes,
  pageLinks,
  labels,
}: {
  nodes: MenuNode[];
  pageLinks: NavStripPageLink[];
  labels: { allInSection: string };
}) {
  return (
    // min-w-0 jest tu nośne: bez niego kontener nie może zwężyć się poniżej
    // szerokości treści, więc nic by się nie zawinęło.
    <div className="hidden lg:flex items-center flex-1 justify-center min-w-0">
      <nav className="flex flex-wrap items-center justify-start gap-x-6 gap-y-1">
        {nodes.map((root) => {
          // Megamenu (kolumny z nagłówkami) tylko wtedy, gdy jest co grupować.
          // Przy płaskiej gałęzi zostaje jedna kolumna — dokładnie dzisiejszy
          // wygląd, więc migracja nie zmienia menu, dopóki Ola nie pogłębi drzewa.
          const hasGrandchildren = root.children.some((c) => c.children.length > 0);
          return (
            <div key={root.slug} className="relative group shrink-0">
              {/* Sam nagłówek pozycji jest klikalny — prowadzi do listingu
                  całego poddrzewa. Hover otwiera panel z podkategoriami. */}
              <LocalizedLink
                href={`/sklep?kategoria=${root.slug}`}
                className={`${TRIGGER_CLS} gap-1 group-hover:text-[var(--color-gold)]`}
              >
                {root.label}
                <Chevron />
              </LocalizedLink>

              {root.children.length > 0 && (
                <div
                  className={`${PANEL_CLS} ${
                    hasGrandchildren
                      ? "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-4 w-max max-w-[min(90vw,880px)]"
                      : "min-w-[220px]"
                  }`}
                >
                  <LocalizedLink
                    href={`/sklep?kategoria=${root.slug}`}
                    className={`block px-3 py-2 text-sm text-[var(--color-gold)] hover:bg-[var(--bg)] transition-colors border-b border-[var(--border)] font-medium ${
                      hasGrandchildren ? "col-span-full" : "mb-1"
                    }`}
                  >
                    {labels.allInSection} {root.label.toLowerCase()}
                  </LocalizedLink>

                  {root.children.map((child) => (
                    <div key={child.slug} className="min-w-0">
                      <LocalizedLink
                        href={`/sklep?kategoria=${child.slug}`}
                        className={
                          child.children.length > 0
                            ? "block px-3 py-1.5 text-xs font-sans uppercase tracking-widest text-[var(--color-gold-text)] hover:text-[var(--color-gold)] transition-colors"
                            : "block px-3 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                        }
                      >
                        {child.label}
                      </LocalizedLink>
                      {child.children.map((grand) => (
                        <LocalizedLink
                          key={grand.slug}
                          href={`/sklep?kategoria=${grand.slug}`}
                          className="block px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                        >
                          {grand.label}
                        </LocalizedLink>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Podstrony z menu (admin: /admin/podstrony) — zawijają się razem
            z kategoriami, bez osobnego limitu. */}
        {pageLinks.map((item) => (
          <div key={item.id} className="shrink-0">
            <LocalizedLink
              href={item.href}
              className={`${TRIGGER_CLS} hover:text-[var(--color-gold)]`}
            >
              {item.label}
            </LocalizedLink>
          </div>
        ))}
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Przepisz projekcję w `Navbar.tsx`**

Zamień import (linia 12), blok grupowania (linie 43-60) i oba użycia propa:

```tsx
import { getCategories } from "@/app/_lib/categories";
import { menuProjection } from "@/app/_lib/category-tree";
```

```tsx
  const navbarItems = prepareMenuItems(menuRows, "navbar", locale);

  // Drzewo do trzech poziomów: pozycje paska → nagłówki → linki. Ręczne
  // grupowanie po group_slug odeszło razem z tabelą grup (migracja 68).
  const menuNodes = menuProjection(categories);
```

```tsx
        <NavStrip
          nodes={menuNodes}
          pageLinks={navbarItems}
          labels={{ allInSection: t.nav.allInSection }}
        />
```

```tsx
          <MobileMenu
            isLoggedIn={!!user}
            isAdmin={isAdmin(user)}
            nodes={menuNodes}
            pageLinks={navbarItems}
```

⚠️ W `Promise.all` usuń `getSections(locale)` — zostaje samo `getCategories(locale)`. Popraw destrukturyzację (pozycja `sections` znika).

- [ ] **Step 3: Przepisz akordeon w `MobileMenu.tsx`**

Zamień typ (linie 8-12) i blok renderujący sekcje (linie 63-110):

```tsx
import type { MenuNode } from "@/app/_lib/category-tree";
```

```tsx
export default function MobileMenu({
  isLoggedIn = false,
  isAdmin = false,
  nodes = [],
  pageLinks = [],
  labels,
}: {
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  nodes?: MenuNode[];
  pageLinks?: PageLink[];
  labels: MobileMenuLabels;
}) {
```

Blok renderujący (w miejsce `{sections.map(...)}`):

```tsx
            {nodes.map((root) => {
              const isOpen = openSection === root.slug;
              return (
                <div key={root.slug}>
                  <button
                    onClick={() => setOpenSection(isOpen ? null : root.slug)}
                    className="w-full flex items-center justify-between font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors py-1"
                  >
                    <span>{root.label}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-2 mt-2 pl-4 border-l border-[var(--border)]">
                      {/* Skrót do całego poddrzewa bez wybierania podkategorii. */}
                      <LocalizedLink
                        href={`/sklep?kategoria=${root.slug}`}
                        onClick={() => setOpen(false)}
                        className="text-sm text-[var(--color-gold)] hover:underline transition-colors font-medium"
                      >
                        {labels.allInSection} {root.label.toLowerCase()}
                      </LocalizedLink>
                      {root.children.map((child) => (
                        <div key={child.slug} className="flex flex-col gap-2">
                          <LocalizedLink
                            href={`/sklep?kategoria=${child.slug}`}
                            onClick={() => setOpen(false)}
                            className={
                              child.children.length > 0
                                ? "text-xs font-sans uppercase tracking-widest text-[var(--color-gold-text)]"
                                : "text-sm text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
                            }
                          >
                            {child.label}
                          </LocalizedLink>
                          {/* Trzeci poziom — wcięty, żeby było widać, czyj jest. */}
                          {child.children.length > 0 && (
                            <div className="flex flex-col gap-2 pl-4 border-l border-[var(--border)]">
                              {child.children.map((grand) => (
                                <LocalizedLink
                                  key={grand.slug}
                                  href={`/sklep?kategoria=${grand.slug}`}
                                  onClick={() => setOpen(false)}
                                  className="text-sm text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
                                >
                                  {grand.label}
                                </LocalizedLink>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
```

Usuń nieużywany już typ `MobileMenuSection`.

- [ ] **Step 4: Przepisz stopkę**

W `app/_components/layout/Footer.tsx` usuń blok `categoriesBySection` (linie 36-42), zamień import i zapytanie:

```tsx
import { getCategories } from "@/app/_lib/categories";
import { menuProjection } from "@/app/_lib/category-tree";
```

W `Promise.all` zostaje `getCategories(locale)` (bez `getSections`), a pod nim:

```tsx
  // Stopka bierze DWA poziomy: kolumna = pozycja paska, w niej jej dzieci.
  // Trzeci poziom dorzucałby kilkanaście linków i rozdmuchał stopkę.
  const footerNodes = menuProjection(categories, 2);
```

Blok renderujący (w miejsce `{sections.map(...)}`, linie 74-92):

```tsx
        {footerNodes.map((root) => (
          <div key={root.slug}>
            <p className="font-sans text-xs uppercase tracking-widest text-[var(--color-gold)] mb-4">
              <LocalizedLink
                href={`/sklep?kategoria=${root.slug}`}
                className="hover:text-white transition-colors"
              >
                {root.label}
              </LocalizedLink>
            </p>
            <ul className="space-y-3 text-sm text-white/70">
              {root.children.map((child) => (
                <li key={child.slug}>
                  <LocalizedLink
                    href={`/sklep?kategoria=${child.slug}`}
                    className="hover:text-[var(--color-gold)] transition-colors"
                  >
                    {child.label}
                  </LocalizedLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
```

- [ ] **Step 5: Bramki**

Run: `npx tsc --noEmit`
Expected: zostały już tylko błędy z Tasków 5-8 (`app/sklep/page.tsx`, `FilterBar.tsx`, `app/admin/kategorie/*`, `app/admin/produkty/*`).

Run: `npm test && npm run lint`
Expected: zielone, 0 błędów lintera.

- [ ] **Step 6: Commit**

```bash
git add app/_components/layout/ app/_lib/
git commit -m "feat(kategorie): megamenu do trzech poziomow w pasku, mobile i stopce"
```

---

### Task 5: Listing `/sklep` — okruszki, pasek dzieci, filtry

**Files:**
- Create: `app/sklep/CategoryChildren.tsx`
- Modify: `app/sklep/page.tsx:7-11,103-205`
- Modify: `app/_components/ui/FilterBar.tsx:44-51,257-259,409-433`

**Interfaces:**
- Consumes: `pathTo`, `menuProjection`, `MenuNode`, `resolveCategoryFilter` (Task 2); `getCategories`, `getAllCategories` (Task 3).
- Produces: komponent `CategoryChildren` (props: `children: { slug: string; label: string }[]`); prop `nodes: MenuNode[]` w `FilterBar` (zamiast `sections`).

- [ ] **Step 1: Napisz komponent paska dzieci**

Utwórz `app/sklep/CategoryChildren.tsx`:

```tsx
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Pasek podkategorii nad siatką produktów. To NIE jest ozdoba: megamenu pokazuje
// tylko trzy poziomy (MENU_MAX_DEPTH), więc dla czwartego i głębszego to jedyna
// droga, którą klient tam dojdzie. Pusta lista dzieci → komponent nie renderuje
// nic (żadnego odstępu).
// Prop nazywa się `items`, NIE `children`: przekazanie `children` atrybutem
// łamie regułę lintera react/no-children-prop.
export default function CategoryChildren({
  items,
}: {
  items: { slug: string; label: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-2 mb-8">
      {items.map((c) => (
        <LocalizedLink
          key={c.slug}
          href={`/sklep?kategoria=${c.slug}`}
          className="px-4 py-2 rounded-full border border-[var(--border)] text-sm text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          {c.label}
        </LocalizedLink>
      ))}
    </nav>
  );
}
```

- [ ] **Step 2: Przepisz `app/sklep/page.tsx`**

Import (linie 7-11):

```tsx
import { getCategories, getAllCategories } from "@/app/_lib/categories";
import { menuProjection, pathTo } from "@/app/_lib/category-tree";
```

W `Promise.all` (linie 103-139): usuń `getSections(locale)`, zamień `getCategories(locale)` na dwie listy i usuń `getCategoryLabel` (etykietę bierzemy ze ścieżki):

```tsx
  const [
    { products, total, pages },
    facets,
    visibleCategories,
    allCategories,
    allCollections,
    collection,
    wishlistIds,
    rate,
  ] = await Promise.all([
    getProducts({ /* bez zmian */ }),
    getFilterFacets(locale),
    // Filtry i pasek dzieci pokazują tylko widoczne gałęzie…
    getCategories(locale),
    // …a etykieta i okruszki muszą działać też dla ukrytego węzła, bo jego
    // adres pozostaje dostępny (patrz Global Constraints).
    getAllCategories(locale),
    getAllCollections(),
    collectionSlug ? getCollection(collectionSlug, locale) : Promise.resolve(null),
    getUserWishlistIds(),
    getEurRate(),
  ]);
```

Pod spodem (w miejsce `categoryLabels` z linii 143 i `sectionLabel` z linii 169):

```tsx
  const ratings = await getRatingsForProducts(products.map((p) => p.id));
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));

  // Ścieżka od korzenia do wybranego węzła — nagłówek, nadkreślenie i okruszki.
  // `kategoria` wygrywa nad legacy `sekcja`, dokładnie jak w resolveCategoryFilter.
  const activeSlug = category ?? sectionSlug;
  const trail = activeSlug ? pathTo(allCategories, activeSlug) : [];
  const activeNode = trail.length > 0 ? trail[trail.length - 1] : null;

  // Dzieci węzła — TYLKO widoczne, bo to element nawigacji.
  const childNodes = activeNode
    ? visibleCategories
        .filter((c) => c.parent_id === activeNode.id)
        .map((c) => ({ slug: c.slug, label: c.label }))
    : [];
```

Nagłówek — w `resolveHeading` zamień gałęzie `category`/`sectionLabel` na jedną:

```tsx
  // Najbardziej szczegółowy filtr wygrywa: kolekcja > wyszukiwanie > kategoria
  // (dowolny poziom drzewa) > domyślny tytuł.
  function resolveHeading(): string {
    if (collection) return collection.label;
    if (search) return `${t.shop.searchPrefix}: „${search}”`;
    if (activeNode) return activeNode.label;
    return t.shop.allProducts;
  }
```

```tsx
  function resolveEyebrow(): string {
    if (collection) return t.shop.eyebrowCollection;
    if (search) return t.shop.eyebrowSearch;
    // Każdy poziom drzewa to dla klienta „kategoria" — pasek i podkategoria
    // niczym się dla niego nie różnią.
    if (activeNode) return t.shop.eyebrowCategory;
    return t.shop.eyebrowShop;
  }
```

Projekcja dla FilterBar (w miejsce `filterSections`, linie 198-205):

```tsx
  // Drzewo do trzech poziomów — te same dane co megamenu, ten sam moduł.
  const filterNodes = menuProjection(visibleCategories);
```

W JSX: `<FilterBar ... nodes={filterNodes} ... />` zamiast `sections={filterSections}`, a nad siatką produktów, pod `<FilterBar>`:

```tsx
      {/* Okruszki: ścieżka w drzewie. Sam nagłówek nie mówi, gdzie klient jest,
          gdy ta sama nazwa może wystąpić na dwóch gałęziach. */}
      {trail.length > 1 && (
        <nav className="flex flex-wrap items-center gap-2 mb-4 text-xs text-[var(--muted)]">
          {trail.slice(0, -1).map((n) => (
            <span key={n.slug} className="flex items-center gap-2">
              <LocalizedLink
                href={`/sklep?kategoria=${n.slug}`}
                className="hover:text-[var(--color-gold)] transition-colors"
              >
                {n.label}
              </LocalizedLink>
              <span aria-hidden="true">/</span>
            </span>
          ))}
          <span className="text-[var(--fg)]">{activeNode?.label}</span>
        </nav>
      )}

      <CategoryChildren items={childNodes} />
```

Dopisz importy `CategoryChildren` i `LocalizedLink` na górze pliku.

⚠️ Okruszki wstaw **nad** `<FilterBar>`, a `CategoryChildren` **pod** nim — inaczej pasek dzieci odkleja się od siatki produktów, do której się odnosi.

- [ ] **Step 3: Przepisz dropdown kategorii w `FilterBar.tsx`**

Typ propa (linie 44-51) — `FilterBarSection` odchodzi:

```tsx
import type { MenuNode } from "@/app/_lib/category-tree";
```

```tsx
type Props = {
  featureFacets?: FilterBarOptionFacet[];
  optionFacets?: FilterBarOptionFacet[];
  dimensionBounds?: FilterBarDimensionBounds;
  // Drzewo kategorii do trzech poziomów (ta sama projekcja co megamenu).
  nodes?: MenuNode[];
  collections?: FilterBarCollection[];
};
```

W sygnaturze komponentu `sections = []` → `nodes = []`, a wszystkie użycia `sections.length > 0` → `nodes.length > 0`. Usuń też typ `FilterBarSection` — po tej zmianie nie ma konsumenta.

`activeCategory` (linie 257-259) — szukamy na dowolnym poziomie:

```tsx
  // Aktywny węzeł może być na każdym poziomie drzewa, nie tylko liściem.
  const flatNodes: MenuNode[] = [];
  (function collect(list: MenuNode[]) {
    for (const n of list) {
      flatNodes.push(n);
      collect(n.children);
    }
  })(nodes);
  const activeCategory = flatNodes.find((c) => c.slug === category);
```

Zawartość dropdownu (linie 409-433):

```tsx
          {nodes.map((root) => (
            <div key={root.slug} className="mb-3 last:mb-0">
              <button
                onClick={() => {
                  update("kategoria", root.slug);
                  setOpenDropdown(null);
                }}
                className={`mb-1.5 text-[10px] font-sans uppercase tracking-widest transition-colors ${
                  category === root.slug
                    ? "text-[var(--color-gold)]"
                    : "text-[var(--muted)] hover:text-[var(--color-gold)]"
                }`}
              >
                {root.label}
              </button>
              <div className="flex flex-col gap-1.5">
                {root.children.map((child) => (
                  <div key={child.slug} className="flex flex-wrap gap-1.5 items-center">
                    <button
                      onClick={() => {
                        update("kategoria", child.slug);
                        setOpenDropdown(null);
                      }}
                      className={`px-3 py-1.5 rounded-full text-xs font-sans transition-colors ${
                        category === child.slug
                          ? "bg-[var(--color-navy)] text-white"
                          : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                      }`}
                    >
                      {child.label}
                    </button>
                    {/* Trzeci poziom — wcięty i mniejszy, żeby było widać,
                        że należy do chipa po lewej. */}
                    {child.children.map((grand) => (
                      <button
                        key={grand.slug}
                        onClick={() => {
                          update("kategoria", grand.slug);
                          setOpenDropdown(null);
                        }}
                        className={`ml-1 px-2.5 py-1 rounded-full text-[11px] font-sans transition-colors ${
                          category === grand.slug
                            ? "bg-[var(--color-navy)] text-white"
                            : "border border-dashed border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                        }`}
                      >
                        {grand.label}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          ))}
```

- [ ] **Step 4: Bramki**

Run: `npx tsc --noEmit`
Expected: zostały tylko błędy z Tasków 6-8 (`app/admin/kategorie/*`, `app/admin/produkty/*`).

Run: `npm test && npm run lint`
Expected: zielone.

- [ ] **Step 5: Commit**

```bash
git add app/sklep/ app/_components/ui/FilterBar.tsx
git commit -m "feat(sklep): okruszki drzewa, pasek podkategorii i filtry na drzewie"
```

---

### Task 6: Akcje serwerowe panelu kategorii

**Files:**
- Modify: `app/admin/kategorie/actions.ts` (cały plik)
- Modify: `app/admin/kategorie/page.tsx`

**Interfaces:**
- Consumes: `allowedParents`, `descendantSlugs`, `subtreeProductCounts` (Task 2); `getAllCategories`, `invalidateCategoriesCache` (Task 3).
- Produces:
  - `createCategory(formData): Promise<ActionResult>` — pola `label`, `label_de`, `slug`, `parent_id` (pusty = najwyższy poziom), `sort_order`, `cross_sell_categories[]`
  - `updateCategory(formData): Promise<ActionResult>` — jak wyżej + `id`, `active`
  - `deleteCategory(formData): Promise<ActionResult>` — blokuje przy produktach ORAZ przy dzieciach
  - `reorderCategories(parentId: string | null, ids: string[]): Promise<ActionResult>`
  - **Usunięte:** `createGroup`, `updateGroup`, `deleteGroup`
  - `page.tsx` podaje do edytora: `nodes: CategoryDef[]`, `counts: Record<string, { own: number; subtree: number }>`

- [ ] **Step 1: Przepisz akcje**

W `app/admin/kategorie/actions.ts`: usuń całą sekcję `CATEGORY GROUPS` (linie 51-134) i zamień sekcję `CATEGORIES` na:

```ts
// ============================================================
// CATEGORIES — węzły drzewa (od migracji 68 nie ma osobnych grup)
// ============================================================

// Puste pole „Rodzic" w formularzu = węzeł najwyższego poziomu (pozycja paska).
function parseParentId(input: unknown): string | null {
  const s = typeof input === "string" ? input.trim() : "";
  return s === "" ? null : s;
}

// Walidacja rodzica PRZED zapisem — trigger w bazie też to złapie, ale rzuci
// surowym błędem Postgresa. Admin ma dostać zdanie po polsku.
async function validateParent(
  id: string | null,
  parentId: string | null
): Promise<string | null> {
  if (!parentId) return null;
  if (id && parentId === id) return "Kategoria nie może być swoim własnym rodzicem";
  if (!id) return null; // nowy węzeł nie ma jeszcze potomków

  const nodes = await getAllCategories();
  const allowed = new Set(allowedParents(nodes, id).map((p) => p.id));
  if (!allowed.has(parentId)) {
    return "Nie można przenieść kategorii pod jej własną podkategorię — najpierw przenieś podkategorię";
  }
  return null;
}

export async function createCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa kategorii jest za krótka" };

  const slugInput = sanitizeLabel(formData.get("slug"));
  const slug = slugInput ? toSlug(slugInput) : toSlug(label);
  if (!slug) return { ok: false, error: "Nie udało się wygenerować sluga" };

  const parentId = parseParentId(formData.get("parent_id"));
  const labelDe = sanitizeOptionalLabel(formData.get("label_de"));
  const sortOrder = parseInteger(formData.get("sort_order"));
  const crossSellCategories = formData
    .getAll("cross_sell_categories")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const supabase = await createAdminClient();
  const { error } = await supabase.from("categories").insert({
    slug,
    label,
    label_de: labelDe,
    parent_id: parentId,
    cross_sell_categories: crossSellCategories,
    sort_order: sortOrder,
  } as never);

  if (error) {
    if (error.code === "23505")
      return { ok: false, error: `Kategoria o slug "${slug}" już istnieje` };
    return { ok: false, error: error.message };
  }

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: `Kategoria "${label}" dodana` };
}

export async function updateCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id kategorii" };

  const label = sanitizeLabel(formData.get("label"));
  if (label.length < 2) return { ok: false, error: "Nazwa kategorii jest za krótka" };

  const parentId = parseParentId(formData.get("parent_id"));
  const parentError = await validateParent(id, parentId);
  if (parentError) return { ok: false, error: parentError };

  const labelDe = sanitizeOptionalLabel(formData.get("label_de"));
  const sortOrder = parseInteger(formData.get("sort_order"));
  const active = formData.get("active") === "1";
  const crossSellCategories = formData
    .getAll("cross_sell_categories")
    .map((v) => String(v).trim())
    .filter((v) => v.length > 0);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("categories")
    .update({
      label,
      label_de: labelDe,
      parent_id: parentId,
      cross_sell_categories: crossSellCategories,
      sort_order: sortOrder,
      active,
    } as never)
    .eq("id", id);

  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Kategoria zaktualizowana" };
}

export async function deleteCategory(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "Brak id kategorii" };

  const supabase = await createAdminClient();
  const { data: cat } = await supabase
    .from("categories")
    .select("slug, label")
    .eq("id", id)
    .single();

  if (!cat) return { ok: false, error: "Kategoria nie znaleziona" };
  const { slug, label } = cat as { slug: string; label: string };

  // Dzieci PRZED produktami: kategoria-rodzic zwykle nie ma własnych produktów,
  // więc bez tego warunku komunikat brzmiałby „można usunąć", a baza odrzuciłaby
  // zapis przez FK parent_id (on delete restrict) surowym błędem.
  const { count: childCount } = await supabase
    .from("categories")
    .select("id", { count: "exact", head: true })
    .eq("parent_id", id);

  if ((childCount ?? 0) > 0) {
    return {
      ok: false,
      error: `Nie można usunąć kategorii "${label}" — ma ${childCount} ${
        childCount === 1 ? "podkategorię" : "podkategorii"
      }. Najpierw przenieś je pod inną kategorię (pole „Rodzic") albo usuń.`,
    };
  }

  // FK products.category → categories.slug też by to wyłapał, ale damy czytelny
  // komunikat zamiast błędu DB.
  const { count } = await supabase
    .from("products")
    .select("id", { count: "exact", head: true })
    .eq("category", slug);

  if ((count ?? 0) > 0) {
    return {
      ok: false,
      error: `Nie można usunąć kategorii "${label}" — ma ${count} ${
        count === 1 ? "produkt" : "produktów"
      }. Najpierw zmień kategorię tych produktów lub je usuń.`,
    };
  }

  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: `Kategoria "${label}" usunięta` };
}

// Kolejność wśród RODZEŃSTWA. `parentId === null` = najwyższy poziom.
// Wzorem reorderCollections: odrzucamy całe żądanie, gdy którekolwiek id jest
// puste — reorder_categories przenumerowuje dokładnie to, co dostanie, więc
// samo `.filter(Boolean)` przestawiłoby podzbiór i zameldowało sukces.
export async function reorderCategories(
  parentId: string | null,
  ids: string[]
): Promise<ActionResult> {
  await requireAdmin();

  if (!Array.isArray(ids) || ids.length === 0) {
    return { ok: false, error: "Pusta lista kolejności" };
  }
  if (ids.some((id) => !id)) {
    return { ok: false, error: "Lista kolejności zawiera puste id — nic nie zapisano" };
  }

  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("reorder_categories", {
    p_parent: parentId,
    p_ids: ids,
  });
  if (error) return { ok: false, error: `Reorder zawiódł: ${error.message}` };

  invalidateCategoriesCache();
  revalidatePath("/admin/kategorie");
  return { ok: true, message: "Kolejność zapisana" };
}
```

Importy na górze pliku:

```ts
import { getAllCategories, invalidateCategoriesCache } from "@/app/_lib/categories";
import { allowedParents } from "@/app/_lib/category-tree";
```

- [ ] **Step 2: Przepisz `page.tsx` panelu**

Zamień zawartość `app/admin/kategorie/page.tsx` na:

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories, type CategoryDef } from "@/app/_lib/categories";
import { subtreeProductCounts } from "@/app/_lib/category-tree";
import { createAdminClient } from "@/app/_lib/supabase/server";
import KategorieEditor from "./KategorieEditor";

export const metadata = { title: "Kategorie — Admin" };

export default async function AdminKategoriePage() {
  await requireAdmin();

  const [nodes, ownCounts] = await Promise.all([
    getAllCategories(),
    getProductCountsByCategorySlug(),
  ]);

  // Liczniki własne i z poddrzewa liczy czysty moduł — panel dostaje gotowe
  // pary, żeby nie powtarzać tej arytmetyki w komponencie klienckim.
  const counts = Object.fromEntries(subtreeProductCounts(nodes, ownCounts));

  return <KategorieEditor nodes={nodes} counts={counts} />;
}

// Dla każdej kategorii (slug) — ile produktów ma ją przypisaną BEZPOŚREDNIO.
async function getProductCountsByCategorySlug(): Promise<Record<string, number>> {
  const supabase = await createAdminClient();
  const { data } = await supabase.from("products").select("category");
  const rows = (data ?? []) as { category: string }[];
  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.category] = (counts[r.category] ?? 0) + 1;
  }
  return counts;
}

export type { CategoryDef };
```

- [ ] **Step 3: Bramki**

Run: `npx tsc --noEmit`
Expected: błędy tylko w `KategorieEditor.tsx` (Task 7) i `app/admin/produkty/*` (Task 8).

- [ ] **Step 4: Commit**

```bash
git add app/admin/kategorie/actions.ts app/admin/kategorie/page.tsx
git commit -m "feat(admin/kategorie): akcje na drzewie, reorder rodzenstwa i guardy usuwania"
```

---

### Task 7: Panel kategorii — lista-drzewo z przeciąganiem

**Files:**
- Modify: `app/admin/kategorie/KategorieEditor.tsx` (cały plik)

**Interfaces:**
- Consumes: `nodes`, `counts` z `page.tsx` (Task 6); akcje `createCategory`, `updateCategory`, `deleteCategory`, `reorderCategories` (Task 6); `buildTree`, `allowedParents`, `type CategoryTreeNode` (Task 2).
- Produces: nic dla dalszych tasków.

- [ ] **Step 1: Przepisz edytor**

Zamień zawartość `app/admin/kategorie/KategorieEditor.tsx` na:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirm } from "@/app/_context/ConfirmContext";
// Czyste helpery — z category-tree, NIE z categories.ts: ten drugi ciągnie
// next/cache, więc import stąd ("use client") wysypałby build.
import {
  buildTree,
  allowedParents,
  type CategoryNode,
  type CategoryTreeNode,
} from "@/app/_lib/category-tree";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  type ActionResult,
} from "./actions";

type Counts = Record<string, { own: number; subtree: number }>;

export default function KategorieEditor({
  nodes,
  counts,
}: {
  nodes: CategoryNode[];
  counts: Counts;
}) {
  const [items, setItems] = useState<CategoryNode[]>(nodes);
  // Sync stanu z propów po router.refresh() (ten sam wzorzec co CollectionsEditor).
  const [prevNodes, setPrevNodes] = useState(nodes);
  if (nodes !== prevNodes) {
    setPrevNodes(nodes);
    setItems(nodes);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handleResult(res: ActionResult, onSuccess?: () => void) {
    if (res.ok) {
      showToast({ type: "success", message: res.message ?? "Zapisano" });
      onSuccess?.();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const tree = buildTree(items);

  // Przeciąganie działa TYLKO wśród rodzeństwa: każdy poziom ma własny
  // SortableContext, a zapis idzie przez reorder_categories(parent, ids).
  // Przenoszenie między gałęziami to pole „Rodzic" w formularzu — świadoma
  // decyzja właściciela (mniej kodu, brak pomyłkowych upuszczeń).
  function onDragEnd(parentId: string | null, siblings: CategoryTreeNode[]) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = siblings.findIndex((n) => n.id === active.id);
      const newIndex = siblings.findIndex((n) => n.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      const reordered = arrayMove(siblings, oldIndex, newIndex);
      const orderById = new Map(reordered.map((n, i) => [n.id, i]));

      // Cofnięcie wraca do OSTATNIEGO DOBREGO stanu, nie do propów — inaczej
      // nieudany zapis wymazuje wcześniejsze udane przestawienia.
      const prev = items;
      setItems(
        items.map((n) =>
          orderById.has(n.id) ? { ...n, sort_order: orderById.get(n.id)! } : n
        )
      );

      startTransition(async () => {
        const res = await reorderCategories(
          parentId,
          reordered.map((n) => n.id)
        );
        if (!res.ok) {
          setItems(prev);
          showToast({ type: "error", message: res.error });
        }
      });
    };
  }

  function renderLevel(siblings: CategoryTreeNode[], parentId: string | null) {
    if (siblings.length === 0) return null;
    return (
      <DndContext
        id={`categories-dnd-${parentId ?? "root"}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={onDragEnd(parentId, siblings)}
      >
        <SortableContext
          items={siblings.map((n) => n.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {siblings.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                counts={counts}
                expanded={editingId === node.id}
                onToggleExpand={() =>
                  setEditingId(editingId === node.id ? null : node.id)
                }
                onEdit={async (fd) => {
                  const res = await updateCategory(fd);
                  handleResult(res, () => {
                    setEditingId(null);
                    router.refresh();
                  });
                }}
                onDelete={async () => {
                  const fd = new FormData();
                  fd.set("id", node.id);
                  const res = await deleteCategory(fd);
                  handleResult(res, () => router.refresh());
                }}
                onAddChild={() => setCreatingUnder(node.id)}
                allParents={allowedParents(items, node.id)}
                allCategories={items}
              >
                {renderLevel(node.children, node.id)}
                {creatingUnder === node.id && (
                  <Card>
                    <CategoryForm
                      mode="create"
                      parentId={node.id}
                      allParents={allowedParents(items, "")}
                      allCategories={items}
                      onCancel={() => setCreatingUnder(undefined)}
                      onSubmit={async (fd) => {
                        const res = await createCategory(fd);
                        handleResult(res, () => {
                          setCreatingUnder(undefined);
                          router.refresh();
                        });
                      }}
                    />
                  </Card>
                )}
              </TreeRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Kategorie</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Kategorie tworzą drzewo bez limitu głębokości. Pozycje najwyższego poziomu to
            zakładki w górnym menu sklepu, a pod nimi widać dwa kolejne poziomy.
            Głębsze podkategorie klient znajdzie na stronie kategorii, nad produktami.
            Przeciągaj chwytem, żeby zmienić kolejność w obrębie jednego rodzica;
            żeby przenieść gałąź gdzie indziej, użyj pola „Rodzic" w edycji.
          </p>
        </div>
        <button
          onClick={() => {
            setCreatingUnder(null);
            setEditingId(null);
          }}
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          + Nowa pozycja menu
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creatingUnder === null && (
        <Card>
          <CategoryForm
            mode="create"
            parentId={null}
            allParents={allowedParents(items, "")}
            allCategories={items}
            onCancel={() => setCreatingUnder(undefined)}
            onSubmit={async (fd) => {
              const res = await createCategory(fd);
              handleResult(res, () => {
                setCreatingUnder(undefined);
                router.refresh();
              });
            }}
          />
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState message="Brak kategorii. Dodaj pierwszą pozycję menu, żeby zacząć." />
      ) : (
        renderLevel(tree, null)
      )}
    </div>
  );
}

function TreeRow({
  node,
  counts,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddChild,
  allParents,
  allCategories,
  children,
}: {
  node: CategoryTreeNode;
  counts: Counts;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: (fd: FormData) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddChild: () => void;
  allParents: { id: string; label: string; depth: number }[];
  // Kandydaci do cross-sellu — CAŁE drzewo, bo cross-sell nie ma nic wspólnego
  // z hierarchią (łóżko wskazuje materace z zupełnie innej gałęzi).
  allCategories: CategoryNode[];
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });
  const [pendingDelete, startDeleteTransition] = useTransition();
  const confirm = useConfirm();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const c = counts[node.slug] ?? { own: 0, subtree: 0 };

  return (
    <div ref={setNodeRef} style={style}>
      <div
        className="border border-[var(--border)] rounded-xl bg-[var(--card-bg)]"
        style={{ marginLeft: node.depth * 24 }}
      >
        <div className="flex items-center gap-3 p-3 flex-wrap">
          <button
            {...attributes}
            {...listeners}
            aria-label={`Przeciągnij żeby zmienić kolejność: ${node.label}`}
            className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] cursor-grab active:cursor-grabbing"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--fg)] truncate">
              {node.label}
              {!node.active && (
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                  (ukryta)
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--muted)]">
              slug: <code>{node.slug}</code> · {c.own}{" "}
              {c.own === 1 ? "własny produkt" : "własnych produktów"}
              {c.subtree !== c.own && ` · ${c.subtree} w poddrzewie`}
            </p>
          </div>

          <button
            onClick={onAddChild}
            className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] rounded-full text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            + Podkategoria
          </button>
          <button
            onClick={onToggleExpand}
            className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] rounded-full text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {expanded ? "Zamknij" : "Edytuj"}
          </button>
          <button
            disabled={pendingDelete}
            onClick={async () => {
              const ok = await confirm({
                title: `Usunąć kategorię „${node.label}"?`,
                message: "Tej operacji nie można cofnąć.",
                danger: true,
              });
              if (!ok) return;
              startDeleteTransition(async () => {
                await onDelete();
              });
            }}
            className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            Usuń
          </button>
        </div>

        {expanded && (
          <div className="border-t border-[var(--border)] p-4">
            <CategoryForm
              mode="update"
              initial={node}
              parentId={node.parent_id}
              allParents={allParents}
              allCategories={allCategories}
              onCancel={onToggleExpand}
              onSubmit={onEdit}
            />
          </div>
        )}
      </div>

      {children && <div className="mt-2 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function CategoryForm({
  mode,
  initial,
  parentId,
  allParents,
  allCategories,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "update";
  initial?: CategoryNode;
  parentId: string | null;
  allParents: { id: string; label: string; depth: number }[];
  allCategories: CategoryNode[];
  onCancel: () => void;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [pending, startFormTransition] = useTransition();

  // Cross-sell przenoszony 1:1 z dzisiejszego formularza (ukryty checkbox
  // w stylizowanym <label>). NIE zmieniaj tu mechaniki — patrz ostrzeżenie
  // pod tym blokiem kodu.
  const [crossSell, setCrossSell] = useState<string[]>(
    initial?.crossSellCategories ?? []
  );

  // Kandydaci: całe drzewo oprócz edytowanego węzła, alfabetycznie.
  const candidates = allCategories
    .filter((c) => c.id !== initial?.id)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));

  function toggleCrossSell(slug: string) {
    setCrossSell((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  return (
    <form
      onSubmit={(e) => {
        // preventDefault + onSubmit, NIE <form action={fn}>: React 19 po akcji
        // formularza robi form.reset(), który cofa niekontrolowane <select>
        // do wartości z mountu (regresja opisana w e2e/product-category-save).
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startFormTransition(async () => {
          await onSubmit(fd);
        });
      }}
      className="flex flex-col gap-4"
    >
      {mode === "update" && <input type="hidden" name="id" defaultValue={initial?.id} />}

      <Field label="Nazwa wyświetlana" required>
        <input name="label" defaultValue={initial?.label ?? ""} required className={inputCls} />
      </Field>

      <Field label="Nazwa po niemiecku (DE)" hint="Puste = pokaże się polska">
        <input name="label_de" defaultValue={initial?.label_de ?? ""} className={inputCls} />
      </Field>

      {/* hint w nawiasach klamrowych, NIE w cudzysłowie: tekst sam zawiera
          cudzysłowy i zamknąłby atrybut. */}
      <Field
        label="Rodzic"
        hint={
          "„Najwyższy poziom” = zakładka w górnym menu. Lista nie zawiera tej kategorii ani jej podkategorii."
        }
      >
        <select name="parent_id" defaultValue={parentId ?? ""} className={inputCls}>
          <option value="">— najwyższy poziom —</option>
          {allParents.map((p) => (
            <option key={p.id} value={p.id}>
              {" ".repeat(p.depth * 4)}
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {mode === "create" && (
        <Field label="Slug (link)" hint="Zostaw puste — wygeneruje się z nazwy">
          <input name="slug" className={inputCls} />
        </Field>
      )}

      <Field label="Kolejność" hint="Mniejsze na początku. Zwykle wygodniej przeciągnąć.">
        <input
          name="sort_order"
          type="number"
          defaultValue={initial?.sort_order ?? 0}
          className={inputCls}
        />
      </Field>

      {mode === "update" && (
        <label className="flex items-start gap-3 text-sm text-[var(--fg)]">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={initial?.active ?? true}
            className="mt-1"
          />
          <span>
            Pokazuj w sklepie
            <span className="block text-xs text-[var(--muted)]">
              ⚠️ Odznaczenie chowa z menu, filtrów i mapy strony CAŁE poddrzewo tej
              kategorii — razem ze wszystkimi podkategoriami. Produkty zostają
              dostępne w sklepie i w wyszukiwarce.
            </span>
          </span>
        </label>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Polecaj klientom z tych kategorii (cross-sell)
          </span>
          <p className="text-xs text-[var(--muted)] leading-snug">
            Klient kupuje produkt z tej kategorii → w koszyku i na karcie produktu
            pokażemy mu produkty z zaznaczonych kategorii poniżej.
          </p>
          {/* Hidden input gwarantujący, że FormData zna ten klucz nawet gdy lista
              jest pusta (server zinterpretuje getAll() = []) */}
          {crossSell.length === 0 && (
            <input type="hidden" name="cross_sell_categories" value="" />
          )}
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => {
              const active = crossSell.includes(c.slug);
              return (
                <label
                  key={c.slug}
                  className={`px-3 py-1.5 text-xs font-sans rounded-full border cursor-pointer transition-colors ${
                    active
                      ? "bg-[var(--color-gold)] text-[var(--color-navy)] border-[var(--color-gold)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="cross_sell_categories"
                    value={c.slug}
                    checked={active}
                    onChange={() => toggleCrossSell(c.slug)}
                    className="hidden"
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {mode === "create" ? "Dodaj kategorię" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
```

⚠️ **Cross-sell przenieś DOKŁADNIE tak, jak stoi wyżej** — ukryty checkbox w stylizowanym `<label>`, bez zamiany na przyciski i bez ukrytych inputów w kolejności stanu. Kolejność zapisanych slugów wynika z kolejności DOM (kandydaci alfabetycznie), a nie z kolejności klikania, więc każda „poprawka" tej mechaniki przestawia klientom listę polecanych materacy. Instrukcja w `docs/jak-dodac-kategorie.md` obiecuje kolejność klikania i **to jest rozjazd, który istnieje już dziś** — wpisz go do follow-upów (Task 9 Step 6), nie naprawiaj po drodze.

⚠️ `useConfirm()` przyjmuje `{ message, title?, confirmLabel?, cancelLabel?, danger? }` (`app/_context/ConfirmContext.tsx:13-19`) — pole nazywa się `message`, nie `body`.

- [ ] **Step 2: Bramki**

Run: `npx tsc --noEmit`
Expected: zostały tylko błędy w `app/admin/produkty/*` (Task 8).

Run: `npm test && npm run lint`

- [ ] **Step 3: Commit**

```bash
git add app/admin/kategorie/KategorieEditor.tsx
git commit -m "feat(admin/kategorie): lista-drzewo z przeciaganiem wsrod rodzenstwa i polem Rodzic"
```

---

### Task 8: Wybór kategorii w produkcie + guardy e2e

**Files:**
- Modify: `app/admin/produkty/nowy/page.tsx`
- Modify: `app/admin/produkty/nowy/NewProductForm.tsx:22,81-92`
- Modify: `app/admin/produkty/[id]/page.tsx` (przekazanie projekcji)
- Modify: `app/admin/produkty/[id]/ProductEditor.tsx:329-337`
- Create: `e2e/category-menu.spec.ts`

**Interfaces:**
- Consumes: `flattenForSelect`, `SelectGroup` (Task 2); `getAllCategories` (Task 3).
- Produces: nic dla dalszych tasków.

- [ ] **Step 1: Przepisz stronę „nowy produkt"**

Zamień CAŁĄ zawartość `app/admin/produkty/nowy/page.tsx` na:

```tsx
import { requireAdmin } from "@/app/_lib/admin";
import { getCategories } from "@/app/_lib/categories";
import { flattenForSelect } from "@/app/_lib/category-tree";
import NewProductForm from "./NewProductForm";

export const metadata = { title: "Nowy produkt — Admin" };

export default async function NewProductPage() {
  await requireAdmin();
  // Tylko WIDOCZNE gałęzie (getCategories filtruje efektywną widoczność),
  // pogrupowane po korzeniu do <optgroup>. HTML nie zna zagnieżdżonych
  // optgroup, więc głębsze poziomy dostają wcięcie w etykiecie opcji.
  const categories = await getCategories();
  return <NewProductForm groups={flattenForSelect(categories)} />;
}
```

- [ ] **Step 2: Przepisz select w `NewProductForm.tsx`**

Prop i pusty stan (linia 22) oraz select (linie 81-92):

```tsx
import type { SelectGroup } from "@/app/_lib/category-tree";
```

```tsx
  if (groups.length === 0) {
```

```tsx
            <select name="category" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                — wybierz kategorię —
              </option>
              {groups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {" ".repeat(o.depth * 4)}
                      {o.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
```

Typ propsów komponentu (zamiast `sections`):

```tsx
export default function NewProductForm({ groups }: { groups: SelectGroup[] }) {
```

⚠️ Podmień też wszystkie pozostałe użycia `sections` w tym pliku — pusty stan (linia 22) i sam select to jedyne, które widziałem, ale sprawdź `tsc`, a nie wzrok.

- [ ] **Step 3: Przepisz select w edytorze produktu**

W `app/admin/produkty/[id]/ProductEditor.tsx` dopisz prop do typu propsów komponentu (obok istniejącego `categories`):

```tsx
  categoryGroups: SelectGroup[];
```

z importem `import type { SelectGroup } from "@/app/_lib/category-tree";`, a potem zamień sam select (linie 329-337):

```tsx
          <Field label="Kategoria" required>
            <select name="category" defaultValue={product.category} required className={inputClass}>
              {categoryGroups.map((g) => (
                <optgroup key={g.label} label={g.label}>
                  {g.options.map((o) => (
                    <option key={o.slug} value={o.slug}>
                      {" ".repeat(o.depth * 4)}
                      {o.label} ({o.slug})
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
```

W `app/admin/produkty/[id]/page.tsx` (linia 87-89) dopisz prop obok istniejącego `categories`:

```tsx
      <ProductEditor
      product={product}
      categories={categories}
      categoryGroups={flattenForSelect(categories)}
```

Import: `import { flattenForSelect } from "@/app/_lib/category-tree";`

⚠️ **Nie zmieniaj tu `getAllCategories()` na `getCategories()`** (linia 38). Edytor produktu MUSI widzieć też ukryte gałęzie: produkt siedzący w ukrytej kategorii miałby `defaultValue`, którego nie ma na liście, przeglądarka pokazałaby pierwszą opcję, a „Zapisz" po cichu przeniósłby produkt do innej kategorii. Dlatego `flattenForSelect` nie filtruje widoczności — decyduje wołający, a tu wołającym jest edytor. Nie usuwaj też propa `categories`: karmi komunikat o dobieraniu rozmiaru (linie 59-67).

- [ ] **Step 4: Napisz guard e2e nawigacji**

Utwórz `e2e/category-menu.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

// Guard megamenu kategorii (migracja 68 — drzewo bez limitu głębokości).
//
// Test jest odporny na to, JAK Ola ułoży drzewo: nie zna nazw kategorii ani
// liczby poziomów. Pilnuje trzech rzeczy, które muszą być prawdziwe zawsze:
// 1. pasek pokazuje co najmniej jedną pozycję kategorii,
// 2. wszystkie linki kategorii w nagłówku prowadzą przez ?kategoria=,
//    a nie przez legacy ?sekcja= (te zostają obsłużone, ale nie generowane),
// 3. panel rozwijany ma skrót „wszystkie" do listingu całego poddrzewa.
test.describe("megamenu kategorii", () => {
  test("pasek linkuje przez ?kategoria= i ma skrót do całego poddrzewa", async ({
    page,
  }) => {
    await page.goto("/");

    const header = page.locator("header");
    const categoryLinks = header.locator('a[href*="/sklep?kategoria="]');
    await expect(categoryLinks.first()).toHaveCount(1, { timeout: 15_000 });

    // Żadna pozycja paska nie generuje już legacy ?sekcja=.
    await expect(header.locator('a[href*="/sklep?sekcja="]')).toHaveCount(0);

    // Pierwsza pozycja paska: hover otwiera panel ze skrótem „wszystkie …".
    const firstTrigger = categoryLinks.first();
    const rootHref = await firstTrigger.getAttribute("href");
    expect(rootHref).toBeTruthy();
    await firstTrigger.hover();

    // Skrót w panelu prowadzi do tego samego listingu co nagłówek pozycji.
    await expect(
      header.locator(`a[href="${rootHref}"]`).nth(1)
    ).toBeVisible({ timeout: 5_000 });
  });

  test("listing kategorii z paska odpowiada i pokazuje nagłówek", async ({ page }) => {
    await page.goto("/");
    const first = page.locator('header a[href*="/sklep?kategoria="]').first();
    const href = await first.getAttribute("href");
    await page.goto(href!);
    await expect(page.locator("h1")).toBeVisible();
    // Legacy alias musi dawać tę samą stronę co nowy parametr.
    const slug = new URL(href!, "http://x").searchParams.get("kategoria")!;
    const viaKategoria = await page.locator("h1").textContent();
    await page.goto(`/sklep?sekcja=${slug}`);
    await expect(page.locator("h1")).toHaveText(viaKategoria!.trim());
  });
});
```

- [ ] **Step 5: Bramki**

Run: `npx tsc --noEmit`
Expected: **0 błędów** — to pierwszy moment, w którym cała gałąź kompiluje się od nowa.

Run: `npm test && npm run lint && npm run build`
Expected: wszystko zielone.

- [ ] **Step 6: Commit**

```bash
git add app/admin/produkty/ e2e/category-menu.spec.ts
git commit -m "feat(admin/produkty): wybor kategorii z drzewa + guard e2e megamenu"
```

---

### Task 9: Weryfikacja na żywo, dokumentacja i domknięcie

**Files:**
- Modify: `docs/jak-dodac-kategorie.md` (cały plik)
- Modify: `docs/superpowers/plans/2026-08-04-podkategorie-drzewo.md` (sekcja stanu wykonania)

**Interfaces:**
- Consumes: wszystko z Tasków 1-8.
- Produces: nic.

- [ ] **Step 1: Upewnij się, że migracja jest na produkcji**

Jeśli Task 1 Step 8 został pominięty (brak zgody), wróć do niego teraz — bez migracji nic z tej gałęzi nie zadziała na żywo. Powtórz cztery zapytania weryfikacyjne z tamtego kroku i pokaż właścicielowi wyniki.

- [ ] **Step 2: Przejdź sklep ręcznie na localhoście**

⚠️ `npm run dev` przy równolegle odpalonym `npm run build` psuje `.next` — jeśli serwer serwuje stary render, ubij proces na porcie 3000, usuń `.next` i wystartuj od nowa.

Sprawdź i zapisz wynik każdego punktu:

1. `/` — pasek pokazuje te same pozycje co przed zmianą, każda z rozwijaną listą, linki mają `?kategoria=`.
2. `/sklep?kategoria=<korzeń>` — pokazuje produkty z całego poddrzewa (więcej niż `?kategoria=<dziecko>`).
3. `/sklep?sekcja=salon` — ta sama strona co `?kategoria=salon` (legacy alias żyje).
4. `/sklep?kategoria=materace-kieszeniowe` — działa; `?kategoria=materace` pokazuje szerszy listing.
5. Stopka — kolumny to korzenie, w nich dzieci.
6. Mobile (DevTools, szerokość 390 px) — akordeon rozwija trzy poziomy.
7. `/produkt/<id>` łóżka — sekcja polecanych materacy nadal pokazuje materace (cross-sell po przemianowaniu slugu).

- [ ] **Step 3: Przejdź panel ręcznie**

1. `/admin/kategorie` — drzewo z wcięciami, liczniki „własne / w poddrzewie".
2. Przeciągnij pozycję w obrębie jednego rodzica — kolejność zapisuje się (odśwież stronę).
3. Utwórz kategorię testową na najwyższym poziomie, potem przenieś ją pod inną przez „Rodzic".
4. Spróbuj ustawić jej rodzica na nią samą — opcji nie ma na liście; spróbuj przez DevTools (podmiana `value` w `<select>`) i potwierdź komunikat po polsku, nie błąd Postgresa.
5. Spróbuj usunąć kategorię z dziećmi — komunikat mówi, ile podkategorii przenieść.
6. **Usuń kategorię testową** (produkcyjna baza — nie zostawiaj śladów).

- [ ] **Step 4: Odpal e2e**

Run: `E2E_BASE_URL=http://localhost:3000 npm run test:e2e -- category-menu product-category-save`
Expected: oba pliki zielone. Bez `E2E_BASE_URL` testy poszłyby w produkcję.

⚠️ **Przeciąganie w panelu NIE dostaje testu e2e** — testy panelu wymagają zapisanej sesji admina, a ta wygasła 2026-07-29 i `.env.e2e` nie ma danych logowania. Spec przewidywał ten test; zamiast go udawać, zostaje ręczna próba ze Step 3 i wpis w follow-upach (Step 6). Jeśli właściciel odnowi sesję admina, dopisanie testu wzorem `e2e/samples.spec.ts` to kilkanaście linijek.

- [ ] **Step 5: Przepisz instrukcję dla Oli**

Zamień `docs/jak-dodac-kategorie.md` na wersję opisującą drzewo. Musi zawierać, własnymi słowami, bez żargonu:

- że kategorie tworzą drzewo, a pozycje najwyższego poziomu to zakładki w górnym menu;
- że przeciąganie zmienia kolejność **tylko w obrębie jednego rodzica**, a przenoszenie gdzie indziej robi pole „Rodzic";
- że w menu widać trzy poziomy, a głębsze klient znajdzie na stronie kategorii nad produktami;
- że produkt można przypiąć do dowolnego poziomu, a listing kategorii pokazuje też produkty z jej podkategorii;
- że „Pokazuj w sklepie" na pozycji menu chowa CAŁE poddrzewo;
- że nie da się usunąć kategorii, która ma produkty albo podkategorie;
- **jak zbudować „MEBLE"**: dodaj pozycję „Meble" na najwyższym poziomie, potem w każdej dzisiejszej pozycji (Narożniki, Sofy, Fotele, Materace, Pufy, Łóżka) ustaw „Rodzic" na „Meble", i na końcu ustaw kolejność przeciąganiem. Napisz wprost, że po pierwszym kroku menu ma chwilowo dwie zakładki i to normalne.

Sekcję o cross-sellu materacy zachowaj — dalej jest aktualna.

- [ ] **Step 6: Dopisz sekcję stanu wykonania do tego planu**

Na początku tego pliku, pod nagłówkiem, dopisz sekcję „## ✅ STAN WYKONANIA" z: bramkami (liczby z `tsc`/`npm test`/`build`/`lint`), tym, czego **nie** sprawdzono na żywo, rozstrzygnięciami ponad planem i follow-upami w kolejności wagi.

Trzy follow-upy są znane już teraz i muszą tam trafić:

1. **Migracja 69** — usunięcie `categories.group_id` i tabeli `category_groups` (model expand-first, sprzątanie po odczekaniu na produkcji).
2. **Cross-sell zapisuje kolejność alfabetyczną, a instrukcja obiecuje kolejność klikania** — rozjazd istniał przed tą gałęzią (checkboxy oddają kolejność DOM), więc albo poprawić UI na kolejność klikania, albo poprawić `docs/jak-dodac-kategorie.md`. Dziś ustawiona w bazie kolejność (kieszeniowe → piankowe → nawierzchniowe) przestawi się na alfabetyczną przy pierwszym zapisie kategorii łóżka.
3. **Brak testu e2e przeciągania w panelu** — czeka na odnowioną sesję admina w `.env.e2e`.

**Why:** katalog `.superpowers/sdd/` jest gitignorowany, więc ledger nie przetrwa zmiany komputera — sekcja w planie w repo jest jedynym nośnikiem. Tak samo zrobiły plany zwijania kolekcji i próbek tkanin.

- [ ] **Step 7: Bramki końcowe i commit**

Run: `npx tsc --noEmit && npm test && npm run lint && npm run build`

```bash
git add docs/
git commit -m "docs(kategorie): instrukcja drzewa dla panelu i stan wykonania"
```

- [ ] **Step 8: Poproś o recenzję gałęzi**

Użyj skilla `superpowers:requesting-code-review` na całej gałęzi względem `main`. Recenzja ma dostać spec (`docs/superpowers/specs/2026-08-04-podkategorie-drzewo-design.md`) jako kryterium. Dopiero po niej `superpowers:finishing-a-development-branch`.

---

## Czego ten plan świadomie NIE robi

- **Migracja 69 (drop `category_groups` i `group_id`)** — model expand-first, sprzątanie dopiero gdy nowa wersja posiedzi na produkcji. Osobne zadanie, nie ta gałąź.
- **Nie tworzy „MEBLI"** — układ buduje Ola w panelu (Task 9 Step 5 mówi jej dokładnie jak).
- **Nie zmienia adresów na `/kategoria/<slug>`** — zostaje `?kategoria=`, jak dziś.
- **Nie przegląda wartości tłumaczeń DE** — mapa dostaje strukturę i traci martwe klucze, ale przegląd treści jest zadaniem na odmrożenie `/de`.
- **Nie dodaje obrazków w megamenu ani przenoszenia produktów hurtem** — poza zakresem specu.
- **Nie dodaje testu e2e przeciągania w panelu** — wymaga sesji admina, która wygasła 2026-07-29 (`.env.e2e` bez danych logowania). Spec go przewidywał; zostaje ręczna próba w Tasku 9 i follow-up.
