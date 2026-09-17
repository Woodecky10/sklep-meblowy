// Ręczne mapy tłumaczeń DE dla treści z DB, która NIE ma własnych kolumn `_de`
// (kategorie/grupy, wolnotekstowe pola produktu, cechy produktu, warianty). DeepL
// został usunięty (tłumaczenia ręczne), a te wartości pochodzą z panelu admina
// i są skończonym, znanym zbiorem dla bieżącego katalogu.
//
// Wzorzec użycia: `MAPA[wartośćPL] ?? wartośćPL` — nieznane wartości (kody tkanin
// typu "MANILA 01", wymiary "180x200", nazwy własne) przechodzą bez zmian.
// Gdy admin uzupełni właściwe kolumny `_de` (np. categories.label_de), one mają
// pierwszeństwo — te mapy są fallbackiem dla locale=de.

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

// ── Wolnotekstowe pola produktu (klucz = dokładny string PL z DB) ──
export const CONSTRUCTION_DE: Record<string, string> = {
  "Lite drewno dębowe, niska bryła, bez zagłówka":
    "Massives Eichenholz, niedrige Form, ohne Kopfteil",
  "Rama drewniana, tkanina z domieszką poliestru, sprężyny falowe":
    "Holzrahmen, Stoff mit Polyesteranteil, Wellenfedern",
  "Rama z litego dębu, sprężyny bonell, wypełnienie pianką HR i puchem":
    "Rahmen aus massiver Eiche, Bonell-Federn, Füllung aus HR-Schaum und Daunen",
  "Stelaż drewniany, sprężyny bonell, wypełnienie pianka HR, obicie welurowe":
    "Holzgestell, Bonell-Federn, HR-Schaum-Füllung, Velours-Bezug",
  "Tapicerka z kaszmiru, rama z giętej sklejki, podstawa obrotowa":
    "Kaschmir-Polsterung, Rahmen aus gebogenem Sperrholz, drehbarer Sockel",
};

export const DELIVERY_TIME_DE: Record<string, string> = {
  "14 dni roboczych": "14 Werktage",
  "21 dni": "21 Tage",
  "21 dni roboczych": "21 Werktage",
  "28 dni": "28 Tage",
  "28 dni roboczych": "28 Werktage",
};

export const WARRANTY_DE: Record<string, string> = {
  "10 lat": "10 Jahre",
  "2 lat": "2 Jahre",
  "2 lata": "2 Jahre",
  "3 lata": "3 Jahre",
  "5 lat": "5 Jahre",
};

// ── Cechy produktu: klucze i (tłumaczalne) wartości ──
export const FEATURE_KEY_DE: Record<string, string> = {
  "Funkcja rozkładania": "Ausklappfunktion",
  "Głębokość mebla": "Möbeltiefe",
  "Głębokość osadzenia materaca": "Einlegetiefe der Matratze",
  "Głębokość siedziska": "Sitztiefe",
  "Grubość boczka": "Armlehnenstärke",
  "Grubość boku": "Seitenstärke",
  Kolekcja: "Kollektion",
  Kolor: "Farbe",
  "Kolor obicia": "Bezugsfarbe",
  "Materac wbudowany": "Integrierte Matratze",
  Model: "Modell",
  "Pojemnik na pościel": "Bettkasten",
  "Powierzchnia spania": "Liegefläche",
  Powłoka: "Bezug",
  // Ten sam klucz w dwóch pisowniach z panelu — obie muszą być w mapie.
  "Rodzaj Łóżka": "Bettart",
  "Rodzaj łóżka": "Bettart",
  "Ruchome zagłówki": "Verstellbare Kopfstützen",
  Styl: "Stil",
  "System Boxspring": "Boxspring-System",
  "Szerokość boczka": "Armlehnenbreite",
  "Szerokość dwójki": "Breite des Zweisitzer-Elements",
  "Szerokość mebla": "Möbelbreite",
  "Szerokość otomany": "Breite der Ottomane",
  "Szerokość siedziska": "Sitzbreite",
  Tkanina: "Stoff",
  "Tył mebla tapicerowany": "Gepolsterte Rückseite",
  Typ: "Typ", // DE identyczne jak PL — wpis celowy, żeby test pokrycia je obejmował
  "Waga produktu z opakowaniem jednostkowym": "Produktgewicht mit Einzelverpackung",
  "Wysokość boczka": "Armlehnenhöhe",
  "Wysokość boku": "Seitenhöhe",
  "Wysokość klapy": "Klappenhöhe",
  "Wysokość materaca": "Matratzenhöhe",
  "Wysokość mebla": "Möbelhöhe",
  "Wysokość nóżek": "Fußhöhe",
  "Wysokość poduszki": "Kissenhöhe",
  "Wysokość siedziska": "Sitzhöhe",
  "Wysokość siedziska od ziemi": "Sitzhöhe ab Boden",
  "Wysokość skrzyni": "Kastenhöhe",
  "Wysokość zagłowia": "Kopfteilhöhe",
  "Zagłówki regulowane": "Verstellbare Kopfstützen",
};

