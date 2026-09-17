# Glosariusz i zasady tłumaczenia PL → DE (sklep Mollien)

Ten plik czyta każdy agent tłumaczący partię (`work/batches/*.json`). Wynik partii to
plik `work/out/<group>-NN.json` w formacie `{ "<key>": "<tekst DE>" }` — jeden wpis na
każdą jednostkę z partii, klucze bez zmian.

## Styl

- Odbiorca: klient sklepu meblowego w Niemczech. Forma grzecznościowa **Sie/Ihr**
  (PL „Ty/Twój" → „Sie/Ihr"). Ton: rzeczowy, ciepły, sprzedażowy bez krzyku.
- Tłumaczymy **wiernie**: nie skracaj, nie dodawaj, nie „ulepszaj" treści. Zdanie po
  zdaniu, akapit po akapicie, punkt po punkcie — ta sama liczba elementów listy.
- Literówki i błędy w PL („gwaracja", „onadczasowe", „Informcje dla klienta") — tłumacz
  sens, po niemiecku poprawnie.
- Wielkość liter: gdy PL jest CAŁE WIELKIMI, DE też (ß → SS: „GRÖSSE", „MASSE").
- Cudzysłowy niemieckie „…" zostają jak w PL („…"). Myślnik „–" zostaje „–".

## Czego NIE tłumaczyć (zostaje 1:1)

- Nazwy własne modeli i kolekcji: Fado, Vegas, Luna, Bruno, Tiki, Marbella, Sisi, Mio,
  Nora, Elio, Nube, Luma, Lova, Aurea, Livia, Montes, Alva, Mova, Nuvo, Verto…
- Nazwy i kody tkanin: Poso 02, Manila 01, Monolith 84, Solar 99, Woolly, Tilia,
  Kronos, Quelle, Baloo, Inari, Vena, Trinity, Noel, Leo, Matt Velvet, Magic Velvet,
  Chill Me. Grupy cenowe: Standard, Premium, Premium High.
- Nazwa sklepu **Mollien**, adresy URL, e-maile, numery telefonów.
- Wymiary i liczby: `120x200`, `254 cm`, `±3 cm`, `40x40`, `T30`, `HR`. Nie zmieniaj
  cyfr, jednostek ani ich kolejności. Dopuszczalne tylko dodanie spacji wokół „x"
  (`202cm x 130cm` → `202 cm x 130 cm`).
- **Kwoty w złotówkach zostają w polskiej walucie, zapisanej jako `PLN`** (`+200 zł` →
  `+200 PLN`, `15 zł` → `15 PLN`, `99 zł` → `99 PLN`). Nie „zł" — walidator odrzuca „ł" —
  i nie przeliczaj na EUR (to osobna decyzja biznesowa, nie tłumacza).
- Treści specyficzne dla Polski („darmowa dostawa na terenie całej Polski", „polski
  producent", „wspierasz polskie firmy") tłumacz wiernie — Polen/polnisch. Nie zmieniaj
  na Niemcy.

## HTML

- Tagi HTML zostają **dokładnie te same, w tej samej kolejności**: `<p>`, `<ul>`,
  `<li>`, `<strong>`, `<br>`, `<a …>`, `<span style="…">`, `<h3>`. Tłumaczysz tylko
  tekst między tagami. Atrybutów (`href`, `style`, `target`, `rel`) nie ruszasz.
- Encje i znaki specjalne w JSON: zachowaj `\n` tam, gdzie były w PL.

## Terminologia (obowiązująca — spójność w całym sklepie)

