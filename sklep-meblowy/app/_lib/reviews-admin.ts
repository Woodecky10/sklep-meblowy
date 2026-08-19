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
    // resztki pending sprzed migracji 78 — MUSI być ten sam warunek co
    // reviewBucket() w reviews-moderation.ts (`moderated_at is null OR
    // status = 'pending'`). Sam `moderated_at is null` byłby wystarczający,
    // ale legacy wiersze pending (wciąż istniejące sprzed migracji 78 albo
    // zapisane starym kodem w oknie wdrożenia) nigdy nie powinny zniknąć
    // z oczu moderatora. Takie wiersze NIE są publiczne (RLS przepuszcza
    // tylko approved), więc panel MUSI je wyświetlić w „nowe" — inaczej
    // nikt ich nie opublikuje. Stąd jawny `.or()`, choć akcja „Przejrzane"
    // zawsze je ustawia na approved.
    //
    // `.neq("status","rejected")` NIE jest kosmetyką ani zabezpieczeniem na
    // zapas — jest konieczny. Pierwszy człon OR-a (`moderated_at.is.null`)
    // łapie też wiersze odrzucone PRZED migracją 78: migracja dodaje kolumnę
    // `moderated_at` bez backfillu, więc każda opinia, którą Julia odrzuciła
    // zanim migracja dojechała, ma dziś `status='rejected'` i
    // `moderated_at=null`. Bez `.neq` taki wiersz trafiłby do „nowe", mimo że
    // reviewBucket() sprawdza `rejected` NAJPIERW i bezwarunkowo zwraca
    // „usuniete" — kubełki panelu musiałyby się wtedy rozjechać z regułą
    // publicznego odczytu (rejected nigdy nie jest widoczne dla klienta).
    q = q.or("moderated_at.is.null,status.eq.pending").neq("status", "rejected");
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

// Snapshot opinii na potrzeby maila — osobny odczyt, żeby miejsce wpięcia
// wołało jedną linijkę zamiast samo zbierać dane (wzorzec loadOrder
// z sample-notify.ts). Bez guest_email: mail do właścicielki nie potrzebuje
// adresu klienta, a PublicReview celowo go nie niesie.
export type ReviewForMail = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  author_name: string | null;
  product_name: string | null;
};

export async function getReviewForMail(reviewId: string): Promise<ReviewForMail | null> {
  const admin = await createAdminClient();
  const { data } = await admin
    .from("product_reviews")
    .select("id, rating, comment, created_at, user_id, guest_name, products(name)")
    .eq("id", reviewId)
    .maybeSingle();
  if (!data) return null;

  const r = data as unknown as {
    id: string;
    rating: number;
    comment: string | null;
    created_at: string;
    user_id: string | null;
    guest_name: string | null;
    products: { name: string | null } | null;
  };

  // Dla konta imię leży w profiles (RLS: using(auth.uid() = id)), więc czyta je
  // klient administracyjny — dokładnie jak getReviewsForBucket. Dla gościa
  // guest_name jest wprost w wierszu. Rozstrzyga authorNameOf, żeby podpis
  // w mailu i podpis na stronie brały się z jednej reguły.
  let fullName: string | null = null;
  if (r.user_id) {
    const { data: profil } = await admin
      .from("profiles")
      .select("full_name")
      .eq("id", r.user_id)
      .maybeSingle();
    fullName = (profil as { full_name: string | null } | null)?.full_name ?? null;
  }

  return {
    id: r.id,
    rating: r.rating,
    comment: r.comment,
    created_at: r.created_at,
    author_name: authorNameOf(r, fullName),
    product_name: r.products?.name ?? null,
  };
}

// Plakietka „do przejrzenia": opinia JEST już publiczna, więc to nie jest
// kolejka blokująca klienta — to lista rzeczy, na które nikt jeszcze nie
// spojrzał. Ten sam wzorzec, co getNewOrdersCount (orders.status_updated_at).
// Filtr MUSI zostać zsynchronizowany z gałęzią „nowe" w getReviewsForBucket
// (i z reviewBucket() w reviews-moderation.ts) — to jeden warunek zapisany
// w trzech miejscach, nie dwie niezależne definicje „nieprzejrzanej" opinii.
// `.neq("status","rejected")` broni wierszy sprzed migracji 78 (opinion
// published i odrzuconych zanim kolumna `moderated_at` została dodana) —
// bez niego trafiłyby do plakietki, mimo że panel je odsiewał już wcześniej.
export async function getUnreviewedReviewsCount(): Promise<number> {
  const admin = await createAdminClient();
  const { count, error } = await admin
    .from("product_reviews")
    .select("id", { count: "exact", head: true })
    .or("moderated_at.is.null,status.eq.pending")
    .neq("status", "rejected");
  if (error) {
    // Plakietka nie może wywalić panelu — layout renderuje się na każdej
    // podstronie. Spójne z getNewOrdersCount.
    console.error("[admin] odczyt licznika opinii nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}
