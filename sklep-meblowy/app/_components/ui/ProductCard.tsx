import Link from "next/link";
import Image from "next/image";
import type { Product, ProductRating } from "@/app/_lib/types";
import AddToCartButton from "./AddToCartButton";
import StarRating from "./StarRating";
import WishlistButton from "./WishlistButton";

export default function ProductCard({
  product,
  rating,
  badge,
  categoryLabel,
  isInWishlist = false,
}: {
  product: Product;
  rating?: ProductRating;
  // Opcjonalny badge zastępujący domyślne "Na zamówienie"
  // (używane w sekcji "Polecane" na home: "Bestseller", "Nowość" etc.).
  badge?: string | null;
  // Etykieta kategorii. Bez niej wyświetlamy surowy slug — używane
  // w client components (np. cross-sell w /koszyk) które nie mogą
  // robić async fetch w trakcie renderu.
  categoryLabel?: string;
  // Czy produkt jest na liście ulubionych zalogowanego usera.
  // Default false — niezalogowani widzą puste serce.
  isInWishlist?: boolean;
}) {
  const image = product.images?.[0];

  return (
    <div className="group flex flex-col">
      <div className="relative aspect-[4/3] bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden mb-4">
        <Link href={`/produkt/${product.id}`} className="block absolute inset-0">
          {image ? (
            <Image
              src={image}
              alt={product.name}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
              className="object-cover group-hover:scale-105 transition-transform duration-500"
            />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-sm">
              Brak zdjęcia
            </div>
          )}
          <span className="absolute top-4 left-4 px-3 py-1 bg-[var(--color-gold)] text-[var(--color-navy)] text-[10px] font-sans font-semibold uppercase tracking-widest rounded-full">
            {badge || "Na zamówienie"}
          </span>
        </Link>
        <WishlistButton
          productId={product.id}
          initialIsInWishlist={isInWishlist}
          variant="card"
        />
      </div>

      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-1">
        {categoryLabel ?? product.category}
      </p>
      <Link href={`/produkt/${product.id}`}>
        <p className="font-display text-lg font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors mb-2 leading-snug">
          {product.name}
        </p>
      </Link>
      {rating && rating.count > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <StarRating value={rating.average} size={12} />
          <span className="text-xs text-[var(--muted)]">({rating.count})</span>
        </div>
      )}
      <div className="flex items-center justify-between mt-auto">
        <p className="font-sans font-bold text-[var(--fg)]">
          {product.price.toLocaleString("pl-PL")} zł
        </p>
        <AddToCartButton product={product} compact />
      </div>
    </div>
  );
}