// Tylko tłumaczalne wartości tekstowe — liczby, wymiary (180x200) i kody spoza
// katalogu (np. Tiliao) celowo NIE są tu i przechodzą bez zmian. Nazwy własne
// modeli z bieżącego katalogu (Marbella, SISI, Vegas) mają wpisy o identycznym
// DE — nie zmieniają wyniku, ale test pokrycia potwierdza, że były sprawdzone.
export const FEATURE_VALUE_DE: Record<string, string> = {
  tapicerowane: "gepolstert",
  Sztruks: "Cord",
  Podwójne: "Doppel",
  Kontynentalne: "Kontinental",
  Tak: "Ja",
  Nie: "Nein",
  Brązowy: "Braun",
  Pojedyncze: "Einzel",
  Rozkładany: "Ausklappbar",
  Marbella: "Marbella",
  SISI: "SISI",
  Vegas: "Vegas",
};

// ── Warianty: nazwy opcji + tłumaczalne etykiety wartości (kolory/strony) ──
export const VARIANT_OPTION_DE: Record<string, string> = {
  Kolor: "Farbe",
  "Kolor nóg": "Fußfarbe",
  "Kolor nóżek": "Fußfarbe",
  Pianka: "Schaumstoff",
  PIANKA: "SCHAUMSTOFF",
  "POWIERZCHNIA SPANIA": "LIEGEFLÄCHE",
  ROZMIAR: "GRÖSSE",
  // Obie pisownie występują w panelu; tłumaczenia celowo różne (stary wpis
  // GESTELL zostaje, nowy „Stelaż" = stelaż łóżka → Lattenrost).
  STELAŻ: "GESTELL",
  Stelaż: "Lattenrost",
  STRONA: "SEITE",
  "STRONA MEBLA": "SEITE DES MÖBELS",
  Strona: "Seite",
  Tkanina: "Stoff",
  TKANINA: "STOFF",
  Topper: "Topper", // DE identyczne jak PL — wpis celowy (patrz test pokrycia)
  Wariant: "Variante",
};

// Kody tkanin (MANILA/MONOLITH/POSO/QUELLE/TILIA/WOOLLY/CHILL ME …), ich
// zestawienia („Monolith 15 + Solar 01") i wymiary przechodzą bez zmian — tu
// tylko kolory/strony/materiały po polsku.
export const VARIANT_VALUE_DE: Record<string, string> = {
  "Bez toppera": "Ohne Topper",
  Beżowy: "Beige",
  beżowy: "beige",
  Buk: "Buche",
  Chromowane: "Verchromt",
  Ciemnoszary: "Dunkelgrau",
  Czarne: "Schwarz",
  Czarny: "Schwarz",
  DREWNIANY: "HOLZ",
  Drewniany: "Holz",
  "Drewniany- bez pojemnika na pościel": "Holz – ohne Bettkasten",
  "Drewniany- brak pojemnika na pościel": "Holz – ohne Bettkasten",
  // „dunkelblau" — spójnie z opisami produktów DE (nie „Marineblau").
  Granatowy: "Dunkelblau",
  Kremowy: "Creme",
  kremowy: "creme",
  LEWOSTRONNY: "LINKS",
  LEWOSTORNNY: "LINKS",
  Lewa: "Links",
  Lewostronny: "Links",
  METALOWY: "METALL",
  Metalowy: "Metall",
  "Metalowy- z pojemnikiem na pościel": "Metall – mit Bettkasten",
  Naturalne: "Natur",
  "Pianka HR": "HR-Schaumstoff",
  // Kwota zostaje w PLN — dopłata jest w złotówkach, nie przeliczamy jej tutaj.
  "Pianka HR (+200zł)": "HR-Schaumstoff (+200 PLN)",
  "Pianka T30": "Schaumstoff T30",
  PRAWOSTRONNY: "RECHTS",
  Prawa: "Rechts",
  Prawostronny: "Rechts",
  // „Srebre" i „Srebry" to literówki z panelu — mapujemy je razem z poprawną formą.
  Srebre: "Silber",
  Srebrny: "Silber",
  Srebry: "Silber",
  Szary: "Grau",
  Terrakota: "Terrakotta",
  "Z topperem": "Mit Topper",
  Złote: "Gold",
  Złoty: "Gold",
  biały: "weiß",
  brązowy: "braun",
  jasnobrązowy: "hellbraun",
  jasnoszary: "hellgrau",
};

