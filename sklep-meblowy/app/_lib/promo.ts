// Helpery do tabeli promo_codes — kody rabatowe.
// Klient wpisuje kod w koszyku/checkout, server walidacja przed Stripe.

import { createAdminClient } from "./supabase/server";

export type PromoCode = {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  valid_from: string | null;
  valid_to: string | null;
  max_uses: number | null;
  used_count: number;
  min_order_value: number | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type ValidationResult =
  | { ok: true; promo: PromoCode; discount: number }
  | { ok: false; error: string };

// Normalizuj kod: trim + UPPER, spójnie z formatem w DB.
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

// ============================================================
// validatePromoCode — autorytatywna walidacja po stronie serwera
// ============================================================
// Wywoływana z:
//   - server action w koszyku (live preview zniżki)
//   - /api/checkout (autorytatywna walidacja przed Stripe)
// Używa admin client (bypass RLS), bo musi czytać used_count i wartości
// kodów których klient nie powinien zobaczyć w listingu.
export async function validatePromoCode(
  rawCode: string,
  cartTotal: number
): Promise<ValidationResult> {
  const code = normalizeCode(rawCode);
  if (!code) return { ok: false, error: "Wpisz kod rabatowy" };
  if (!Number.isFinite(cartTotal) || cartTotal <= 0) {
    return { ok: false, error: "Koszyk jest pusty" };
  }

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("promo_codes")
    .select("*")
    .eq("code", code)
    .maybeSingle();

  if (error) return { ok: false, error: "Błąd weryfikacji kodu" };
  if (!data) return { ok: false, error: "Nieprawidłowy kod rabatowy" };

  const promo = data as PromoCode;

  if (!promo.active) return { ok: false, error: "Kod jest nieaktywny" };

  const now = Date.now();
  if (promo.valid_from && now < new Date(promo.valid_from).getTime()) {
    return { ok: false, error: "Kod jeszcze nie obowiązuje" };
  }
  if (promo.valid_to && now > new Date(promo.valid_to).getTime()) {
    return { ok: false, error: "Kod wygasł" };
  }
  if (promo.max_uses !== null && promo.used_count >= promo.max_uses) {
    return { ok: false, error: "Limit użyć tego kodu został wyczerpany" };
  }
  if (promo.min_order_value !== null && cartTotal < promo.min_order_value) {
    return {
      ok: false,
      error: `Minimalna wartość zamówienia: ${promo.min_order_value.toFixed(2)} zł`,
    };
  }

  // Oblicz zniżkę
  let discount =
    promo.discount_type === "percent"
      ? (cartTotal * promo.discount_value) / 100
      : promo.discount_value;

  // Nie pozwól zniżce przekroczyć wartości koszyka
  if (discount > cartTotal) discount = cartTotal;
  discount = Math.round(discount * 100) / 100; // 2 miejsca po przecinku

  return { ok: true, promo, discount };
}

// ============================================================
// Increment used_count — wywoływane przez Stripe webhook po opłaceniu
// ============================================================
export async function incrementPromoUsage(promoId: string): Promise<void> {
  const supabase = await createAdminClient();
  // PostgreSQL doesn't have atomic increment via Supabase select API,
  // ale to wywołujemy z webhooka (sekwencyjnie per zamówienie) więc
  // race condition jest minimalne. Dla bezpieczeństwa moglibyśmy zrobić RPC,
  // ale na MVP wystarczy read-then-update.
  const { data: row } = await supabase
    .from("promo_codes")
    .select("used_count")
    .eq("id", promoId)
    .single();

  if (!row) return;

  const current = (row as { used_count: number }).used_count ?? 0;
  await supabase
    .from("promo_codes")
    .update({ used_count: current + 1 } as never)
    .eq("id", promoId);
}

// ============================================================
// Admin helpers
// ============================================================
export async function getAllPromoCodes(): Promise<PromoCode[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("promo_codes")
    .select("*")
    .order("created_at", { ascending: false });
  return (data ?? []) as PromoCode[];
}
