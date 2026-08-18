import { createAdminClient } from "./supabase/server";
import { authorNameOf } from "./reviews";
import type { ProductReview, ReviewStatus } from "./types";

// ⚠️ Bez `slug` — tabela `products` NIE MA takiej kolumny (sprawdzone na
// produkcji 2026-08-18). Produkty linkuje się po id: /produkt/<id>.
export type ReviewForModeration = ProductReview & {
  product_name: string | null;
};

// Panel czyta klientem administracyjnym, bo reguła publicznego odczytu
// przepuszcza wyłącznie `approved` — a moderacja z definicji ogląda to,
// czego publiczność jeszcze nie widzi.
export async function getReviewsForModeration(
  status: ReviewStatus
): Promise<ReviewForModeration[]> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("product_reviews")
    .select("*, products(name)")
    // Najstarsze pierwsze: kolejka moderacji, nie tablica ogłoszeń —
    // najdłużej czekający klient ma być obsłużony pierwszy.
    .order("created_at", { ascending: true })
    .eq("status", status);
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

export async function getPendingReviewsCount(): Promise<number> {
  const admin = await createAdminClient();
  const { count, error } = await admin
    .from("product_reviews")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (error) return 0;
  return count ?? 0;
}
