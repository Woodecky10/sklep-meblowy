// Czysta logika zestawów mebli (spec 2026-07-16) — bez zależności server-only.
// Używana przez klienta (koszyk, konfigurator) i serwer (/api/checkout), więc
// wszystko tutaj musi być deterministyczne i wolne od Supabase/next-server.

export type BundleDiscountType = "percent" | "amount";

// Znacznik zestawu na pozycji koszyka. discountType/Value zdublowane z DB,
// żeby koszyk (client-side) mógł pokazać rabat bez requestu; serwer i tak
// liczy od zera z własnych danych.
export type CartItemBundle = {
  id: string;
  name: string;
  unitKey: string;
  discountType: BundleDiscountType;
  discountValue: number;
};

// Rabat grupy zestawu. `base` = suma subtotali składników grupy (ceny
// efektywne z dopłatami opcji, JUŻ pomnożone przez ilość); `qty` = ilość
// zestawu. Kwota rabatu jest „per sztuka zestawu" → mnożona przez qty;
// procent liczy się od bazy (która qty już zawiera). Clamp do [0, base],
// zaokrąglenie do groszy.
export function computeBundleDiscount(
  base: number,
  qty: number,
  type: BundleDiscountType,
  value: number
): number {
  if (!Number.isFinite(base) || base <= 0) return 0;
  if (!Number.isFinite(value)) return 0;
  const q = Math.max(1, Math.trunc(qty));
  const raw = type === "percent" ? (base * value) / 100 : value * q;
  const clamped = Math.min(Math.max(0, raw), base);
  return Math.round(clamped * 100) / 100;
}

// Deterministyczny klucz egzemplarza zestawu: bundleId + posortowane pary
// produkt::warianty. Identyczna konfiguracja dodana drugi raz → ten sam klucz
// (koszyk zwiększy ilość istniejącej grupy zamiast tworzyć nową).
export function bundleUnitKey(
  bundleId: string,
  components: { productId: string; variantValues?: Record<string, string> }[]
): string {
  const parts = components
    .map((c) => {
      const vv = c.variantValues ?? {};
      const vk = Object.keys(vv)
        .sort()
        .map((k) => `${k}=${vv[k]}`)
        .join("|");
      return `${c.productId}::${vk}`;
    })
    .sort();
  return `${bundleId}##${parts.join("||")}`;
}

export type BundleGroupItem = {
  productId: string;
  quantity: number;
  subtotal: number;
};

export type BundleGroup = {
  bundleId: string;
  unitKey: string;
  items: BundleGroupItem[];
};

// Grupuje pozycje (checkout payload / koszyk) po unitKey. Pozycje bez bundle
// są pomijane — to zwykłe zakupy.
export function groupBundleUnits(
  items: {
    productId: string;
    quantity: number;
    subtotal: number;
    bundle?: { id: string; unitKey: string } | null;
  }[]
): BundleGroup[] {
  const map = new Map<string, BundleGroup>();
  for (const it of items) {
    if (!it.bundle) continue;
    const g = map.get(it.bundle.unitKey) ?? {
      bundleId: it.bundle.id,
      unitKey: it.bundle.unitKey,
      items: [],
    };
    g.items.push({ productId: it.productId, quantity: it.quantity, subtotal: it.subtotal });
    map.set(it.bundle.unitKey, g);
  }
  return Array.from(map.values());
}

export type BundleVerification =
  | { ok: true }
  | { ok: false; reason: "not_found" | "inactive" | "wrong_products" | "unequal_quantities" };

// Autorytatywna weryfikacja grupy względem definicji z DB: zestaw istnieje,
// jest aktywny, skład grupy == skład zestawu (dokładnie, bez braków i
// nadmiarów, min 2 produkty), ilości wszystkich składników równe.
export function verifyBundleGroup(
  group: BundleGroup,
  bundle: { id: string; is_active: boolean; productIds: string[] } | null
): BundleVerification {
  if (!bundle) return { ok: false, reason: "not_found" };
  if (!bundle.is_active) return { ok: false, reason: "inactive" };
  const got = group.items.map((i) => i.productId).sort();
  const want = [...bundle.productIds].sort();
  if (
    want.length < 2 ||
    got.length !== want.length ||
    got.some((id, i) => id !== want[i])
  ) {
    return { ok: false, reason: "wrong_products" };
  }
  const q = group.items[0]?.quantity ?? 0;
  if (!Number.isInteger(q) || q < 1 || group.items.some((i) => i.quantity !== q)) {
    return { ok: false, reason: "unequal_quantities" };
  }
  return { ok: true };
}

// Podstawa kodu rabatowego: kod NIE obejmuje pozycji z zestawów (decyzja
// użytkownika w specu) — suma subtotali pozycji bez bundle.
export function eligiblePromoBase(
  items: { subtotal: number; bundle?: { id: string; unitKey: string } | null }[]
): number {
  return items.reduce((s, i) => (i.bundle ? s : s + i.subtotal), 0);
}

// „Oszczędzasz od X zł" na kartach produktów: minimalny rabat liczony od sumy
// bazowych cen efektywnych składników (bez dopłat opcji), qty = 1.
export function minBundleSavings(
  componentBasePrices: number[],
  type: BundleDiscountType,
  value: number
): number {
  const base = componentBasePrices.reduce((s, p) => s + p, 0);
  return computeBundleDiscount(base, 1, type, value);
}

export type CartBundleGroup<T> = {
  bundleId: string;
  unitKey: string;
  name: string;
  discountType: BundleDiscountType;
  discountValue: number;
  qty: number;
  base: number;
  discount: number;
  items: T[];
};

// Grupowanie pozycji koszyka do UI + rabat client-side. Generic, żeby koszyk
// dostał z powrotem swoje pełne CartItem-y (zdjęcia, notes itd.).
export function groupCartBundles<
  T extends { price: number; quantity: number; bundle?: CartItemBundle | null }
>(items: T[]): CartBundleGroup<T>[] {
  const map = new Map<string, CartBundleGroup<T>>();
  for (const it of items) {
    if (!it.bundle) continue;
    const g = map.get(it.bundle.unitKey) ?? {
      bundleId: it.bundle.id,
      unitKey: it.bundle.unitKey,
      name: it.bundle.name,
      discountType: it.bundle.discountType,
      discountValue: it.bundle.discountValue,
      qty: it.quantity,
      base: 0,
      discount: 0,
      items: [],
    };
    g.base += it.price * it.quantity;
    g.qty = it.quantity;
    g.items.push(it);
    map.set(it.bundle.unitKey, g);
  }
  const groups = Array.from(map.values());
  for (const g of groups) {
    g.discount = computeBundleDiscount(g.base, g.qty, g.discountType, g.discountValue);
  }
  return groups;
}
