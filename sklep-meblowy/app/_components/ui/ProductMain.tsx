"use client";

import { useState } from "react";
import type { Product, ProductRating } from "@/app/_lib/types";
import { getVariantImages } from "@/app/_lib/variants";
import ImageGallery from "./ImageGallery";
import ProductActions from "./ProductActions";
import StarRating from "./StarRating";

// Główna sekcja strony produktu: zdjęcia po lewej, info + akcje po prawej.
// Trzyma state wybranego wariantu — żeby galeria mogła pokazać zdjęcia
// odpowiadające wariantowi (gdy admin je przypisał w panelu).
export default function ProductMain({
  product,
  categoryLabel,
  rating,
  description,
}: {
  product: Product;
  categoryLabel: string;
  rating: ProductRating;
  description: string;
}) {
  const [selected, setSelected] = useState<Record<string, string>>({});
  const galleryImages = getVariantImages(product, selected);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-24">
      <ImageGallery images={galleryImages} name={product.name} />

      <div className="flex flex-col gap-8">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
            {categoryLabel}
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
                {rating.count === 1
                  ? "opinia"
                  : rating.count < 5
                  ? "opinie"
                  : "opinii"})
              </span>
            </a>
          )}

          <p className="font-sans text-3xl font-bold text-[var(--fg)]">
            {product.price.toLocaleString("pl-PL")} zł
          </p>
        </div>

        <div className="text-[var(--muted)] leading-relaxed whitespace-pre-line">
          {description}
        </div>

        <div className="inline-flex items-center gap-2 text-sm text-[var(--muted)]">
          <span className="w-2 h-2 rounded-full bg-[var(--color-gold)]" />
          <span>
            Produkt wykonywany na zamówienie
            {product.delivery_time && (
              <>
                {" "}
                • Realizacja:{" "}
                <strong className="text-[var(--fg)]">
                  {product.delivery_time}
                </strong>
              </>
            )}
          </span>
        </div>

        <ProductActions
          product={product}
          selected={selected}
          onSelectedChange={setSelected}
        />

        <div className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)] space-y-2">
          <p>✓ Zwrot do 30 dni</p>
          <p>✓ Gwarancja 2 lata</p>
        </div>
      </div>
    </div>
  );
}
