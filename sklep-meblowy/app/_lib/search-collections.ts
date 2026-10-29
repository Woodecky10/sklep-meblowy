// Wyszukiwanie po NAZWIE KOLEKCJI: które kolekcje trafia fraza — do filtra
// w bazie (collectionIdsForGroups) i do awansu w rankingu (priorityCollectionIds).
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
// Dwie funkcje, dwie ostrości — celowo różne:
//   • FILTR (collectionIdsForGroups) dostaje grupy RDZENI z synonimami, czyli
//     dokładnie to, o co pytamy bazę — recall po kolekcji ma być taki sam jak
//     po nazwie produktu („liva" → rdzeń „liv" trafia i Livę, i Livię, tak
//     samo jak w search_key_fold);
//   • AWANS (priorityCollectionIds) patrzy na formę ZŁOŻONĄ bez stemu, jak
//     poziom 1 rankingu: „liva" awansuje tylko Livę. Awans ma być ostry, bo
//     wynosi na sam szczyt — „nic nie musiałem rozszerzać".
// Obie używają granicy słowa (wordKey/startsWordIn), NIE sklejonego klucza —
// żeby nie wrócił artefakt „fado" ⊂ „sofadosalonu" z nagłówka rankByNameMatch.
import type { Locale } from "./i18n";
import { searchKeyTokenForms, startsWordIn, wordKey } from "./search-filter";

// Tyle wystarczy z typu Collection — żeby testy nie musiały budować całego
// wiersza, a wołający mógł podać dowolny wiersz z label/label_de.
export type SearchableCollection = {
  id: string;
  label: string;
  label_de?: string | null;
};

// Separator nazwy od ogona marketingowego: pauza, kreska, myślnik, „|" albo
// „:" — OTOCZONE białymi znakami. Myślnik w środku słowa („Vegas-Buble") nie
// jest separatorem. Zwykły myślnik jest tu po to, żeby kolekcja wpisana
// w panelu „Kolekcja Nube - sofy" działała tak samo jak z pauzą.
const NAME_SEPARATOR = /\s[–—\-|:]\s/u;

// Nazwa kolekcji do wyszukiwania: etykieta do pierwszego separatora, a bez
// separatora — cała.
export function collectionSearchName(label: string): string {
  return label.split(NAME_SEPARATOR, 1)[0].trim();
}

// DE → label_de, a przy braku (null albo pusty) polska etykieta. Spójne
// z localizeCollection: kolekcja bez tłumaczenia pokazuje się po polsku,
// więc ma też być po polsku znajdywalna.
function searchLabel(collection: SearchableCollection, locale: Locale): string {
  if (locale === "de" && collection.label_de) return collection.label_de;
  return collection.label;
}

function nameKey(collection: SearchableCollection, locale: Locale): string {
  return wordKey(collectionSearchName(searchLabel(collection, locale)));
}

// Dla KAŻDEJ grupy alternatyw (searchKeyTokenGroups) — id kolekcji, których
// nazwa ma słowo zaczynające się którąkolwiek alternatywą. Lista list, bo
// grupy są w zapytaniu ANDowane: każda dostaje własne `collection_id.in.(…)`
// w applyTokenGroup. Grupa bez kolekcji → pusta lista (zapytanie jak dotąd).
export function collectionIdsForGroups(
  groups: readonly (readonly string[])[],
  collections: readonly SearchableCollection[],
  locale: Locale
): string[][] {
  const keyed = collections.map((c) => ({ id: c.id, key: nameKey(c, locale) }));
  return groups.map((group) =>
    keyed
      .filter(({ key }) => group.some((alt) => startsWordIn(key, alt)))
      .map(({ id }) => id)
  );
}

// Kolekcje do awansu na szczyt: ich nazwa ma słowo zaczynające się
// KTÓRYMKOLWIEK tokenem frazy w formie złożonej (bez stemu, bez synonimów).
// „Którymkolwiek", nie „każdym": „narożnik fado" ma awansować narożniki Fado,
// choć „narożnik" w nazwie kolekcji nie ma — o tym, że produkt pasuje do CAŁEJ
// frazy, decyduje już filtr w bazie, awans tylko ustawia kolejność.
export function priorityCollectionIds(
  raw: string,
  collections: readonly SearchableCollection[],
  locale: Locale
): Set<string> {
  const hit = new Set<string>();
  const forms = searchKeyTokenForms(raw);
  if (forms.length === 0) return hit;
  for (const collection of collections) {
    const key = nameKey(collection, locale);
    if (forms.some((f) => startsWordIn(key, f.fold))) hit.add(collection.id);
  }
  return hit;
}
