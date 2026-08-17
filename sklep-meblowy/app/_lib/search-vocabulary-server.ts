import "server-only";
import { unstable_cache, revalidateTag } from "next/cache";
import { createClient as createBareAnonClient } from "@supabase/supabase-js";
import { FACETS_CACHE_TAG } from "./products";
import { DEFAULT_LOCALE, type Locale } from "./i18n";
import {
  buildCatalogVocabulary,
  VOCABULARY_EXTRA_WORDS,
} from "./search-vocabulary";

export const SEARCH_VOCABULARY_CACHE_TAG = "search-vocabulary";

// Nazwy produktów widziane przez GOŚCIA, cachowane. Wzorzec dokładnie jak
// getFacetSource w products.ts i fetchContact w contact-server.ts:
//
//   ⚠️ wewnątrz unstable_cache NIE WOLNO cookies() → czysty klient anon.
//   RLS pokazuje mu to samo co niezalogowanemu klientowi, czyli wyłącznie
//   produkty aktywne — i o to chodzi: słownik poprawnych słów nie ma prawa
//   podpowiadać słów z produktów ukrytych.
//
//   ⚠️ Bez .limit() — świadomie (katalog to 353 aktywne pozycje, pomiar
//   2026-08-17). Przy dużym wzroście katalogu PostgREST utnie wiersze i słownik
//   po cichu zgubi słowa — objawi się to nie błędem, tylko brakiem podpowiedzi
//   dla części produktów. Wtedy: zdenormalizować słownik albo stronicować.
//
//   ⚠️ Rzucamy przy błędzie zapytania, żeby cache NIE ZAPAMIĘTAŁ pustego
//   słownika na 300 sekund (to samo uzasadnienie co w contact-server.ts).
//   Wołający ma złapać wyjątek i zachować się jak dziś, czyli bez korekty.
//
// ⚠️⚠️ ZWRACAMY TABLICĘ PAR, A NIE `Map` — i to nie jest kwestia gustu.
// unstable_cache serializuje wynik przez JSON (node_modules/next/dist/server/
// web/spec-extension/unstable-cache.js: `JSON.stringify(result)` przy zapisie,
// `JSON.parse` przy odczycie), a `JSON.stringify(new Map([["sofa", 38]]))` to
// dosłownie `"{}"`. Mapa przeżyłaby PIERWSZE wywołanie (miss zwraca wartość
// z pamięci), a od drugiego wracałby pusty obiekt bez metody `.has` — czyli
// `TypeError` z /sklep i z /api/search/suggest, i to dopiero po pierwszym
// trafieniu w cache. Tablica par przechodzi przez JSON bez straty; `Map`
// składamy po stronie wołającego.
const fetchVocabularySource = unstable_cache(
  async (locale: Locale): Promise<[string, number][]> => {
    const anon = createBareAnonClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    // Kolumna zależy od języka: /de szuka po nazwach niemieckich, więc i słownik
    // musi być niemiecki — inaczej korekta podstawiałaby polskie słowo do
    // zapytania po search_key_fold_de i dawała zero.
    const column = locale === "de" ? "name_de" : "name";
    const { data, error } = await anon.from("products").select(column);
    if (error) throw error;

    const names = (data ?? [])
      .map((row) => (row as Record<string, string | null>)[column] ?? "")
      .filter((name) => name.trim() !== "");

    return [...buildCatalogVocabulary(names, VOCABULARY_EXTRA_WORDS)];
  },
  ["search-vocabulary-v1"],
  {
    // DWA TAGI, świadomie — i dlatego NIE MA nowych wywołań w akcjach admina.
    // invalidateFacetsCache() jest wołane w 15 miejscach (app/admin/produkty/
    // actions.ts ×8, app/admin/tkaniny/actions.ts ×5, plus importy) i każde
    // z nich to dokładnie ten sam moment „dane produktów się zmieniły".
    // Piętnaście ręcznych wywołań bliźniaczej funkcji to piętnaście okazji, żeby
    // o jednym zapomnieć przy kolejnej zmianie; jedna linia tutaj daje poprawną
    // inwalidację wszędzie tam, gdzie już jest. Własny tag zostaje na celowe
    // unieważnienie samego słownika (invalidateSearchVocabularyCache niżej).
    tags: [SEARCH_VOCABULARY_CACHE_TAG, FACETS_CACHE_TAG],
    revalidate: 300,
  }
);

// Słownik poprawnych słów katalogu dla korekty literówek (search-typos.ts).
// Klucz = słowo złożone do ASCII, wartość = w ilu produktach występuje.
//
// ⚠️ RZUCA, gdy zapytanie padnie. Wołający MUSI to złapać i zachować się jak
// dziś — czyli po prostu bez korekty. Zero wyników bez podpowiedzi jest gorsze
// niż z podpowiedzią, ale nieporównanie lepsze niż strona awarii (w repo nie ma
// error.tsx).
//
// ⚠️ Na /de słownik jest dziś SZCZĄTKOWY: name_de ma wypełnione 15 z 353
// aktywnych produktów (pomiar 2026-08-17), więc korekta po niemiecku prawie
// nie ma na czym pracować. To nie jest usterka tego modułu — to stan danych.
export async function getCatalogVocabulary(
  locale: Locale = DEFAULT_LOCALE
): Promise<ReadonlyMap<string, number>> {
  return new Map(await fetchVocabularySource(locale));
}

// Celowe unieważnienie samego słownika — bez wywołań na razie. Zwykłą ścieżką
// jest FACETS_CACHE_TAG wyżej; to jest wyjście awaryjne (np. po ręcznej edycji
// nazw wprost w bazie, z pominięciem panelu).
export function invalidateSearchVocabularyCache(): void {
  revalidateTag(SEARCH_VOCABULARY_CACHE_TAG, "max");
}