// ── Strona główna: slajdy hero (home_slides) + kafelki (home_tiles) ──
// Treść wpisywana w panelu admina (PL), bez kolumn _de. Klucz = dokładny string PL.
// Słowa wyróżnione (highlighted_word) muszą być podłańcuchem przetłumaczonego
// tytułu (dopasowanie case-insensitive w renderTitleWithHighlight).
export const HOME_TEXT_DE: Record<string, string> = {
  // slajdy
  "Elegancja sama w sobie": "Eleganz pur",
  "Meble, które opowiadają historię..": "Möbel, die eine Geschichte erzählen..",
  "Meble, które opowiadają historię": "Möbel, die eine Geschichte erzählen",
  Opowiadają: "erzählen",
  opowiadają: "erzählen",
  "SPRAWDŹ NAJNOWSZE MODELE": "ENTDECKEN SIE DIE NEUESTEN MODELLE",
  SPRAWDŹ: "ENTDECKEN",
  "SPRAWDŹ SAM!": "ÜBERZEUGEN SIE SICH!",
  "Coś więcej niż meble..": "Mehr als nur Möbel..",
  Elagancja: "Eleganz",
  Elegancka: "Elegant",
  "KOLEKCJA LATO 2026": "SOMMERKOLLEKTION 2026",
  "Narożniki, które zrobią WOW Twoim salonie":
    "Ecksofas, die für das WOW in Ihrem Wohnzimmer sorgen",
  wow: "WOW",
  NOWOŚCI: "NEUHEITEN",
  "NOWOCZESNE NAROŻNIKI": "MODERNE ECKSOFAS",
  "Odkryj kolekcje mebli Premium": "Entdecken Sie unsere Premium-Möbelkollektion",
  "STWÓRZ PRZESTRZEŃ PO SWOJEMU": "GESTALTEN SIE IHREN RAUM NACH IHREN WÜNSCHEN",
  PRZESTRZEŃ: "RAUM",
  "SZEROKI WYBÓR TKANIN I DARMOWE PRÓBKI": "GROSSE STOFFAUSWAHL UND KOSTENLOSE MUSTER",
  "Odkryj kolekcję mebli premium, stworzonych z myślą o ludziach, którzy cenią piękno, trwałość i niepowtarzalny styl.":
    "Entdecken Sie eine Kollektion von Premium-Möbeln, geschaffen für Menschen, die Schönheit, Langlebigkeit und einen einzigartigen Stil schätzen.",
  "Przeglądaj kolekcję": "Kollektion durchsuchen",
  // kafelki
  "Łóżka tapicerowane": "Polsterbetten",
  "Sypialnia marzeń, sen doskonały": "Traumschlafzimmer, perfekter Schlaf",
  "Sofa 3-osobowa": "3-Sitzer-Sofa",
  "Sofy 3-osobowe": "3-Sitzer-Sofas",
  "Styl i wszechstronność w jednym": "Stil und Vielseitigkeit in einem",
  "Narożnik w kszałcie U": "U-förmiges Ecksofa",
  "Narożniki w kształcie L": "L-förmige Ecksofas",
  "Twój kąt relaksu i inspiracji": "Ihre Ecke für Entspannung und Inspiration",
  "Komfort i elegancja w każdym salonie": "Komfort und Eleganz in jedem Wohnzimmer",
  Fotele: "Sessel",
  Pufy: "Sitzpuffs",
};

// ── Plakietki produktu (featured_products.badge, wybierane w /admin/polecane) ──
// Zamknięty zbiór: panel daje dropdown z tych wartości (PL kanoniczne, na karcie
// i tak uppercase przez CSS), a BADGE_DE tłumaczy każdą na DE → brak wycieku.
export const BADGE_OPTIONS = [
  "Bestseller",
  "Nowość",
  "Promocja",
  "Hit",
  "Polecane",
  "Wyprzedaż",
] as const;

// Nieznane (legacy) wartości przechodzą bez zmian (fallback w featured.ts).
export const BADGE_DE: Record<string, string> = {
  Nowość: "Neu",
  NOWOŚĆ: "NEU",
  Promocja: "Aktion",
  PROMOCJA: "AKTION",
  Hit: "Hit",
  Bestseller: "Bestseller",
  Polecane: "Empfohlen",
  POLECANE: "EMPFOHLEN",
  Wyprzedaż: "Sale",
  WYPRZEDAŻ: "SALE",
};

// ── Komunikaty błędów kodu rabatowego (promo.ts) ──
export const PROMO_ERROR_DE: Record<string, string> = {
  "Wpisz kod rabatowy": "Bitte geben Sie einen Rabattcode ein",
  "Koszyk jest pusty": "Ihr Warenkorb ist leer",
  "Błąd weryfikacji kodu": "Fehler bei der Code-Überprüfung",
  "Nieprawidłowy kod rabatowy": "Ungültiger Rabattcode",
  "Kod jest nieaktywny": "Der Code ist inaktiv",
  "Kod jeszcze nie obowiązuje": "Der Code ist noch nicht gültig",
  "Kod wygasł": "Der Code ist abgelaufen",
  "Limit użyć tego kodu został wyczerpany": "Das Nutzungslimit dieses Codes ist erreicht",
};

// Pomocnik: zwróć tłumaczenie DE jeśli istnieje, inaczej wartość bez zmian.
// Czytamy WYŁĄCZNIE własne klucze mapy: wartości pochodzą z DB/panelu, więc
// „constructor", „toString" czy „__proto__" to realne wejście, a zwykłe
// `map[value]` trafiłoby w prototyp Object i zwróciło funkcję zamiast stringa.
export function mapDe(
  map: Record<string, string>,
  value: string | null | undefined
): string | null | undefined {
  if (value == null) return value;
  return Object.prototype.hasOwnProperty.call(map, value) ? map[value] : value;
}
