// Kiedy produkty kolekcji mają iść w kolejności ustawionej przez admina
// (products.collection_sort_order, migracja 75), a kiedy w tej, o którą
// poprosił klient.
//
// Reguła: ręczna kolejność jest DOMYŚLNA dla widoku kolekcji i ustępuje
// dopiero wtedy, gdy klient sam poprosi o inne uporządkowanie — czyli wybierze
// sortowanie albo wpisze frazę. Zawężenie kategorią czy ceną prośbą o inne
// uporządkowanie NIE jest: to nadal ta sama kolekcja, tylko krótsza.
//
// Czysty moduł, bez I/O. Osobny od shop-view.ts celowo: tamten decyduje
// o KSZTAŁCIE widoku (slider czy siatka), ten o KOLEJNOŚCI w nim. Zlanie ich
// w jedno zmusiłoby do zmiany reguły widoku przy każdej zmianie reguły
// sortowania — a te dwie rzeczy nie muszą iść w parze i już nie idą: lista
// po przycisku ma inny kształt niż slider, ale tę samą kolejność.

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
  // prośbą o nic — patrz ten sam wzorzec w shop-view.ts.
  return !ORDERING_PARAMS.some((k) => first(searchParams[k])?.trim());
}
