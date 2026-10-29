// Wyszukiwanie po NAZWIE KOLEKCJI: które kolekcje trafia fraza — do filtra
// w bazie (collectionIdsForGroups), do awansu w rankingu (priorityCollectionIds)
// i do klucza rankingu produktu (collectionNameOf).
//
// Czysta logika, zero I/O: kolekcje przychodzą z zewnątrz (getAllCollections,
// cache 300 s), więc testy nie mockują bazy — ten sam powód, dla którego
// search-filter.ts został kiedyś wydzielony z products.ts.
//
// Po co: kolumna search_key_fold to nazwa + opis PRODUKTU. Kolekcja Fado była
// znajdywalna tylko dlatego, że „Fado" siedzi w nazwach jej produktów; kolekcja,
// której nazwy nie ma w żadnej nazwie produktu, była niewidzialna dla
// wyszukiwarki. Decyzje właściciela 2026-10-29:
//   • liczy się NAZWA kolekcji, czyli część etykiety PRZED separatorem
//     („Kolekcja Fado – nowoczesne meble tapicerowane do salonu" → „Kolekcja
//     Fado"). Ogon marketingowy NIE: „sofa" czy „salonu" zwracałyby całe
//     kolekcje, łącznie z łóżkami. Nowa kolekcja łapie się sama — bez
//     dodatkowego pola w panelu i bez migracji;
//   • fraza trafiająca w nazwę kolekcji daje produkty tej kolekcji
//     PRIORYTETOWO, na szczycie wyników (rankByNameMatch z isPriority).
//
// Dwa klucze na kolekcję, celowo różne:
//   • FILTR patrzy na całą nazwę („Kolekcja Fado"), grupami RDZENI
//     z synonimami — dokładnie tym, o co pytamy bazę. Słowo „Kolekcja" MA
//     trafiać w każdą kolekcję: pomiar 2026-10-29 — „kolekcja fado" dawało na
//     produkcji ZERO, bo opisy nie mają „kolekcj", a grupy są ANDowane;
//   • AWANS patrzy na nazwę WŁASNĄ („Fado", bez „Kolekcja") i na formę ZŁOŻONĄ
//     bez stemu, jak poziom 1 rankingu: „liva" awansuje tylko Livę, a „kol…"
//     wpisywane po literze nie wynosi na szczyt wszystkich kolekcji naraz
//     (każda etykieta zaczyna się od „Kolekcja"). Awans ma być ostry, bo
//     wynosi na sam szczyt — „nic nie musiałem rozszerzać".
// Oba używają granicy słowa (wordKey/startsWordIn), NIE sklejonego klucza —
// żeby nie wrócił artefakt „fado" ⊂ „sofadosalonu" z nagłówka rankByNameMatch.
//
// Nazwa własna jest też DOKLEJANA do nazwy produktu w kluczu rankingu
// (collectionNameOf): produkt znaleziony tylko przez kolekcję rdzeniem albo
// synonimem („kanapa" → kolekcja „Sofy Premium"), bez awansu, ląduje wtedy na
// poziomie 2 (rdzeń w nazwie), a nie na 3 — pod produktami z samego opisu.
import type { Locale } from "./i18n";
import {
  foldDiacritics,
  searchKeyTokenForms,
  startsWordIn,
  wordKey,
} from "./search-filter";

// Tyle wystarczy z typu Collection — żeby testy nie musiały budować całego
// wiersza, a wołający mógł podać dowolny wiersz z label/label_de.
export type SearchableCollection = {
  id: string;
  label: string;
  label_de?: string | null;
};

// Separator nazwy od ogona marketingowego: pauza, kreska albo „|" (nigdy nie
// stoją w środku słowa, więc spacje wokół są nieistotne), dwukropek ze spacją
// PO nim, zwykły myślnik ze spacją z CO NAJMNIEJ jednej strony. Panel nie
// pilnuje spacji („Kolekcja Amica: narożniki", „Fado –nowoczesne"), a bez
// ucięcia ogon marketingowy wszedłby do nazwy — dokładnie to, czego
// właściciel nie chciał. Myślnik w środku słowa („Vegas-Buble") zostaje.
const NAME_SEPARATOR = /\s*[–—|]\s*|\s*:\s+|\s+-\s*|\s*-\s+/u;

// Nazwa kolekcji do FILTRA: etykieta do pierwszego separatora, a bez
// separatora — cała.
export function collectionSearchName(label: string): string {
  return label.split(NAME_SEPARATOR, 1)[0].trim();
}

