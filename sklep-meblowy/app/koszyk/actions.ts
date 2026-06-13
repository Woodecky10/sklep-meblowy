"use server";

import { validatePromoCode } from "@/app/_lib/promo";
import { getCrossSellProducts } from "@/app/_lib/products";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import { getCategories } from "@/app/_lib/categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n";
import type { Product } from "@/app/_lib/types";

export type PromoApplyResult =
  | {
      ok: true;
      promoId: string;
      code: string;
      discount: number;
      discountType: "percent" | "fixed";
      discountValue: number;
    }
  | { ok: false; error: string };

// Wywoływane z koszyka i checkout — waliduje kod, zwraca info do UI.
// Autorytatywna walidacja powtarza się w /api/checkout (klient nie ufa
// wynikom tego call, server policzy total ponownie z DB ceny produktów).
export async function applyPromoCodeAction(
  rawCode: string,
  cartTotal: number
): Promise<PromoApplyResult> {
  const result = await validatePromoCode(rawCode, cartTotal);
  if (!result.ok) return result;
  return {
    ok: true,
    promoId: result.promo.id,
    code: result.promo.code,
    discount: result.discount,
    discountType: result.promo.discount_type,
    discountValue: result.promo.discount_value,
  };
}

// ============================================================
// Cross-sell dla koszyka — "Może Cię zainteresować"
// ============================================================
// Klient wysyła listę {id, category}. Dla items bez category (stare
// localStorage entry sprzed dodania pola) próbujemy uzupełnić z DB.
// Zwraca do 4 produktów z kategorii cross-sell + ids tych, które są
// w ulubionych zalogowanego usera (koszyk to client component i nie może
// sam pobrać wishlisty server-side — audyt 2026-06-11 MEDIUM: bez tego
// karta pokazywała puste serce, a klik USUWAŁ produkt z ulubionych).
export type CartCrossSellResult = {
  products: Product[];
  wishlistIds: string[];
  // Mapa slug→label dla kategorii poleconych produktów. Koszyk to client
  // component i nie zrobi async lookupu w renderze — bez tego karta pokazuje
  // surowy slug "lozko-tapicerowane" zamiast "Łóżka tapicerowane" (audyt LOW).
  categoryLabels: Record<string, string>;
};

export async function getCartCrossSellAction(
  items: { id: string; category?: string }[]
): Promise<CartCrossSellResult> {
  if (items.length === 0)
    return { products: [], wishlistIds: [], categoryLabels: {} };

  // Uzupełnij brakujące category z DB
  const missing = items.filter((i) => !i.category).map((i) => i.id);
  let resolved: { id: string; category: string }[] = items
    .filter((i): i is { id: string; category: string } => !!i.category)
    .map((i) => ({ id: i.id, category: i.category }));

  if (missing.length > 0) {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("products")
      .select("id, category")
      .in("id", missing);
    resolved = [
      ...resolved,
      ...((data ?? []) as { id: string; category: string }[]),
    ];
  }

  const cartCategories = Array.from(
    new Set(resolved.map((r) => r.category).filter(Boolean))
  );
  const cartProductIds = items.map((i) => i.id);

  const locale = await getLocale();
  const products = await getCrossSellProducts(
    cartCategories,
    cartProductIds,
    4,
    locale
  );

  // Które z poleconych produktów są już w ulubionych usera. getUserWishlistIds
  // zwraca pusty Set dla niezalogowanego — wtedy wishlistIds = [].
  const userWishlist = await getUserWishlistIds();
  const wishlistIds = products
    .filter((p) => userWishlist.has(p.id))
    .map((p) => p.id);

  // Etykiety kategorii poleconych produktów (getCategories jest cache'owane).
  const labelBySlug = new Map(
    (await getCategories(locale)).map((c) => [c.slug, c.label])
  );
  const categoryLabels: Record<string, string> = {};
  for (const p of products) {
    const label = labelBySlug.get(p.category);
    if (label) categoryLabels[p.category] = label;
  }

  return { products, wishlistIds, categoryLabels };
}
