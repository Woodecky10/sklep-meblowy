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