// Słowa-szablony, które stoją na początku KAŻDEJ etykiety i nie są nazwą
// własną. Zdejmowane tylko jako PIERWSZE słowo i tylko, gdy coś po nich
// zostaje — samo „Kolekcja" nie ma prawa stać się pustą nazwą.
const BOILERPLATE_FIRST_WORDS: ReadonlySet<string> = new Set([
  "kolekcja",
  "kollektion",
  "collection",
  "seria",
  "serie",
]);

// Nazwa WŁASNA kolekcji: jak collectionSearchName, ale bez słowa-szablonu
// z przodu („Kolekcja Fado" → „Fado", „Kollektion Fado" → „Fado").
export function collectionOwnName(label: string): string {
  const name = collectionSearchName(label);
  const words = name.split(/\s+/);
  if (words.length > 1 && BOILERPLATE_FIRST_WORDS.has(foldDiacritics(words[0]))) {
    return words.slice(1).join(" ");
  }
  return name;
}

// DE → label_de, a przy braku (null albo pusty) polska etykieta. Spójne
// z localizeCollection: kolekcja bez tłumaczenia pokazuje się po polsku,
// więc ma też być po polsku znajdywalna.
function searchLabel(collection: SearchableCollection, locale: Locale): string {
  if (locale === "de" && collection.label_de) return collection.label_de;
  return collection.label;
}

// Klucze policzone RAZ na żądanie (nie w każdej z trzech funkcji z osobna):
// rozwijka odpytuje przy każdej literze, a przy korekcie literówek liczy
// wszystko drugi raz dla poprawionej frazy.
export type CollectionSearchIndex = {
  readonly entries: readonly {
    id: string;
    // wordKey(całej nazwy) — dla filtra.
    filterKey: string;
    // wordKey(nazwy własnej) — dla awansu.
    priorityKey: string;
    ownName: string;
  }[];
  // `Map`, nie literał obiektowy: klucz to id z bazy, nie od klienta, ale ta
  // sama reguła co w search-typos.ts — żadnej struktury indeksowanej
  // napisem, którą dałoby się trafić w łańcuch prototypu.
  readonly ownNameById: ReadonlyMap<string, string>;
};

export function buildCollectionSearchIndex(
  collections: readonly SearchableCollection[],
  locale: Locale
): CollectionSearchIndex {
  const entries = collections.map((collection) => {
    const label = searchLabel(collection, locale);
    const ownName = collectionOwnName(label);
    return {
      id: collection.id,
      filterKey: wordKey(collectionSearchName(label)),
      priorityKey: wordKey(ownName),
      ownName,
    };
  });
  return {
    entries,
    ownNameById: new Map(entries.map((entry) => [entry.id, entry.ownName])),
  };
}

// Dla KAŻDEJ grupy alternatyw (searchKeyTokenGroups) — id kolekcji, których
// nazwa ma słowo zaczynające się którąkolwiek alternatywą. Lista list, bo
// grupy są w zapytaniu ANDowane: każda dostaje własne `collection_id.in.(…)`
// w applyTokenGroup. Grupa bez kolekcji → pusta lista (zapytanie jak dotąd).
export function collectionIdsForGroups(
  groups: readonly (readonly string[])[],
  index: CollectionSearchIndex
): string[][] {
  return groups.map((group) =>
    index.entries
      .filter((entry) => group.some((alt) => startsWordIn(entry.filterKey, alt)))
      .map((entry) => entry.id)
  );
}

// Kolekcje do awansu na szczyt: ich nazwa WŁASNA ma słowo zaczynające się
// KTÓRYMKOLWIEK tokenem frazy w formie złożonej (bez stemu, bez synonimów).
// „Którymkolwiek", nie „każdym": „narożnik fado" ma awansować narożniki Fado,
// choć „narożnik" w nazwie kolekcji nie ma — o tym, że produkt pasuje do CAŁEJ
// frazy, decyduje już filtr w bazie, awans tylko ustawia kolejność.
export function priorityCollectionIds(
  raw: string,
  index: CollectionSearchIndex
): Set<string> {
  const hit = new Set<string>();
  const forms = searchKeyTokenForms(raw);
  if (forms.length === 0) return hit;
  for (const entry of index.entries) {
    if (forms.some((f) => startsWordIn(entry.priorityKey, f.fold))) hit.add(entry.id);
  }
  return hit;
}

// Nazwa własna kolekcji produktu — do doklejenia do nazwy produktu w kluczu
// rankingu (patrz nagłówek). Produkt bez kolekcji albo z kolekcją spoza
// listy → pusty napis, czyli klucz rankingu bez zmian.
export function collectionNameOf(
  index: CollectionSearchIndex,
  collectionId: string | null
): string {
  if (collectionId === null) return "";
  return index.ownNameById.get(collectionId) ?? "";
}
