import Link from "next/link";
import Image from "next/image";
import type { Product } from "@/app/_lib/types";
import { getCategoryLabel } from "@/app/_lib/categories";
import AddToCartButton from "./AddToCartButton";

export default function ProductCard({ product }: { product: Product }) {
  const image = product.images?.[0];

  return (
    <div className="group flex flex-col">
      <Link href={`/produkt/${product.id}`} className="block">
        <div className="relative aspect-[4/5] bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden mb-4">
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
          {product.stock === 0 && (
            <span className="absolute top-4 left-4 px-3 py-1 bg-black/70 text-white text-xs font-sans rounded-full">
              Wyprzedane
            </span>
          )}
        </div>
      </Link>

      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-1">
        {getCategoryLabel(product.category) ?? product.category}
      </p>
      <Link href={`/produkt/${product.id}`}>
        <p className="font-display text-lg font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors mb-2 leading-snug">
          {product.name}
        </p>
      </Link>
      <div className="flex items-center justify-between mt-auto">
        <p className="font-sans font-bold text-[var(--fg)]">
          {product.price.toLocaleString("pl-PL")} zł
        </p>
        <AddToCartButton product={product} compact />
      </div>
    </div>
  );
}