| PL | DE |
|---|---|
| narożnik / rogówka | Ecksofa |
| narożnik w kształcie L / U | L-förmiges / U-förmiges Ecksofa |
| narożnik modułowy | modulares Ecksofa |
| sofa 2-/3-osobowa | 2-Sitzer-/3-Sitzer-Sofa |
| sofa modułowa / meble modułowe | modulares Sofa / Modulmöbel |
| fotel (tapicerowany) | (gepolsterter) Sessel |
| pufa (tapicerowana) | (gepolsterter) Hocker |
| łóżko tapicerowane | Polsterbett |
| łóżko kontynentalne / box / boxspring | Boxspringbett |
| łóżko dziecięce | Kinderbett |
| materac kieszeniowy | Taschenfederkernmatratze |
| materac piankowy | Schaumstoffmatratze |
| materac nawierzchniowy / topper | Topper |
| schodki dla pupila | Haustiertreppe |
| zestaw (mebli) | Set (np. „Set Vegas L") |
| kolekcja | Kollektion |
| meble tapicerowane | Polstermöbel |
| tkanina (obiciowa) | (Bezugs)stoff |
| próbki tkanin | Stoffmuster |
| welur | Velours |
| sztruks (gruby) | (grober) Cord |
| boucle / baranek | Bouclé / Teddy (baranek = Teddy) |
| plecionka | Webstoff |
| funkcja spania | Schlaffunktion |
| pojemnik na pościel | Bettkasten |
| ruchome / regulowane zagłówki | verstellbare Kopfstützen |
| zagłówek (łóżka) | Kopfteil |
| siedzisko / oparcie | Sitzfläche / Rückenlehne |
| boczek / boczki | Armlehne / Armlehnen |
| otomana | Ottomane |
| dwójka (część narożnika) | 2-Sitzer-Element |
| tył mebla tapicerowany | gepolsterte Rückseite |
| nóżki / nogi | Füße |
| stelaż (drewniany / metalowy) | Lattenrost (Holz / Metall) |
| skrzynia (łóżka) | Bettkasten |
| klapa (skrzyni) | Klappe |
| podnośniki gazowe | Gasdruckfedern |
| sprężyny faliste (typu B) | Wellenfedern (Typ B) |
| sprężyny bonell | Bonellfedern |
| pianka T30 | Schaumstoff T30 |
| pianka HR (wysokoelastyczna) | HR-Schaumstoff (hochelastisch) |
| automat typu delfin | Delfin-Ausklappmechanismus |
| stembnówka (ozdobne przeszycie) | Ziernaht |
| pikowanie | Steppung |
| powierzchnia spania | Liegefläche |
| głębokość / szerokość / wysokość siedziska | Sitztiefe / Sitzbreite / Sitzhöhe |
| wymiary | Maße |
| tolerancja wymiarów | Maßtoleranz |
| czas realizacji | Lieferzeit / Bearbeitungszeit |
| dni robocze | Werktage |
| gwarancja | Garantie |
| dostawa pod budynek | Lieferung bis zur Bordsteinkante |
| wniesienie | Vertragen (in die Wohnung) |
| montaż | Montage |
| zwrot / odstąpienie od umowy | Rückgabe / Widerruf |
| reklamacja | Reklamation |
| kod rabatowy | Rabattcode |
| producent | Hersteller |
| polska produkcja | polnische Produktion |
| przyjazna zwierzętom | tierfreundlich |
| łatwa w czyszczeniu | pflegeleicht |
| odporna na ścieranie | abriebfest |
| powłoka hydrofobowa | wasserabweisende Beschichtung |
| trudnopalna / trudnozapalna | schwer entflammbar |
| odporna na mechacenie | pillingresistent |
| odporna na blaknięcie | lichtecht |
| odporna na zaciągnięcia | schlingenfest |
| ograniczone wchłanianie płynów | geringe Flüssigkeitsaufnahme |
| struktura bouclé / pleciona / welwetowa / prążkowana | Bouclé-/Web-/Velours-/Ripp-Struktur |

## Standardowe tytuły sekcji opisu produktu

| PL | DE |
|---|---|
| Opis / Opis produktu | Beschreibung |
| Specyfikacja / Specyfikacja produktu | Produktspezifikation |
| Wymiary | Maße |
| Wymiary i materiały | Maße und Materialien |
| Wymiary mebla | Möbelmaße |
| Więcej informacji | Weitere Informationen |
| Informacje dla klienta | Kundeninformationen |
| Tkanina | Stoff |
| Budowa materaca | Matratzenaufbau |

## Nazwy produktów (`product_name`)

Nazwy PL są długie i SEO-we. Zachowaj model, kod tkaniny i wymiar; przetłumacz
opisowe człony. Wzór: „Narożnik Fado L – nowoczesny narożnik w kształcie L z funkcją
spania" → „Ecksofa Fado L – modernes L-förmiges Ecksofa mit Schlaffunktion";
„Łóżko kontynentalne box Marbella gruby sztruks 180x200 boxspring" → „Boxspringbett
Marbella grober Cord 180x200".

## Wartości opcji wariantów i cech (`map_*`)

Krótkie etykiety, rzeczowniki z wielkiej litery, bez kropki. Zachowaj wielkość liter
PL (jeśli PL WIELKIMI → DE WIELKIMI). Przykłady: „Z topperem" → „Mit Topper",
„Bez toppera" → „Ohne Topper", „Czarny/Czarne" → „Schwarz", „Naturalne" → „Natur",
„Złoty/Złote" → „Gold", „Srebrny" → „Silber", „Buk" → „Buche", „Chromowane" →
„Verchromt", „Drewniany" → „Holz", „Metalowy" → „Metall", „Metalowy- z pojemnikiem na
pościel" → „Metall – mit Bettkasten", „Pianka HR (+200zł)" → „HR-Schaumstoff (+200 PLN)",
„Kolor nóżek" → „Fußfarbe", „Pojedyncze" → „Einzel", „Podwójne" → „Doppel",
„Materac wbudowany" → „Integrierte Matratze", „Wysokość skrzyni" → „Kastenhöhe".

## Slajdy strony głównej (`slide_*`)

`slide_highlight` (wyróżnione słowo) MUSI być dosłownym podłańcuchem przetłumaczonego
`slide_title` tego samego slajdu (bez rozróżniania wielkości liter). Tłumacz najpierw
tytuł, potem wybierz w nim słowo odpowiadające wyróżnieniu.
