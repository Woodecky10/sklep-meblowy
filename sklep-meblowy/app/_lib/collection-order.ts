// Kiedy produkty kolekcji mają iść w kolejności ustawionej przez admina
// (products.collection_sort_order, migracja 75), a kiedy w tej, o którą
// poprosił klient.
//
// Reguła: ręczna kolejność jest DOMYŚLNA dla widoku kolekcji i ustępuje
// dopiero wtedy, gdy klient sam poprosi o inne uporządkowanie — czyli wybierze
// sortowanie albo wpisze frazę. Zawężenie kategorią czy ceną prośbą o inne
// uporządkowanie NIE jest: to nadal ta sama kolekcja, tylko krótsza.
//
// Czysty moduł, bez I/O — testowalny bez bazy i bez przeglądarki.

// Parametry, które SĄ prośbą klienta o inne uporządkowanie.
const ORDERING_PARAMS = ["sortuj", "q"] as const;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function usesCollectionOrder(
  searchParams: Record<string, string | string[] | undefined>
): boolean {
  if (!first(searchParams.kolekcja)?.trim()) return false;
  // Pusta wartość zostaje po wyczyszczeniu formularza filtrów i nie jest
  // prośbą o nic.
  return !ORDERING_PARAMS.some((k) => first(searchParams[k])?.trim());
}

// ── Kolejność produktów W OBRĘBIE jednej kolekcji ─────────────────────────
// Wydzielone z CollectionsEditor po usterce z 2026-08-28: panel pobierał
// produkty bez kolumny `collection_sort_order`, więc odejmowanie dawało NaN.
// NaN jest FAŁSZYWY, więc `NaN || nazwa.localeCompare(...)` wykonywało gałąź
// zapasową — panel pokazywał alfabet zamiast ułożonej kolejności, a zapis
// utrwalał ten alfabet w bazie i kasował pracę właścicielki. Rzutowanie
// `as Product[]` ukryło brak kolumny przed TypeScriptem.
//
// Komparator sam się nie obroni — dostaje już wyciągnięte wartości. Dlatego
// obok stoi `maKolumneKolejnosci`, którym zapytanie sprawdza się ZANIM
// cokolwiek zostanie posortowane.
export function byCollectionSortOrder(
  a: { collection_sort_order: number; name: string },
  b: { collection_sort_order: number; name: string }
): number {
  return (
    a.collection_sort_order - b.collection_sort_order ||
    a.name.localeCompare(b.name, "pl")
  );
}

// Czy wynik zapytania faktycznie niesie kolumnę kolejności. Pusta lista
// przechodzi — nie ma czego sortować. `null` traktujemy jak brak, bo kolumna
// jest NOT NULL: null może znaczyć wyłącznie, że zapytanie jej nie pobrało.
export function maKolumneKolejnosci(
  rows: { collection_sort_order?: number | null }[]
): boolean {
  return rows.every((r) => typeof r.collection_sort_order === "number");
}
