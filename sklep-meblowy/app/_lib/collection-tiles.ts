// Czysta logika kafelków kolekcji na stronę główną (i panel admina, Task 4) —
// BEZ ŻADNYCH server-only importów (next/cache, next/headers), więc bezpieczna
// do importu wartościami z komponentów klienckich (HomeCollections.tsx,
// CollectionsEditor.tsx). I/O i cache żyją w collections.ts, który ma
// `import "server-only"` jako guard — wzorzec analogiczny do pary
// blocks.ts/blocks-server.ts i i18n.ts/i18n-server.ts, tylko nazwany inaczej
// (żeby pasować 1:1 do pliku testów collection-tiles.test.ts).
import { localizeCollection } from "./localize";
import type { Locale } from "./i18n";
import type { Collection } from "./types";

// Ile kafelków widać przed rozwinięciem. 6 dzieli się bez resztki przez 1, 2
// i 3 — tyle kolumn ma siatka na kolejnych szerokościach ekranu — więc granica
// zwinięcia wypada na końcu pełnego rzędu na każdym urządzeniu.
export const HOME_COLLECTIONS_VISIBLE = 6;

// Minimalny wiersz produktu potrzebny do kafelka. Świadomie NIE `Product`:
// mozaika ma alt="" i nie używa nazw ani opisów, więc nie ma po co ich pobierać.
// is_active: SQL w getCollectionTilesForHome filtruje `.eq("is_active", true)`
// jako OPTYMALIZACJA pasma (nie ściągamy nieaktywnych produktów) — to NIE jest
// źródło prawdy. Źródłem prawdy jest isActiveProductRow niżej: Task 4 (panel
// admina) podaje WSZYSTKIE wiersze bez filtrowania w JS i polega właśnie na
// tej funkcji. Nie usuwaj filtra SQL myśląc że jest zbędny, ale też nie usuwaj
// filtrowania stąd myśląc że SQL już to załatwia — dwa różne konsumenty tego
// pliku (home przez SQL, panel bez) muszą dać ten sam wynik.
export type CollectionProductRow = {
  collection_id: string | null;
  images: string[] | null;
  is_active: boolean;
};

// Lista kolumn dla zapytania, które karmi CollectionProductRow — stoi TU,
// obok typu i ostrzeżenia wyżej, a nie jako literał w collections.ts.
// Powód: skrócenie tej listy (np. wywalenie `is_active` jako "przecież SQL
// już filtruje") nie wywala niczego — `as CollectionProductRow[]` przepuszcza
// to przez tsc, testy jednostkowe podają is_active jawnie, a na produkcji
// isActiveProductRow zwraca undefined dla KAŻDEGO wiersza → wszystkie
// liczniki 0 → sekcja kolekcji cicho znika ze strony głównej. Trzymając
// stałą tutaj wymuszamy, żeby taka zmiana wymagała dotknięcia pliku
// z ostrzeżeniem, zamiast edycji stringa kilkadziesiąt linii dalej.
// Musi odpowiadać DOKŁADNIE polom CollectionProductRow.
export const COLLECTION_TILE_COLUMNS = "collection_id, images, is_active";

export type CollectionTile = {
  collection: Collection; // zlokalizowana (label/description)
  thumbnails: string[]; // do 4 UNIKALNYCH adresów zdjęć na mozaikę
  productCount: number; // liczba AKTYWNYCH produktów w kolekcji
};

// JEDYNA definicja "aktywnego produktu" dla kafelków home i panelu admina.
// Whatever wywołuje countActiveProductsByCollection/buildCollectionTiles NIE
// MOŻE zakładać, że wiersze są już przefiltrowane — ta funkcja filtruje sama.
export function isActiveProductRow(row: CollectionProductRow): boolean {
  return row.is_active;
}

// Komparator kolejności kafelków: sort_order rosnąco, przy remisie label.
// Współdzielony przez buildCollectionTiles (home) i panel /admin/kolekcje
// (Task 4) — inaczej po pierwszym przeciągnięciu w panelu lista wróciłaby do
// porządku alfabetycznego i kolejne przeciągnięcie cicho skasowałoby
// poprzedni układ.
export function byHomeOrder(a: Collection, b: Collection): number {
  return a.sort_order - b.sort_order || a.label.localeCompare(b.label, "pl");
}

