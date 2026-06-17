// Czysta walidacja + payload nowego produktu (bez importu supabase/next),
// żeby logika tworzenia była testowalna w izolacji. Akcja createProduct
// woła to i robi sam insert. Payload castowany `as never` przy insercie
// (Product type nie zawiera kolumn needs_translation/_de).

export type NewProductPayload = {
  name: string;
  price: number;
  category: string;
  description: string;
  images: string[];
  stock: number;
  features: { key: string; value: string }[];
  description_sections: unknown[];
  variants: null;
  color: null;
  material: null;
  dimensions: null;
  weight: null;
  construction: null;
  delivery_time: null;
  warranty: null;
  collection_id: null;
  baselinker_id: null;
  is_active: boolean;
  needs_translation: boolean;
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
      variants: null,
      color: null,
      material: null,
      dimensions: null,
      weight: null,
      construction: null,
      delivery_time: null,
      warranty: null,
      collection_id: null,
      baselinker_id: null,
      is_active: true,
      needs_translation: true,
    },
  };
}
