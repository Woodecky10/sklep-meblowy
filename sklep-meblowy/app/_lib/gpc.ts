// Mapowanie kategorii sklepu na Google Product Category (GPC) — pole
// `g:google_product_category` w feedzie produktowym.
//
// Po co: katalog zgłosił 2026-08-18 ostrzeżenie „Brakuje niektórych wartości
// atrybutu google_product_category, co może ograniczyć widoczność
// w rekomendacjach, wynikach wyszukiwania i na platformach zakupowych" —
// dla WSZYSTKICH 353 ofert. Wcześniej pole było świadomie pomijane (patrz
// nagłówek product-feed.ts), bo Google kategoryzuje automatycznie.
//
// ⚠️ ZASADA Z TAMTEJ DECYZJI ZOSTAJE W MOCY: zgadnięty błędny identyfikator
// szkodzi bardziej niż jego brak. Dlatego identyfikatory niżej są ODCZYTANE
// z oficjalnej taksonomii Google (wersja 2021-09-21, wariant pl-PL:
// https://www.google.com/basepages/producttype/taxonomy-with-ids.pl-PL.txt),
// a nie dobrane z pamięci. Zmieniając cokolwiek tutaj — sprawdź w tym pliku.
//
//   460    Meble > Sofy
//   505764 Meble > Łóżka i akcesoria > Łóżka i ramy łóżek
//   2696   Meble > Łóżka i akcesoria > Materace
//   443    Meble > Krzesła i fotele
//   458    Meble > Otomany
//   6973   Zwierzęta i artykuły dla zwierząt > Artykuły dla zwierząt >
//          Stopnie i rampy dla zwierząt
//
// Czysty moduł, bez I/O — testowalny bez bazy.

// Tyle z kategorii, ile potrzeba do wejścia w górę drzewa. Świadomie węższe
// niż CategoryNode: dzięki temu test nie musi budować pełnych węzłów, a moduł
// nie wiąże się z kształtem tabeli.
export type GpcCategory = {
  id: string;
  slug: string;
  parent_id: string | null;
};

// Mapa jest CELOWO płytka — wpisujemy gałęzie, nie liście. Nowa podkategoria
// pod „Sofy" odziedziczy 460 sama, bez dopisywania jej tutaj; to jedyny sposób,
// żeby ta mapa nie starzała się po cichu przy każdej zmianie w panelu.
//
// `meble` i `z-produkcji` NIE są zmapowane i tak ma zostać: to korzeń katalogu
// i galeria realizacji, a nie typy produktu. Produkt wpięty bezpośrednio pod
// nie zostanie bez kategorii — i o to chodzi, patrz zasada wyżej.
export const GPC_BY_SLUG: Record<string, number> = {
  // Sofy i wszystkie narożniki idą do jednej kategorii Google: taksonomia nie
  // ma osobnego wpisu na narożniki (Meble > Sofy nie ma podkategorii).
  sofy: 460,
  salon: 460, // etykieta „Narożniki"
  // Te dwie wiszą pod „Nasze realizacje", czyli pod gałęzią bez mapowania —
  // dziedziczenie ich nie uratuje, muszą być wskazane wprost (7 produktów).
  "narozniki-l": 460,
  "narozniki-u": 460,

  sypialnia: 505764, // etykieta „Łóżka"
  materace: 2696,
  fotele: 443,
  pufy: 458,
  "schodki-dla-pupila": 6973,
};

// Identyfikator GPC dla kategorii produktu: bezpośrednie mapowanie, a gdy go
// nie ma — pierwszy zmapowany przodek. `null` = świadomie nie wysyłamy pola.
export function resolveGpc(
  categories: GpcCategory[],
  slug: string | null | undefined
): number | null {
  if (!slug) return null;

  const bySlug = new Map(categories.map((c) => [c.slug, c]));
  const byId = new Map(categories.map((c) => [c.id, c]));

  let node = bySlug.get(slug) ?? null;
  // Slug bez wpisu w drzewie (usunięta kategoria zostawiona na produkcie)
  // może być mimo to w mapie — sprawdzamy ją, zanim odpuścimy.
  if (!node) return GPC_BY_SLUG[slug] ?? null;

  // Licznik kroków, nie zbiór odwiedzonych: cykl w drzewie (ręczna edycja
  // parent_id) zapętliłby budowanie feedu w nieskończoność, czyli cały katalog
  // przestałby się pobierać. Sufit = rozmiar drzewa, więc żadna poprawna
  // ścieżka go nie przekroczy.
  for (let krok = 0; krok <= categories.length; krok++) {
    const trafienie = GPC_BY_SLUG[node.slug];
    if (trafienie !== undefined) return trafienie;
    if (!node.parent_id) return null;
    const rodzic = byId.get(node.parent_id);
    if (!rodzic) return null;
    node = rodzic;
  }
  return null;
}

// Czy w /admin/kategorie pokazać przy tej kategorii ostrzeżenie o braku
// odpowiednika Google.
//
// Warunek jest WĄSKI celowo — potrzebne są OBA człony:
// - brak identyfikatora sam w sobie nic nie psuje, dopóki nie ma produktów
//   (kategorie-pojemniki jak „Meble" nigdy nie trafiają do feedu),
// - plakietka przy każdej gałęzi zamieniłaby ostrzeżenie w tło, które się
//   ignoruje — a wtedy nie zadziała wtedy, gdy będzie naprawdę potrzebne.
//
// `ownProducts` to produkty przypisane BEZPOŚREDNIO do tej kategorii, bo tylko
// one wychodzą do katalogu z jej ustawieniem. Licznik z poddrzewa dublowałby
// ostrzeżenie na rodzicu, który sam nie ma z problemem nic wspólnego.
export function warnsAboutMissingGpc(
  categories: GpcCategory[],
  slug: string,
  ownProducts: number
): boolean {
  if (ownProducts <= 0) return false;
  return resolveGpc(categories, slug) === null;
}
