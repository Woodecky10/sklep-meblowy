import Link from "next/link";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { getWishlistProducts, getUserWishlistIds } from "@/app/_lib/wishlist";
import { getCategories } from "@/app/_lib/categories";
import { getLocale } from "@/app/_lib/i18n";
import ProductCard from "@/app/_components/ui/ProductCard";

export const metadata: Metadata = {
  title: "Ulubione",
};

export default async function WishlistPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/logowanie?next=/ulubione");

  const locale = await getLocale();
  const [products, wishlistIds, categories] = await Promise.all([
    getWishlistProducts(locale),
    getUserWishlistIds(),
    getCategories(locale),
  ]);
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.label]));

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Ulubione
        </h1>
        {products.length > 0 && (
          <p className="text-sm text-[var(--muted)] mt-2">
            {products.length}{" "}
            {products.length === 1
              ? "produkt"
              : products.length < 5
                ? "produkty"
                : "produktów"}
          </p>
        )}
      </div>

      {products.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-2xl p-12 text-center">
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-3">
            Twoja lista ulubionych jest pusta
          </h2>
          <p className="text-[var(--muted)] mb-6 max-w-md mx-auto">
            Klikaj serce na karcie produktu, żeby zachować swoje typy na
            później. Wrócisz do nich w każdej chwili tutaj.
          </p>
          <Link
            href="/sklep"
            className="inline-flex px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
          >
            Przeglądaj sklep
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryLabel={categoryLabels.get(product.category)}
              isInWishlist={wishlistIds.has(product.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