// Predykat "ta kolekcja trafia na stronę główną": widoczna (show_on_home) i ma
// co najmniej jeden aktywny produkt. Współdzielony przez buildCollectionTiles
// i foldAfterIndex, żeby definicja "kolekcja pokazuje się na home" istniała
// w jednym miejscu.
export function appearsOnHome(
  collection: Collection,
  counts: Map<string, number>
): boolean {
  return collection.show_on_home && (counts.get(collection.id) ?? 0) > 0;
}

// Wspólne dla strony głównej i panelu — żeby "aktywny produkt" miał jedną
// definicję po obu stronach i nie rozjechał się przy zmianie warunku.
export function countActiveProductsByCollection(
  rows: CollectionProductRow[]
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const r of rows) {
    if (!r.collection_id || !isActiveProductRow(r)) continue;
    counts.set(r.collection_id, (counts.get(r.collection_id) ?? 0) + 1);
  }
  return counts;
}

// Cała logika składania kafelków — bez I/O, więc testowalna bez bazy.
export function buildCollectionTiles(
  collections: Collection[],
  rows: CollectionProductRow[],
  locale: Locale
): CollectionTile[] {
  const counts = countActiveProductsByCollection(rows);

  // Zdjęcia tylko z AKTYWNYCH produktów, KTÓRE JE MAJĄ, bez duplikatów — ten
  // sam URL potrafi się powtórzyć (dwa produkty tej samej sofy w różnych
  // rozmiarach/tkaninach reużywają zdjęcie), a cztery kopie jednego zdjęcia w
  // mozaice 2×2 wyglądają na zepsute. Dedupe MUSI być PRZED obcięciem do 4:
  // w odwrotnej kolejności duplikaty zajęłyby wszystkie miejsca i kafelek
  // pokazałby jedno zdjęcie zamiast czterech różnych. productCount (niżej)
  // liczy wszystkie aktywne produkty niezależnie od duplikatów zdjęć.
  const thumbnails = new Map<string, string[]>();
  for (const r of rows) {
    if (!r.collection_id || !isActiveProductRow(r)) continue;
    const first = r.images?.[0];
    if (!first) continue;
    const arr = thumbnails.get(r.collection_id) ?? [];
    if (arr.length < 4 && !arr.includes(first)) arr.push(first);
    thumbnails.set(r.collection_id, arr);
  }

  return collections
    .filter((c) => appearsOnHome(c, counts))
    .sort(byHomeOrder)
    .map((c) => ({
      collection: localizeCollection(c, locale),
      thumbnails: thumbnails.get(c.id) ?? [],
      productCount: counts.get(c.id) ?? 0,
    }));
}

// Indeks pozycji, PO której panel rysuje kreskę "poniżej dopiero po
// rozwinięciu". Liczy tylko kolekcje, które realnie trafią na stronę —
// liczenie wszystkich wierszy pokazywałoby granicę w złym miejscu.
// null = kreski nie ma: albo widocznych kolekcji jest HOME_COLLECTIONS_VISIBLE
// lub mniej (wszystko mieści się w jednym ekranie), albo (teoretycznie)
// pętla nie znalazła dość elementów — w obu wypadkach nie ma nic do zwinięcia.
// Warunek na totalVisible pilnuje granicy dokładnie na
// HOME_COLLECTIONS_VISIBLE: bez niego przy dokładnie 6 widocznych kolekcjach
// funkcja zwracała indeks ostatniej z nich, a strona główna i tak nie pokazuje
// przycisku (bo `rest` jest puste) — więc panel rysowałby kreskę bez niczego
// pod nią.
export function foldAfterIndex(
  collections: Collection[],
  counts: Map<string, number>
): number | null {
  const totalVisible = collections.filter((c) => appearsOnHome(c, counts)).length;
  if (totalVisible <= HOME_COLLECTIONS_VISIBLE) return null;

  let shown = 0;
  for (let i = 0; i < collections.length; i++) {
    if (appearsOnHome(collections[i], counts)) shown++;
    if (shown === HOME_COLLECTIONS_VISIBLE) return i;
  }
  return null; // nieosiągalne przy totalVisible > HOME_COLLECTIONS_VISIBLE
}
