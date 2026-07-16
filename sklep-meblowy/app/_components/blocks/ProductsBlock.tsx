import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import ProductCard from "@/app/_components/ui/ProductCard";
import { getBlockProducts } from "@/app/_lib/block-products";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import { getEurRate } from "@/app/_lib/store-settings";
import { getCategories } from "@/app/_lib/categories";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Locale } from "@/app/_lib/i18n";
import type { LocalizedProductsContent } from "@/app/_lib/blocks";

export default async function ProductsBlock({
  content,
  locale,
}: {
  content: LocalizedProductsContent;
  locale: Locale;
}) {
  const t = getDictionary(locale);
  const [products, wishlistIds, rate, categories] = await Promise.all([
    getBlockProducts(content, locale),
    getUserWishlistIds(), // React.cache — deduplikacja z resztą strony
    getEurRate(),
    getCategories(locale),
  ]);
  if (products.length === 0) return null;
  const categoryLabels = new Map(categories.map((c) => [c.slug, c.label]));

  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between mb-16">
          <div>
            {content.heading && (
              <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
                {content.heading}
              </h2>
            )}
          </div>
          <LocalizedLink
            href="/sklep"
            className="hidden md:inline-flex text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
          >
            {t.home.seeAll}
          </LocalizedLink>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              categoryLabel={categoryLabels.get(product.category)}
              isInWishlist={wishlistIds.has(product.id)}
              locale={locale}
              rate={rate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
