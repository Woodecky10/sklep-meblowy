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
  "Głębokość mebla": "Möbeltiefe",
  Kolekcja: "Kollektion",
  Kolor: "Farbe",
  "Kolor obicia": "Bezugsfarbe",
  Model: "Modell",
  "Pojemnik na pościel": "Bettkasten",
  "Powierzchnia spania": "Liegefläche",
  Powłoka: "Bezug",
  "Rodzaj Łóżka": "Bettart",
  Styl: "Stil",
  "System Boxspring": "Boxspring-System",
  "Szerokość mebla": "Möbelbreite",
  Tkanina: "Stoff",
  "Tył mebla tapicerowany": "Gepolsterte Rückseite",
  "Waga produktu z opakowaniem jednostkowym": "Produktgewicht mit Einzelverpackung",
  "Wysokość mebla": "Möbelhöhe",
  "Wysokość nóżek": "Fußhöhe",
  "Wysokość zagłowia": "Kopfteilhöhe",
};

// Tylko tłumaczalne wartości tekstowe — kody (SISI, Marbella, Tiliao), liczby
// i wymiary (180x200) celowo NIE są tu i przechodzą bez zmian.
export const FEATURE_VALUE_DE: Record<string, string> = {
  tapicerowane: "gepolstert",
  Sztruks: "Cord",
  Podwójne: "Doppel",
  Kontynentalne: "Kontinental",
  Tak: "Ja",
  Nie: "Nein",
  Brązowy: "Braun",
};

// ── Warianty: nazwy opcji + tłumaczalne etykiety wartości (kolory/strony) ──
export const VARIANT_OPTION_DE: Record<string, string> = {
  Kolor: "Farbe",
  "POWIERZCHNIA SPANIA": "LIEGEFLÄCHE",
  ROZMIAR: "GRÖSSE",
  STELAŻ: "GESTELL",
  STRONA: "SEITE",
  "STRONA MEBLA": "SEITE DES MÖBELS",
  Strona: "Seite",
  Tkanina: "Stoff",
  TKANINA: "STOFF",
  Wariant: "Variante",
};

// Kody tkanin (MANILA/MONOLITH/POSO/QUELLE/TILIA/WOOLLY/CHILL ME …) i wymiary
// przechodzą bez zmian — tu tylko kolory/strony/materiały po polsku.
export const VARIANT_VALUE_DE: Record<string, string> = {
  Beżowy: "Beige",
  beżowy: "beige",
  Ciemnoszary: "Dunkelgrau",
  DREWNIANY: "HOLZ",
  Granatowy: "Marineblau",
  Kremowy: "Creme",
  kremowy: "creme",
  LEWOSTRONNY: "LINKS",
  LEWOSTORNNY: "LINKS",
  Lewa: "Links",
  Lewostronny: "Links",
  METALOWY: "METALL",
  PRAWOSTRONNY: "RECHTS",
  Prawa: "Rechts",
  Prawostronny: "Rechts",
  Szary: "Grau",
  Terrakota: "Terrakotta",
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
export function mapDe(
  map: Record<string, string>,
  value: string | null | undefined
): string | null | undefined {
  if (value == null) return value;
  return map[value] ?? value;
}
