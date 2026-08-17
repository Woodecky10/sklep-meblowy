import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import {
  searchKeyTokenGroups,
  applyTokenGroup,
  rankByNameMatch,
} from "@/app/_lib/search-filter";
import { applyTypoCorrection } from "@/app/_lib/search-correction";
import { getCatalogVocabulary } from "@/app/_lib/search-vocabulary-server";
import { pickLocalized, isLocale, DEFAULT_LOCALE, type Locale } from "@/app/_lib/i18n";
import { getCategories } from "@/app/_lib/categories";
import type { SearchSuggestion, SuggestResponse } from "@/app/_lib/search-suggest";

// Typy mieszkają w module-liściu app/_lib/search-suggest.ts (razem z funkcją
// czytającą tę odpowiedź po stronie przeglądarki), bo ich drugim konsumentem
// jest KLIENCKI SearchBox — a ten plik ciągnie supabase, słownik katalogu
// i całą korektę. Re-eksport zostaje, żeby dotychczasowa ścieżka importu
// działała bez zmian; jest type-only, więc nie dokłada żadnego eksportu
// wykonywalnego do route handlera.
export type { SearchSuggestion, SuggestResponse };

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

// GET /api/search/suggest?q=<term> → { items: top 6 produktów (id, name, price,
// pierwsze zdjęcie, kategoria) }. Dla live-search w SearchBox.
//
// Fraza, która nie znalazła NICZEGO, dostaje jedno ponowione zapytanie poprawioną
// frazą (search-correction.ts) i wtedy — i tylko wtedy — w odpowiedzi są pola
// `correctedFrom`/`correctedTo`. Kształt odpowiedzi jest OBIEKTEM, nie gołą
// tablicą jak wcześniej; przeglądarka czyta go przez normalizeSuggestResponse,
// który przyjmuje też stary kształt (patrz app/_lib/search-suggest.ts).
export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locParam = request.nextUrl.searchParams.get("loc");
  const locale: Locale = locParam && isLocale(locParam) ? locParam : DEFAULT_LOCALE;
  if (q.length < 1) {
    return NextResponse.json<SuggestResponse>({ items: [] });
  }

  // Fraza bez ani jednego tokenu (sama interpunkcja) → wyjście PRZED
  // jakimkolwiek I/O, dokładnie jak przed dołożeniem korekty. Nie ma tu czego
  // poprawiać: planSearchCorrection sanityzuje frazę tym samym searchTokens
  // i na pustej liście tokenów zwraca null. Bez tego wyjścia `?q=!!!` czytałby
  // jeszcze słownik katalogu — praca do wyrzucenia na najgorętszym endpoincie
  // sklepu.
  if (searchKeyTokenGroups(q).length === 0) {
    return NextResponse.json<SuggestResponse>({ items: [] });
  }

  const supabase = await createClient();
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";

  // JEDNO wyszukiwanie: filtr + ranking + obcięcie do 6. Wydzielone z ciała
  // GET-a, bo woła się je DWA RAZY — drugi raz poprawioną frazą.
  //
  // ⚠️ TA FUNKCJA SAMA KOREKTY NIE ROBI i robić nie ma: dzięki temu głębokość
  // ponowienia jest strukturalnie równa 1, bez żadnej flagi „już poprawiałem"
  // (getProducts na /sklep musi mieć skipTypoCorrection, bo tam ponowieniem jest
  // rekurencyjne wywołanie samego siebie). Pętla na PUBLICZNYM, najgorętszym
  // endpoincie sklepu jest niedopuszczalna.
  //
  // Zwraca null WYŁĄCZNIE przy błędzie zapytania. Pusta tablica znaczy „nic nie
  // znaleziono" i to ona — i nic innego — uruchamia korektę.
  //
  // Wyszukiwanie odporne na spacje/kolejność, ogonki i odmianę: frazę tniemy na
  // słowa, każde składamy do ASCII i obcinamy końcówkę, a na koniec rozszerzamy
  // o synonimy ze słownika — jedno słowo daje więc GRUPĘ alternatywnych rdzeni
  // (searchKeyTokenGroups; «kanapa» → «kanap» LUB «sof», patrz
  // search-vocabulary.ts). Każda grupa idzie do zapytania przez applyTokenGroup
  // i dopasowuje się do kolumny search_key_fold (DE → search_key_fold_de).
  //
  // Grupy są ANDowane między sobą (każde słowo frazy musi wystąpić), a
  // alternatywy wewnątrz grupy ORowane (w którejkolwiek postaci). Brak grup
  // (sama interpunkcja) → brak podpowiedzi.
  async function runSuggest(phrase: string): Promise<SuggestRow[] | null> {
    const groups = searchKeyTokenGroups(phrase);
    if (groups.length === 0) return [];

    let query = supabase
      .from("products")
      .select("id, name, name_de, price, images, category")
      .order("created_at", { ascending: false })
      .limit(SUGGEST_CANDIDATES);
    for (const group of groups) {
      query = applyTokenGroup(query, keyCol, group);
    }
    const { data, error } = await query;
    if (error) return null;

    // Trafienia w NAZWIE przed trafieniami tylko z opisu, potem obcięcie do 6.
    // rankByNameMatch jest stabilny, więc kolejność z bazy (created_at desc)
    // zostaje jako rozstrzygnięcie remisów wewnątrz każdej grupy. Rankujemy po
    // TEJ SAMEJ frazie, którą poszedł filtr — przy ponowieniu jest to fraza
    // poprawiona, bo inaczej ranking wymagałby czego innego niż zapytanie.
    return rankByNameMatch(
      (data ?? []) as SuggestRow[],
      phrase,
      (row) => (locale === "de" ? row.name_de ?? "" : row.name)
    ).slice(0, SUGGEST_LIMIT);
  }

  const initial = await runSuggest(q);
  if (initial === null) {
    // Błąd zapytania → pusto ze statusem 200, dokładnie jak dziś: rozwijka wisi
    // w headerze każdej strony i nie ma prawa jej wywalić.
    // ⚠️ I BEZ KOREKTY: awaria bazy to nie jest „fraza nic nie znalazła", a
    // dokładanie jej dwóch kolejnych zapytań (słownik + ponowienie) w momencie,
    // gdy właśnie oddała błąd, byłoby dolewaniem oliwy do ognia.
    return NextResponse.json<SuggestResponse>({ items: [] }, { status: 200 });
  }

  // Fallback literówkowy — ta sama funkcja, co na /sklep, tylko z innym `R`.
  // ⚠️ Odpala się WYŁĄCZNIE przy PUSTEJ liście podpowiedzi: fraza, która dziś
  // cokolwiek podpowiada, ma podpowiedzieć DOKŁADNIE to samo w tej samej
  // kolejności i nie kosztować ani jednego zapytania więcej.
  const { result, correctedFrom, correctedTo } = await applyTypoCorrection({
    search: q,
    initial,
    isEmpty: (rows) => rows.length === 0,
    // Rzuca przy błędzie bazy — łapie to applyTypoCorrection i zachowuje się
    // dokładnie jak dziś, czyli bez korekty.
    loadVocabulary: () => getCatalogVocabulary(locale),
    // Błąd ponowionego zapytania traktujemy jak brak wyników: klient dostanie
    // dzisiejszą pustą rozwijkę, bez obietnicy korekty, której nie ma czym
    // pokryć.
    rerun: async (phrase) => (await runSuggest(phrase)) ?? [],
  });

  // Etykieta kategorii zlokalizowana wg locale (deCat → DE z fallbackiem PL),
  // zamiast surowego sluga. Nazwa produktu przez kolumnę _de.
  const cats = await getCategories(locale);
  const labelBySlug = new Map(cats.map((c) => [c.slug, c.label]));

  const items: SearchSuggestion[] = result.map((p: SuggestRow) => ({
    id: p.id,
    name: pickLocalized(p.name, p.name_de, locale),
    price: Number(p.price),
    image: p.images?.[0] ?? null,
    category: labelBySlug.get(p.category) ?? p.category,
  }));

  // Bez korekty oddajemy sam `items` — pola korekty mają być NIEOBECNE, a nie
  // puste, bo to na ich obecności stoi decyzja UI o pokazaniu zdania.
  if (correctedFrom === undefined) {
    return NextResponse.json<SuggestResponse>({ items });
  }
  return NextResponse.json<SuggestResponse>({ items, correctedFrom, correctedTo });
}
