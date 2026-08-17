import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import {
  searchKeyTokenGroups,
  applyTokenGroup,
  rankByNameMatch,
} from "@/app/_lib/search-filter";
import { pickLocalized, isLocale, DEFAULT_LOCALE, type Locale } from "@/app/_lib/i18n";
import { getCategories } from "@/app/_lib/categories";

export type SearchSuggestion = {
  id: string;
  name: string;
  price: number;
  image: string | null;
  category: string;
};

// Kandydaci pobierani z bazy przed rankingiem. Ranking „nazwa przed opisem"
// potrzebuje szerszego zestawu niż 6, bo inaczej sortowanie po created_at
// odsiewa trafienia w nazwie, zanim zdążą wygrać. 30 przy katalogu ~357
// pozycji to koszt pomijalny.
//
// UWAGA, 30 to okno po created_at desc, więc trafienie w nazwie MOŻE wypaść za
// okno i nigdy się nie pokazać — to się dzieje już dziś (fraza „poso": trzecia
// tkanina POSO jest 41. najnowszym dopasowaniem rdzenia „pos", więc do rozwijki
// wchodzą dwie z trzech). Sześć slotów jednak nie marnuje się na trafienia
// z samego OPISU, i to jest właściwy inwariant:
//
//   dla KAŻDEGO rdzenia z >30 dopasowaniami okno 30 zawiera co najmniej
//   13 trafień w NAZWIE, przy 6 potrzebnych do zapełnienia rozwijki.
//
// Zmierzone 2026-08-13 na całym katalogu produkcyjnym (349 aktywnych pozycji,
// słownik 1070 rdzeni ze wszystkich słów nazw i opisów, 71 rdzeni z >30
// dopasowaniami): minimum to 13 (rdzeń „raz" — i to artefakt sklejenia słów
// w kluczu, „…Lara z materacem" → „laraz"), dla rdzeni od 4 znaków minimum
// to 16. Rdzeni z mniej niż 6 trafieniami w nazwie w oknie: ZERO. Marginesu
// jest więc ponad dwukrotność. Podnoszenie tej liczby nic dziś nie kupuje,
// a bije w najgorętszy endpoint sklepu (zapytanie na każde wpisane słowo).
//
// (Wcześniejsza wersja tego komentarza uzasadniała 30 tezą „frazy z >30
// dopasowaniami to słowa z NAZW, okno w 100% z nazw". Teza jest za mocna —
// rdzeń „im" ma 83 dopasowania przy 15/30 z nazwy, „kcj" 37 przy 23/30.
// Wniosek się broni, powód nie, dlatego pilnujemy liczby wyżej.)
//
// Czego to NIE gwarantuje: że najtrafniejsze pozycje są w oknie. Ranking
// (trzy poziomy: nazwa dokładnie → nazwa rdzeniem → opis) sortuje tylko to,
// co okno przyniosło. Kiedy 13 zacznie się zbliżać do 6 — gdy opisy się
// wypełnią (dziś ~93% pozycji jest bez opisu) — NIE podnosić na oślep:
// przenieść ranking do SQL (widok/RPC z CASE), bo tylko to rankuje cały
// katalog. Pełne wyszukiwanie na /sklep tej dziury nie ma: products.ts
// pobiera cały zestaw dopasowań i paginuje w JS.
const SUGGEST_CANDIDATES = 30;
const SUGGEST_LIMIT = 6;

type SuggestRow = {
  id: string;
  name: string;
  name_de: string | null;
  price: number;
  images: string[] | null;
  category: string;
};

// GET /api/search/suggest?q=<term> → top 6 produktów (id, name, price,
// pierwsze zdjęcie, kategoria). Dla live-search w SearchBox.
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locParam = request.nextUrl.searchParams.get("loc");
  const locale: Locale = locParam && isLocale(locParam) ? locParam : DEFAULT_LOCALE;
  if (q.length < 1) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }

  // Wyszukiwanie odporne na spacje/kolejność, ogonki i odmianę: frazę tniemy na
  // słowa, każde składamy do ASCII i obcinamy końcówkę, a na koniec rozszerzamy
  // o synonimy ze słownika — jedno słowo daje więc GRUPĘ alternatywnych rdzeni
  // (searchKeyTokenGroups; „kanapa" → „kanap" LUB „sof", patrz
  // search-vocabulary.ts). Każda grupa idzie do zapytania przez applyTokenGroup
  // i dopasowuje się do kolumny search_key_fold (DE → search_key_fold_de).
  //
  // Grupy są ANDowane między sobą (każde słowo frazy musi wystąpić), a
  // alternatywy wewnątrz grupy ORowane (w którejkolwiek postaci). Brak grup
  // (sama interpunkcja) → brak podpowiedzi.
  const groups = searchKeyTokenGroups(q);
  if (groups.length === 0) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, name, name_de, price, images, category")
    .order("created_at", { ascending: false })
    .limit(SUGGEST_CANDIDATES);
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
  for (const group of groups) {
    query = applyTokenGroup(query, keyCol, group);
  }
  const { data, error } = await query;

  if (error) {
    return NextResponse.json<SearchSuggestion[]>([], { status: 200 });
  }

  // Trafienia w NAZWIE przed trafieniami tylko z opisu, potem obcięcie do 6.
  // rankByNameMatch jest stabilny, więc kolejność z bazy (created_at desc)
  // zostaje jako rozstrzygnięcie remisów wewnątrz każdej grupy.
  const ranked = rankByNameMatch(
    (data ?? []) as SuggestRow[],
    q,
    (row) => (locale === "de" ? row.name_de ?? "" : row.name)
  ).slice(0, SUGGEST_LIMIT);

  // Etykieta kategorii zlokalizowana wg locale (deCat → DE z fallbackiem PL),
  // zamiast surowego sluga. Nazwa produktu przez kolumnę _de.
  const cats = await getCategories(locale);
  const labelBySlug = new Map(cats.map((c) => [c.slug, c.label]));

  const suggestions: SearchSuggestion[] = ranked.map((p: SuggestRow) => ({
    id: p.id,
    name: pickLocalized(p.name, p.name_de, locale),
    price: Number(p.price),
    image: p.images?.[0] ?? null,
    category: labelBySlug.get(p.category) ?? p.category,
  }));

  return NextResponse.json(suggestions);
}
