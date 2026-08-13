import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { searchKeyTokens, escapeIlike, rankByNameMatch } from "@/app/_lib/search-filter";
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
// UWAGA, 30 to okno po created_at desc, więc TEORETYCZNIE trafienie w nazwie
// może wypaść za okno i nigdy się nie pokazać. Warunek szkody jest podwójny:
// w oknie musi siedzieć trafienie tylko-z-opisu ORAZ poza oknem trafienie
// w nazwie. Zmierzone na produkcji (2026-08-13, 360 pozycji, 18 realnych
// fraz): te dwa warunki nie zachodzą jednocześnie ANI RAZU — frazy z >30
// dopasowaniami to słowa z NAZW (lozk 177, materac 157, naroznik 41: okno
// w 100% z nazw), a frazy żyjące w opisach mają <30 dopasowań łącznie
// (drewn 9, sprezyn 12, tkanin 19), więc poza oknem nie ma nic do stracenia.
// Utracone wyniki: 0. Podnoszenie tej liczby nic dziś nie kupuje, a bije
// w najgorętszy endpoint sklepu (zapytanie na każde wpisane słowo).
//
// Kiedy to przestanie być prawdą: gdy opisy się wypełnią (dziś ~93% pozycji
// jest bez opisu) i pojawi się fraza z >30 dopasowaniami, w której najnowsze
// pozycje łapią się tylko opisem. Wtedy NIE podnosić na oślep — przenieść
// ranking do SQL (widok/RPC z CASE), bo tylko to rankuje cały katalog.
// Pełne wyszukiwanie na /sklep tej dziury nie ma: products.ts pobiera cały
// zestaw dopasowań i paginuje w JS.
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
  // słowa, każde składamy do ASCII i obcinamy końcówkę, a potem dopasowujemy do
  // kolumny search_key_fold przez ILIKE — wiele .ilike() na tej samej kolumnie
  // PostgREST ANDuje (każde słowo musi wystąpić). Brak tokenów (sama
  // interpunkcja) → brak podpowiedzi.
  const tokens = searchKeyTokens(q);
  if (tokens.length === 0) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }

  const supabase = await createClient();
  let query = supabase
    .from("products")
    .select("id, name, name_de, price, images, category")
    .order("created_at", { ascending: false })
    .limit(SUGGEST_CANDIDATES);
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
  for (const token of tokens) {
    query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
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
