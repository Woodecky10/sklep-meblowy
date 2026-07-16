"use client";

import { useState } from "react";
import type { Product, ProductRating, BundleWithComponents } from "@/app/_lib/types";
import {
  getVariantImages,
  getVariantPrice,
  getVariantEffectivePrice,
  getVariantOmnibus,
  isVariantOnSale,
} from "@/app/_lib/variants";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { pluralForm } from "@/app/_lib/plural";
import { useEurRate } from "@/app/_lib/rate-context";
import ImageGallery from "./ImageGallery";
import ProductActions from "./ProductActions";
import SizeSelector from "./SizeSelector";
import type { SizeOption } from "@/app/_lib/size-groups";
import StarRating from "./StarRating";
import InquiryModal from "./InquiryModal";
import BundleOffer from "./BundleOffer";
import LocalizedLink from "./LocalizedLink";

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
  sizeOptions,
  bundles,
}: {
  product: Product;
  categoryLabel: string | null;
  rating: ProductRating;
  // Cechy produktu w sekcji "Specyfikacja" — Wymiary, Waga, Materiał, etc.
  // plus dodatkowe features z importu. Renderowane w lewej kolumnie pod galerią.
  specifications: { label: string; value: string }[];
  sizeOptions: SizeOption[];
  // Zestawy zawierające ten produkt — box „Kup w zestawie" pod akcjami (above
  // the fold). Pusta lista = box się nie renderuje.
  bundles: BundleWithComponents[];
}) {
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const images = getVariantImages(product, selected);
  const regularPrice = getVariantPrice(product, selected);
  const effective = getVariantEffectivePrice(product, selected);
  const onSale = isVariantOnSale(product, selected);
  const omnibus = getVariantOmnibus(product, selected);

  // Polska/niemiecka liczba mnoga recenzji: 1 → "opinia", 2–4 → "opinie",
  // 5+ → "opinii". Wspólna reguła pluralizacji w _lib/plural.
  const reviewWord = (count: number) =>
    pluralForm(count, {
      one: t.product.reviewOne,
      few: t.product.reviewFew,
      many: t.product.reviewMany,
    });

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
                {reviewWord(rating.count)})
              </span>
            </a>
          )}

          {onSale ? (
            <div className="flex flex-col gap-1">
              <div className="flex items-baseline gap-3 flex-wrap">
                <span className="font-sans text-3xl font-bold text-[var(--fg)]">
                  {formatMoney(effective, locale, rate)}
                </span>
                <span className="font-sans text-lg text-[var(--muted)] line-through">
                  {formatMoney(regularPrice, locale, rate)}
                </span>
                <span className="px-2 py-0.5 bg-[var(--color-gold)] text-[var(--color-navy)] text-[10px] font-sans font-semibold uppercase tracking-widest rounded-full">
                  {t.product.saleBadge}
                </span>
              </div>
              {omnibus !== null && (
                <span className="text-xs text-[var(--muted)]">
                  {t.product.omnibusLabel}: {formatMoney(omnibus, locale, rate)}
                </span>
              )}
            </div>
          ) : (
            <p className="font-sans text-3xl font-bold text-[var(--fg)]">
              {formatMoney(regularPrice, locale, rate)}
            </p>
          )}
        </div>

        <SizeSelector options={sizeOptions} />

        <ProductActions
          product={product}
          selected={selected}
          onChange={setSelected}
          addToCartLabel={t.product.addToCart}
          selectVariantLabel={t.product.selectVariant}
        />

        <BundleOffer bundles={bundles} currentProduct={product} selected={selected} />

        <InquiryModal
          productId={product.id}
          productName={product.name}
          triggerLabel={t.product.inquireColors}
        />

        <div className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)] space-y-2">
          <p>✓ {t.product.returns}</p>
          <p>
            ✓ {t.product.warrantyLabel}{" "}
            <strong className="text-[var(--fg)]">
              {product.warranty || t.product.warrantyDefault}
            </strong>
          </p>
          <p>
            ✓ {t.product.deliveryTimeLabel}{" "}
            <strong className="text-[var(--fg)]">
              {product.delivery_time || t.product.deliveryTimeDefault}
            </strong>
          </p>
          <p>
            ✓ {t.product.deliveryCostNote}{" "}
            <LocalizedLink href="/dostawa" className="text-[var(--color-gold)] hover:underline">
              {t.product.deliveryCostLink}
            </LocalizedLink>
          </p>
        </div>
      </div>
    </div>
  );
}
