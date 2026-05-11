"use server";

import { validatePromoCode } from "@/app/_lib/promo";

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
