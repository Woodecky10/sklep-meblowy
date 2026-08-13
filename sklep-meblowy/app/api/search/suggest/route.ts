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
