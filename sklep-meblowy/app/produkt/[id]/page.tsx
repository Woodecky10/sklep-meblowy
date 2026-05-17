import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getProduct,
  getRelatedProducts,
  getCrossSellProducts,
} from "@/app/_lib/products";
import { getCategoryLabel, getAllCategories } from "@/app/_lib/categories";
import { getCollection, getCollectionSiblings } from "@/app/_lib/collections";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import {
  getProductRating,
  getReviewsForProduct,
  getReviewStatus,
} from "@/app/_lib/reviews";
import ProductMainSection from "@/app/_components/ui/ProductMainSection";
import ProductCard from "@/app/_components/ui/ProductCard";
import StarRating from "@/app/_components/ui/StarRating";
import ReviewList from "@/app/_components/ui/ReviewList";
import ReviewForm from "@/app/_components/ui/ReviewForm";
import {
  sanitizeProductHtml,
  extractShortDescription,
} from "@/app/_lib/product-html";
import { COMPANY } from "@/app/_lib/company";

type Props = { params: Promise<{ id: string }> };

// Strip HTML tagów dla meta description (Google nie chce tagów w meta).
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: "Produkt nie znaleziony" };
  return {
    title: product.name,
    // Meta description = plain text (bez HTML, max 160 znaków)
    description: stripHtml(product.description).slice(0, 160),
    openGraph: {
      images: product.images?.[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProduktPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [related, rating, reviews, reviewStatus, categoryLabel, allCategories, crossSell, wishlistIds] =
    await Promise.all([
      getRelatedProducts(product.id, product.category),
      getProductRating(product.id),
      getReviewsForProduct(product.id),
      getReviewStatus(product.id),
      getCategoryLabel(product.category),
      getAllCategories(),
      getCrossSellProducts([product.category], [product.id], 4),
      getUserWishlistIds(),
    ]);

  // Etykieta cross-sell pochodzi z LABELA pierwszej cross_sell_categories tej
  // kategorii — np. dla łóżek pokaże "Polecane materace".
  const currentCat = allCategories.find((c) => c.slug === product.category);
  const crossSellTargetSlug = currentCat?.crossSellCategories?.[0];
  const crossSellLabel = crossSellTargetSlug
    ? allCategories.find((c) => c.slug === crossSellTargetSlug)?.label ?? null
    : null;

  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));

  // Kolekcja: jeśli produkt jest w kolekcji, pobierz inne produkty z niej.
  const [collection, collectionSiblings] = product.collection_id
    ? await Promise.all([
        getCollection(product.collection_id),
        getCollectionSiblings(product.collection_id, product.id, 8),
      ])
    : [null, []];

  const details: { label: string; value: string }[] = [];
  if (product.dimensions) {
    const { width, depth, height } = product.dimensions;
    details.push({
      label: "Wymiary",
      value: `${width} × ${depth} × ${height} cm (szer. × gł. × wys.)`,
    });
  }
  if (product.weight !== null && product.weight !== undefined) {
    details.push({ label: "Waga", value: `${product.weight} kg` });
  }
  if (product.material) {
    details.push({ label: "Materiał", value: product.material });
  }
  if (product.color) {
    details.push({ label: "Kolor bazowy", value: product.color });
  }
  if (product.construction) {
    details.push({ label: "Konstrukcja", value: product.construction });
  }
  if (product.delivery_time) {
    details.push({ label: "Czas realizacji", value: product.delivery_time });
  }
  if (product.warranty) {
    details.push({ label: "Gwarancja", value: product.warranty });
  }

  // Structured data dla Google (schema.org/Product) — rich snippets w SERP-ach:
  // cena, dostępność, gwiazdki/ocena prosto w wynikach wyszukiwania.
  // Plain text description (bez HTML tagów) wymagany przez Google.
  const plainDescription = stripHtml(product.description).slice(0, 5000);
  const productUrl = `https://${COMPANY.domain}/produkt/${product.id}`;
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: plainDescription,
    image: product.images ?? [],
    sku: product.baselinker_id ?? product.id,
    brand: {
      "@type": "Brand",
      name: COMPANY.brandName,
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "PLN",
      price: product.price.toFixed(2),
      // Meble robione na zamówienie — zawsze "dostępne", BL realizuje.
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (rating && rating.count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.average.toFixed(1),
      reviewCount: rating.count,
      bestRating: "5",
      worstRating: "1",
    };
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-sans text-[var(--muted)] mb-12 uppercase tracking-widest">
        <a href="/" className="hover:text-[var(--color-gold)] transition-colors">Dom</a>
        <span>/</span>
        <a href="/sklep" className="hover:text-[var(--color-gold)] transition-colors">Sklep</a>
        <span>/</span>
        <a
          href={`/sklep?kategoria=${product.category}`}
          className="hover:text-[var(--color-gold)] transition-colors"
        >
          {categoryLabel ?? product.category}
        </a>
        <span>/</span>
        <span className="text-[var(--fg)] normal-case tracking-normal">{product.name}</span>
      </nav>

      {/* Główna sekcja (client wrapper — galeria reaguje na wybór wariantu) */}
      <ProductMainSection
        product={product}
        categoryLabel={categoryLabel ?? null}
        rating={rating}
        descriptionText={extractShortDescription(product.description)}
      />

      {/* Sekcja Szczegóły */}
      {details.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Specyfikacja
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              Szczegóły produktu
            </h2>
          </div>
          <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-4 max-w-4xl">
            {details.map((d) => (
              <div
                key={d.label}
                className="flex justify-between gap-6 py-3 border-b border-[var(--border)]"
              >
                <dt className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] shrink-0 pt-1">
                  {d.label}
                </dt>
                <dd className="text-sm text-[var(--fg)] text-right">{d.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* Sekcja: pełen opis HTML (z BL / admina, sanitized) */}
      {product.description && product.description.trim().length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Pełny opis
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              Opis produktu
            </h2>
          </div>
          <div
            className="product-description max-w-4xl text-[var(--fg)] leading-relaxed"
            dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.description) }}
          />
        </section>
      )}

      {/* Cross-sell — np. dla łóżka pokaż "Polecane materace" */}
      {crossSell.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Dopełnienie
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {crossSellLabel ? `Polecane ${crossSellLabel.toLowerCase()}` : "Może Cię zainteresować"}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {crossSell.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Pełna kolekcja — pozostałe produkty z tej samej serii */}
      {collection && collectionSiblings.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Pełna kolekcja
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {collection.label}
            </h2>
            {collection.description && (
              <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
                {collection.description}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {collectionSiblings.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} />
            ))}
          </div>
        </section>
      )}

      {/* Sekcja opinii */}
      <section id="opinie" className="mb-24 scroll-mt-24">
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Opinie
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              Co mówią klienci
            </h2>
          </div>
          {rating.count > 0 && (
            <div className="flex items-center gap-3">
              <StarRating value={rating.average} size={22} />
              <p className="font-sans text-lg font-bold text-[var(--fg)]">
                {rating.average.toFixed(1)}{" "}
                <span className="text-sm font-normal text-[var(--muted)]">
                  ({rating.count})
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
          <ReviewList reviews={reviews} />

          <aside>
            {reviewStatus.canReview ? (
              <ReviewForm
                productId={product.id}
                existingReview={reviewStatus.existingReview}
              />
            ) : (
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 text-sm text-[var(--muted)] leading-relaxed">
                {reviewStatus.reason === "not_logged_in" ? (
                  <>
                    Opinie mogą dodawać tylko osoby, które kupiły produkt.{" "}
                    <a href="/logowanie" className="text-[var(--color-gold)] underline">
                      Zaloguj się
                    </a>
                    , a jeśli ten produkt jest w Twoich zamówieniach, zobaczysz tu
                    formularz.
                  </>
                ) : (
                  <>
                    Opinię możesz dodać po dokonaniu zakupu tego produktu.
                    Weryfikujemy autentyczność opinii na podstawie historii
                    zamówień.
                  </>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* Podobne produkty */}
      {related.length > 0 && (
        <section>
          <div className="mb-10">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Zobacz też
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              Podobne produkty
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
