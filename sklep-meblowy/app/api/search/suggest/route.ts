import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { buildSearchOrFilter } from "@/app/_lib/search-filter";
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

  // Sanityzacja + budowa filtra .or() (escape składni .or() i wildcardów
  // ILIKE) w search-filter.ts. null = sama interpunkcja → brak podpowiedzi.
  const orFilter = buildSearchOrFilter(q);
  if (!orFilter) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("id, name, name_de, price, images, category")
    .or(orFilter)
    .order("created_at", { ascending: false })
    .limit(6);

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
