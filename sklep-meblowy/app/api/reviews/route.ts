import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/app/_lib/supabase/server";
import { revalidatePath } from "next/cache";

type Body = {
  productId: string;
  rating: number;
  comment?: string;
};

// Walidacja productId jako UUID — bez tego błędny id leciał do PostgREST,
// który zwracał error.message ujawniający schemat DB klientowi (audyt LOW).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Nieprawidłowy JSON" }, { status: 400 });
  }
  const { productId, rating, comment } = body;

  if (!productId || typeof rating !== "number") {
    return NextResponse.json({ error: "Brak wymaganych pól" }, { status: 400 });
  }
  if (!UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Nieprawidłowy productId" }, { status: 400 });
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
    // Typowy błąd: 403 z RLS gdy user nie ma zamówienia tego produktu.
    // error.message NIE trafia do klienta (wyciekał schemat DB) — log na serwerze.
    console.error("review upsert error:", error);
    return NextResponse.json(
      { error: "Nie możesz dodać opinii — weryfikujemy zakupy klientów." },
      { status: 403 }
    );
  }

  // best-effort inline DE komentarza — błąd nie blokuje zapisu opinii
  if (trimmedComment && data) {
    try {
      const { translateComment } = await import("@/app/_lib/translate-entities");
      const { translateTexts } = await import("@/app/_lib/translate");
      const { createAdminClient } = await import("@/app/_lib/supabase/server");
      const comment_de = await translateComment(trimmedComment, (texts, opts) =>
        translateTexts(texts, { html: opts?.html })
      );
      const admin = await createAdminClient();
      await admin
        .from("product_reviews")
        .update({ comment_de, needs_translation: false } as never)
        .eq("id", (data as { id: string }).id);
    } catch (e) {
      console.warn("inline DE review translate skipped:", e);
    }
  }

  // Odśwież stronę produktu i sklep (nowe oceny wpływają na średnią)
  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");

  return NextResponse.json({ review: data });
}

export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const productId = searchParams.get("productId");
  if (!productId || !UUID_RE.test(productId)) {
    return NextResponse.json({ error: "Nieprawidłowy productId" }, { status: 400 });
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
    // error.message nie trafia do klienta (wyciek schematu DB) — log serwerowy.
    console.error("review delete error:", error);
    return NextResponse.json(
      { error: "Nie udało się usunąć opinii" },
      { status: 500 }
    );
  }

  revalidatePath(`/produkt/${productId}`);
  revalidatePath("/sklep");
  return NextResponse.json({ ok: true });
}
