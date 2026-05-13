import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";

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
  if (q.length < 1) {
    return NextResponse.json<SearchSuggestion[]>([]);
  }

  const supabase = await createClient();
  // Escape ILIKE wildcards w user input.
  const term = q.replace(/[%_\\]/g, "\\$&");

  const { data, error } = await supabase
    .from("products")
    .select("id, name, price, images, category")
    .or(`name.ilike.%${term}%,description.ilike.%${term}%`)
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) {
    return NextResponse.json<SearchSuggestion[]>([], { status: 200 });
  }

  const suggestions: SearchSuggestion[] = (data ?? []).map(
    (p: { id: string; name: string; price: number; images: string[] | null; category: string }) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price),
      image: p.images?.[0] ?? null,
      category: p.category,
    })
  );

  return NextResponse.json(suggestions);
}
