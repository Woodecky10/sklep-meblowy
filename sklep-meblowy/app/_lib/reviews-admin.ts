import { createAdminClient } from "./supabase/server";
import { authorNameOf } from "./reviews";
import type { ProductReview } from "./types";
import type { ReviewBucket } from "./reviews-moderation";

// ⚠️ Bez `slug` — tabela `products` NIE MA takiej kolumny (sprawdzone na
// produkcji 2026-08-18). Produkty linkuje się po id: /produkt/<id>.
export type ReviewForModeration = ProductReview & {
  product_name: string | null;
};

// Panel czyta klientem administracyjnym, bo reguła publicznego odczytu
// przepuszcza wyłącznie `approved` — a moderacja z definicji ogląda też to,
// co jeszcze nie zostało przejrzane (moderated_at is null) albo co usunięto.
export async function getReviewsForBucket(
  bucket: ReviewBucket
): Promise<ReviewForModeration[]> {
  const admin = await createAdminClient();
  let q = admin.from("product_reviews").select("*, products(name)");

  if (bucket === "usuniete") {
    q = q.eq("status", "rejected");
  } else if (bucket === "nowe") {
    // „nowe" = wszystko, czego Julia nie dotknęła: świeże approved ORAZ
    // resztki pending sprzed migracji 78. Filtr po samym moderated_at łapie
    // oba, a odrzucone odsiewamy jawnie.
    q = q.is("moderated_at", null).neq("status", "rejected");
  } else {
    q = q.eq("status", "approved").not("moderated_at", "is", null);
  }

  // Nowe: najstarsze pierwsze (najdłużej czekający klient wisi bez spojrzenia).
  // Pozostałe: najnowsze pierwsze — to już archiwum, nie kolejka.
  const { data, error } = await q.order("created_at", { ascending: bucket === "nowe" });
  if (error || !data) return [];

  const rows = data as unknown as (ProductReview & {
    products: { name: string | null } | null;
  })[];

  const userIds = Array.from(
    new Set(rows.map((r) => r.user_id).filter((id): id is string => id !== null))
  );
  const nameMap = new Map<string, string | null>();
  if (userIds.length > 0) {
    const { data: profiles } = await admin
      .from("profiles")
      .select("id, full_name")
      .in("id", userIds);
    for (const p of (profiles ?? []) as { id: string; full_name: string | null }[]) {
      nameMap.set(p.id, p.full_name);
    }
  }

  return rows.map((r) => ({
    ...r,
    author_name: authorNameOf(r, nameMap.get(r.user_id ?? "")),
    product_name: r.products?.name ?? null,
  }));
}

// Plakietka „do przejrzenia": opinia JEST już publiczna, więc to nie jest
// kolejka blokująca klienta — to lista rzeczy, na które nikt jeszcze nie
// spojrzał. Ten sam wzorzec, co getNewOrdersCount (orders.status_updated_at).
export async function getUnreviewedReviewsCount(): Promise<number> {
  const admin = await createAdminClient();
  const { count, error } = await admin
    .from("product_reviews")
    .select("id", { count: "exact", head: true })
    .is("moderated_at", null)
    .neq("status", "rejected");
  if (error) {
    // Plakietka nie może wywalić panelu — layout renderuje się na każdej
    // podstronie. Spójne z getNewOrdersCount.
    console.error("[admin] odczyt licznika opinii nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}
