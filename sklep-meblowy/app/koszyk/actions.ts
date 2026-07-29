"use server";

import { validatePromoCode } from "@/app/_lib/promo";
import { getSizeMatchedCrossSell } from "@/app/_lib/products";
import { sleepSizeOf } from "@/app/_lib/sleep-size";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import { getCategories } from "@/app/_lib/categories";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
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
  const locale = await getLocale();
  const result = await validatePromoCode(rawCode, cartTotal, locale);
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

export type BundleTermsResult = Record<
  string,
  { discountType: "percent" | "amount"; discountValue: number } | null
>;

// Aktualne warunki rabatu zestawów po id (do re-walidacji koszyka — koszyk
// snapshotuje je w localStorage, admin mógł je zmienić). null = zestaw
// nieaktywny lub usunięty (checkout i tak odrzuci, tu tylko sygnał do UI).
export async function revalidateBundleTermsAction(
  bundleIds: string[]
): Promise<BundleTermsResult> {
  const out: BundleTermsResult = {};
  if (bundleIds.length === 0) return out;
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("bundles")
    .select("id, discount_type, discount_value, is_active")
    .in("id", bundleIds);
  for (const id of bundleIds) out[id] = null;
  for (const b of (data ?? []) as {
    id: string;
    discount_type: "percent" | "amount";
    discount_value: number;
    is_active: boolean;
  }[]) {
    out[b.id] = b.is_active
      ? { discountType: b.discount_type, discountValue: Number(b.discount_value) }
      : null;
  }
  return out;
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

  // Kategoria ORAZ rozmiar spania każdej pozycji lecą z bazy, nie z
  // localStorage: klient trzyma tylko id/name/category, a rozmiar jest
  // potrzebny do dopasowania materacy (łóżko 140×200 → materace 140×200).
  // Czytanie z DB zamiast z przekazanej nazwy jest też odporne na przestarzały
  // wpis w localStorage.
  const cartProductIds = items.map((i) => i.id);
  const supabase = await createAdminClient();
  const { data: rows } = await supabase
    .from("products")
    .select("id, category, name, size_label")
    .in("id", cartProductIds);

  const resolved = (rows ?? []) as {
    id: string;
    category: string;
    name: string;
    size_label: string | null;
  }[];

  const cartCategories = Array.from(
    new Set(
      // Fallback do kategorii z localStorage dla pozycji, których nie ma już
      // w bazie (produkt usunięty/ukryty) — zachowanie jak dotychczas.
      [
        ...resolved.map((r) => r.category),
        ...items.map((i) => i.category).filter((c): c is string => !!c),
      ].filter(Boolean)
    )
  );

  // Rozmiary łóżek w koszyku. Kilka pozycji → kilka rozmiarów; materac pasujący
  // do któregokolwiek z nich jest sensowną propozycją.
  const cartSizes = Array.from(
    new Set(
      resolved
        .map((r) => sleepSizeOf(r))
        .filter((s): s is string => s !== null)
    )
  );

  const locale = await getLocale();
  const { products } = await getSizeMatchedCrossSell(
    cartCategories,
    cartSizes,
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
