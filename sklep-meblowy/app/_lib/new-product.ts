// Czysta walidacja + payload nowego produktu (bez importu supabase/next),
// żeby logika tworzenia była testowalna w izolacji. Akcja createProduct
// woła to i robi sam insert. Payload castowany `as never` przy insercie
// (Product type nie zawiera kolumn needs_translation/_de).

import type {
  ProductVariants,
  ProductDimensions,
  ProductFeature,
  ProductDescriptionSection,
} from "./types";
import {
  applyCornerSideSelection,
  CORNER_SIDE_DEFAULT_CATEGORY,
} from "./corner-side";
import { DEFAULT_DELIVERY_TIME, DEFAULT_WARRANTY } from "./spec-format";

export type NewProductPayload = {
  name: string;
  price: number;
  category: string;
  description: string;
  images: string[];
  stock: number;
  features: { key: string; value: string }[];
  description_sections: unknown[];
  variants: ProductVariants | null;
  color: null;
  material: null;
  dimensions: null;
  weight: null;
  construction: null;
  delivery_time: string;
  warranty: string;
  collection_id: null;
  is_active: boolean;
  needs_translation: boolean;
  sale_price: null;
  omnibus_price: null;
};

export function buildNewProductPayload(input: {
  name: unknown;
  price: unknown;
  category: unknown;
}): { ok: true; payload: NewProductPayload } | { ok: false; error: string } {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name) return { ok: false, error: "Podaj nazwę produktu" };
  if (name.length > 300)
    return { ok: false, error: "Nazwa jest za długa (max 300 znaków)" };

  const category =
    typeof input.category === "string" ? input.category.trim() : "";
  if (!category) return { ok: false, error: "Wybierz kategorię" };

  let price: number;
  if (typeof input.price === "number") {
    price = input.price;
  } else if (typeof input.price === "string" && input.price.trim() !== "") {
    price = Number(input.price.replace(",", "."));
  } else {
    return { ok: false, error: "Podaj cenę" };
  }
  if (!Number.isFinite(price) || price < 0) {
    return { ok: false, error: "Cena musi być liczbą ≥ 0" };
  }

  return {
    ok: true,
    payload: {
      name,
      price,
      category,
      description: "",
      images: [],
      stock: 0,
      features: [],
      description_sections: [],
      // Narożniki L dostają wybór strony domyślnie (decyzja: opt-out w adminie).
      variants:
        category === CORNER_SIDE_DEFAULT_CATEGORY
          ? applyCornerSideSelection(null, true)
          : null,
      color: null,
      material: null,
      dimensions: null,
      weight: null,
      construction: null,
      delivery_time: DEFAULT_DELIVERY_TIME,
      warranty: DEFAULT_WARRANTY,
      collection_id: null,
      is_active: true,
      needs_translation: true,
      sale_price: null,
      omnibus_price: null,
    },
  };
}

// ============================================================
// Duplikacja oferty (admin)
// ============================================================
// Wiersz źródłowy (z DB) potrzebny do zbudowania kopii. Zawiera pola _de i
// kolumny spoza publicznego typu Product — dlatego osobny typ.
export type DuplicateSource = {
  name: string;
  description: string;
  price: number;
  sale_price: number | null;
  category: string;
  images: string[];
  stock: number;
  color: string | null;
  material: string | null;
  dimensions: ProductDimensions | null;
  weight: number | null;
  construction: string | null;
  delivery_time: string | null;
  warranty: string | null;
  collection_id: string | null;
  features: ProductFeature[];
  description_sections: ProductDescriptionSection[];
  variants: ProductVariants | null;
  name_de: string | null;
  description_de: string | null;
  description_sections_de: unknown;
  color_de: string | null;
  material_de: string | null;
  needs_translation: boolean;
  translated_at: string | null;
  // Kopiowane tylko po to, by mieć pełny wiersz z DB — buildDuplicatePayload
  // je świadomie RESETUJE (nie mogą przejść do kopii).
  size_group: string | null;
  size_label: string | null;
  omnibus_price: number | null;
};

// Payload INSERTa duplikatu. Bez id/created_at — zostają defaulty DB.
export type DuplicateProductPayload = Omit<
  DuplicateSource,
  "size_group" | "size_label" | "omnibus_price"
> & {
  is_active: boolean;
  deactivation_source: "manual";
  size_group: null;
  size_label: null;
  omnibus_price: null;
};

// Buduje payload duplikatu wg reguł ze spec-a:
// - nazwa + „ (kopia)"; cała treść/warianty/cechy/sekcje/pola DE kopiowane 1:1,
// - zdjęcia współdzielone (te same URL-e — patrz imageUrlsToDelete przy usuwaniu),
// - ukryty szkic (is_active=false, deactivation_source='manual'),
// - size_group/size_label wyzerowane (grupę ustawia linkowanie, rozmiar to nowy),
// - omnibus_price wyzerowane (nowa oferta nie dziedziczy „najniższej z 30 dni" —
//   zgodność z Omnibusem; historię cen zaczynamy od zera po insercie).
export function buildDuplicatePayload(
  source: DuplicateSource
): DuplicateProductPayload {
  return {
    name: `${source.name} (kopia)`,
    description: source.description,
    price: source.price,
    sale_price: source.sale_price,
    category: source.category,
    images: [...source.images],
    stock: source.stock,
    color: source.color,
    material: source.material,
    dimensions: source.dimensions,
    weight: source.weight,
    construction: source.construction,
    delivery_time: source.delivery_time,
    warranty: source.warranty,
    collection_id: source.collection_id,
    features: source.features,
    description_sections: source.description_sections,
    variants: source.variants,
    name_de: source.name_de,
    description_de: source.description_de,
    description_sections_de: source.description_sections_de,
    color_de: source.color_de,
    material_de: source.material_de,
    needs_translation: source.needs_translation,
    translated_at: source.translated_at,
    is_active: false,
    deactivation_source: "manual",
    size_group: null,
    size_label: null,
    omnibus_price: null,
  };
}
