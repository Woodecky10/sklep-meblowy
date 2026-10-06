"use client";

import type { Product } from "@/app/_lib/types";
import {
  hasVariants,
  isVariantSelectionComplete,
  getVariantEffectivePrice,
} from "@/app/_lib/variants";
import VariantSelector from "./VariantSelector";
import AddToCartButton from "./AddToCartButton";
import CarryInOption from "./CarryInOption";
import { carryInSurcharge, hasCarryIn, setCarryIn } from "@/app/_lib/carry-in";

// Produkty robione na zamówienie — bez limitów magazynowych.
// Walidujemy tylko kompletność wyboru wariantu i liczymy dynamiczną cenę
// z ewentualnym modyfikatorem (np. droższy kolor).
//
// Komponent jest kontrolowany — selected/onChange trzyma parent
// (ProductMainSection), żeby galeria zdjęć mogła reagować na wybór wariantu.
export default function ProductActions({
  product,
  selected,
  onChange,
  addToCartLabel,
  selectVariantLabel,
  buyNowLabel,
}: {
  product: Product;
  selected: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  // Zlokalizowane etykiety CTA — przekazywane z ProductMainSection (client),
  // bo komponenty "use client" nie wołają getLocale().
  addToCartLabel?: string;
  selectVariantLabel?: string;
  buyNowLabel?: string;
}) {
  const showVariants = hasVariants(product);
  const complete = isVariantSelectionComplete(product, selected);
  // Cena do koszyka = wariant (z promocją) + wniesienie. Cena WYŚWIETLANA
  // w ProductMainSection celowo bez wniesienia (Omnibus dotyczy mebla).
  const price = getVariantEffectivePrice(product, selected) + carryInSurcharge(selected);

  return (
    <div className="flex flex-col gap-6">
      {/* Cenę (jedną, aktualną dla wybranego wariantu) wyświetla parent
          (ProductMainSection) — bez przekreślania bazowej: wzrost ceny
          wariantu wyglądał jak odwrócona promocja. */}
      {showVariants && (
        <VariantSelector
          product={product}
          variants={product.variants!}
          selected={selected}
          onChange={onChange}
        />
      )}

      <CarryInOption
        checked={hasCarryIn(selected)}
        onChange={(on) => onChange(setCarryIn(selected, on))}
      />

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        needsVariant={showVariants && !complete}
        addToCartLabel={addToCartLabel}
        selectVariantLabel={selectVariantLabel}
      />

      <AddToCartButton
        product={product}
        selectedValues={selected}
        currentPrice={price}
        needsVariant={showVariants && !complete}
        buyNow
        buyNowLabel={buyNowLabel}
      />
    </div>
  );
}
