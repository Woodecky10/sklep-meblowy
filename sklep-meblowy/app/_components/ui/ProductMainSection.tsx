"use client";

import { useState } from "react";
import type { Product, ProductRating } from "@/app/_lib/types";
import { getVariantImages, getVariantPrice } from "@/app/_lib/variants";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";
import ImageGallery from "./ImageGallery";
import ProductActions from "./ProductActions";
import StarRating from "./StarRating";
import InquiryModal from "./InquiryModal";

// Client wrapper łączący galerię i akcje, żeby wybór wariantu mógł
// jednocześnie zmieniać zdjęcia (galeria) i cenę / przycisk dodaj-do-koszyka
// (ProductActions). Trzyma `selected` lokalnie i przekazuje obu stronom.
//
// Specyfikacja produktu (lista cech) renderuje się w LEWEJ kolumnie pod galerią
// — wypełnia pustą przestrzeń gdy prawa kolumna (akcje + warianty + info)
// jest dłuższa od galerii. Przekazana jako prop z page.tsx żeby zachować
// jeden punkt prawdy o cechach.
export default function ProductMainSection({
  product,
  categoryLabel,
  rating,
  specifications,
}: {
  product: Product;
  categoryLabel: string | null;
  rating: ProductRating;
  // Cechy produktu w sekcji "Specyfikacja" — Wymiary, Waga, Materiał, etc.
  // plus dodatkowe features z importu. Renderowane w lewej kolumnie pod galerią.
  specifications: { label: string; value: string }[];
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const images = getVariantImages(product, selected);
  // Jedna, aktualna cena: bazowa przed wyborem wariantu, z modyfikatorem po
  // wyborze. Bez przekreśleń — zmiana ceny wariantu to nie promocja.
  const currentPrice = getVariantPrice(product, selected);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-16">
      <div className="flex flex-col gap-8">
        <ImageGallery images={images} name={product.name} />

        {specifications.length > 0 && (
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.product.specificationEyebrow}
            </p>
            <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-5">
              {t.product.specificationHeading}
            </h2>
            <dl className="flex flex-col">
              {specifications.map((s) => (
                <div
                  key={s.label}
                  className="flex justify-between gap-6 py-3 border-b border-[var(--border)] last:border-b-0"
                >
                  <dt className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] shrink-0 pt-0.5">
                    {s.label}
                  </dt>
                  <dd className="text-sm text-[var(--fg)] text-right">
                    {s.value}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-8">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
            {categoryLabel ?? product.category}
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
                  ? t.product.reviewOne
                  : rating.count < 5
                    ? t.product.reviewFew
                    : t.product.reviewMany})
              </span>
            </a>
          )}

          <p className="font-sans text-3xl font-bold text-[var(--fg)]">
            {formatMoney(currentPrice, locale, rate)}
          </p>
        </div>

        <ProductActions
          product={product}
          selected={selected}
          onChange={setSelected}
          addToCartLabel={t.product.addToCart}
          selectVariantLabel={t.product.selectVariant}
        />

        <InquiryModal
          productId={product.id}
          productName={product.name}
          triggerLabel={t.product.inquireColors}
        />

        <div className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)] space-y-2">
          <p>✓ {t.product.returns}</p>
          <p>✓ {t.product.warranty}</p>
          <p>
            ✓ {t.product.deliveryTimeLabel}{" "}
            <strong className="text-[var(--fg)]">
              {product.delivery_time || t.product.deliveryTimeDefault}
            </strong>
          </p>
        </div>
      </div>
    </div>
  );
}
