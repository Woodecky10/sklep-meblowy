import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { revalidatePath } from "next/cache";

type Body = {
  productId: string;
  rating: number;
  comment?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as Body;
  const { productId, rating, comment } = body;

  if (!productId || typeof rating !== "number") {
    return NextResponse.json({ error: "Brak wymaganych pól" }, { status: 400 });
  }
  const ratingInt = Math.round(rating);
  if (ratingInt < 1 || ratingInt > 5) {
    return NextResponse.json({ error: "Ocena musi być w zakresie 1–5" }, { status: 400 });
  }

  const trimmedComment =
    typeof comment === "string" ? comment.trim().slice(0, 2000) : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  // Upsert po (product_id, user_id) — edycja dotychczasowej opinii albo nowa.
  // RLS zadba o weryfikację zakupu (polityka reviews: insert po zakupie).
  const { data, error } = await supabase
    .from("product_reviews")
    .upsert(
      {
        product_id: productId,
        user_id: user.id,
        rating: ratingInt,
        comment: trimmedComment || null,
      } as never,
      { onConflict: "product_id,user_id" }
    )
    .select()
    .single();

  if (error) {
    // Typowy błąd: 403 z RLS gdy user nie ma zamówienia tego produktu
    return NextResponse.json(
      { error: "Nie możesz dodać opinii — weryfikujemy zakupy klientów. " + error.message },
      { status: 403 }
    );
  }

  // Odśwież stronę produktu i sklep (nowe oceny wpływają na średnią)
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");

  return NextResponse.json({ review: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (!productId) {
    return NextResponse.json({ error: "Brak productId" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Musisz być zalogowany" }, { status: 401 });
  }

  const { error } = await supabase
    .from("product_reviews")
    .delete()
    .eq("product_id", productId)
    .eq("user_id", user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  return NextResponse.json({ ok: true });
}
