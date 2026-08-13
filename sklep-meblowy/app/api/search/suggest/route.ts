import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { searchKeyTokens, escapeIlike } from "@/app/_lib/search-filter";
import { pickLocalized, isLocale, DEFAULT_LOCALE, type Locale } from "@/app/_lib/i18n";
import { getCategories } from "@/app/_lib/categories";

export type SearchSuggestion = {
  id: string;
  name: string;
  price: number;
  image: string | null;
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
    .limit(6);
  const keyCol = locale === "de" ? "search_key_fold_de" : "search_key_fold";
  for (const token of tokens) {
    query = query.ilike(keyCol, `%${escapeIlike(token)}%`);
  }
  const { data, error } = await query;

  if (error) {
    return NextResponse.json<SearchSuggestion[]>([], { status: 200 });
  }

  // Etykieta kategorii zlokalizowana wg locale (deCat → DE z fallbackiem PL),
  // zamiast surowego sluga. Nazwa produktu przez kolumnę _de.
  const cats = await getCategories(locale);
  const labelBySlug = new Map(cats.map((c) => [c.slug, c.label]));

  const suggestions: SearchSuggestion[] = (data ?? []).map(
    (p: {
      id: string;
      name: string;
      name_de: string | null;
      price: number;
      images: string[] | null;
      category: string;
    }) => ({
      id: p.id,
      name: pickLocalized(p.name, p.name_de, locale),
      price: Number(p.price),
      image: p.images?.[0] ?? null,
      category: labelBySlug.get(p.category) ?? p.category,
    })
  );

  return NextResponse.json(suggestions);
}
