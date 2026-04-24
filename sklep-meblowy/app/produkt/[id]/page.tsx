import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProduct, getRelatedProducts } from "@/app/_lib/products";
import { getCategoryLabel } from "@/app/_lib/categories";
import {
  getProductRating,
  getReviewsForProduct,
  getReviewStatus,
} from "@/app/_lib/reviews";
import ImageGallery from "@/app/_components/ui/ImageGallery";
import ProductActions from "@/app/_components/ui/ProductActions";
import ProductCard from "@/app/_components/ui/ProductCard";
import StarRating from "@/app/_components/ui/StarRating";
import ReviewList from "@/app/_components/ui/ReviewList";
import ReviewForm from "@/app/_components/ui/ReviewForm";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: "Produkt nie znaleziony" };
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      images: product.images?.[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProduktPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const [related, rating, reviews, reviewStatus] = await Promise.all([
    getRelatedProducts(product.id, product.category),
    getProductRating(product.id),
    getReviewsForProduct(product.id),
    getReviewStatus(product.id),
  ]);

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

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
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
          {getCategoryLabel(product.category) ?? product.category}
        </a>
        <span>/</span>
        <span className="text-[var(--fg)] normal-case tracking-normal">{product.name}</span>
      </nav>

      {/* Główna sekcja */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-24">
        <ImageGallery images={product.images} name={product.name} />

        <div className="flex flex-col gap-8">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
              {getCategoryLabel(product.category) ?? product.category}
            </p>
            <h1 className="font-display text-4xl font-bold text-[var(--fg)] leading-tight mb-4">
              {product.name}
            </h1>

            {rating.count > 0 && (
              <a
                href="#opinie"
                className="inline-flex items-center gap-2 mb-3 text-sm text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
              >
                <StarRating value={rating.average} size={16} />
                <span>
                  {rating.average.toFixed(1)} ({rating.count}{" "}
                  {rating.count === 1 ? "opinia" : rating.count < 5 ? "opinie" : "opinii"})
                </span>
              </a>
            )}

            <p className="font-sans text-3xl font-bold text-[var(--fg)]">
              {product.price.toLocaleString("pl-PL")} zł
            </p>
          </div>

          <p className="text-[var(--muted)] leading-relaxed">{product.description}</p>

          <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
            <span className="w-2 h-2 rounded-full bg-[var(--color-gold)]" />
            <span>
              Produkt wykonywany na zamówienie
              {product.delivery_time && (
                <>
                  {" "}• Realizacja: <strong className="text-[var(--fg)]">{product.delivery_time}</strong>
                </>
              )}
            </span>
          </div>

          <ProductActions product={product} />

          <div className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)] space-y-2">
            <p>✓ Darmowa dostawa od 2000 zł</p>
            <p>✓ Zwrot do 30 dni</p>
            <p>✓ Gwarancja 2 lata</p>
          </div>
        </div>
      </div>

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
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
