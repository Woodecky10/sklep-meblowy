"use client";

import { createContext, useContext, useMemo, useReducer, useCallback, useState, useEffect } from "react";
import type { CartItemBundle, BundleDiscountType } from "@/app/_lib/bundles";
import { buildCartEventPayload } from "@/app/_lib/meta-pixel";
import { trackPixel } from "@/app/_lib/meta-pixel-client";
import { buildGaCartPayload } from "@/app/_lib/ga-ecommerce";
import { trackGaEvent } from "@/app/_lib/ga-client";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variantValues?: Record<string, string>;
  // Slug kategorii — wymagane do cross-sell. Optional w typie żeby
  // starsze localStorage states (bez tego pola) dalej działały.
  category?: string;
  // Uwagi klienta do tej pozycji — np. "róż jak na zdjęciu 2".
  // Optional dla backward compat.
  notes?: string;
  // Znacznik zestawu (spec 2026-07-16). Pozycje z tym samym unitKey tworzą
  // jedną grupę „Zestaw" w koszyku. Optional dla backward compat (stare
  // localStorage bez pola działa bez migracji).
  bundle?: CartItemBundle;
};

// Zwalidowany kod rabatowy zastosowany do koszyka. Walidacja na serwerze
// (validatePromoCode), tu tylko trzymamy wynik. Discount = ZŁ kwota
// zniżki obliczona na podstawie total z momentu walidacji.
export type AppliedPromo = {
  promoId: string;
  code: string;
  discount: number;
  discountType: "percent" | "fixed";
  discountValue: number;
};

// Sygnał dla CartToast — `ts` (Date.now) zmienia się przy każdym dodaniu,
// nawet jeśli to ten sam produkt, żeby toast mógł się ponownie pokazać.
export type CartNotification = {
  item: CartItem;
  ts: number;
};

// hydrated=true dopiero po odczycie z localStorage (akcja HYDRATE), żeby nie
// nadpisać zapisanego stanu pustym przy pierwszym renderze.
type CartState = {
  items: CartItem[];
  appliedPromo: AppliedPromo | null;
  hydrated: boolean;
};

type CartAction =
  | { type: "ADD"; item: CartItem }
  | { type: "REMOVE"; id: string; variantValues?: Record<string, string> }
  | {
      type: "UPDATE_QTY";
      id: string;
      variantValues: Record<string, string> | undefined;
      quantity: number;
    }
  | {
      type: "UPDATE_NOTES";
      id: string;
      variantValues: Record<string, string> | undefined;
      notes: string;
      bundleUnitKey?: string;
    }
  | { type: "ADD_BUNDLE"; items: CartItem[] }
  | { type: "REMOVE_BUNDLE"; unitKey: string }
  | { type: "UPDATE_BUNDLE_QTY"; unitKey: string; quantity: number }
  | {
      type: "UPDATE_BUNDLE_TERMS";
      bundleId: string;
      discountType: BundleDiscountType;
      discountValue: number;
    }
  | { type: "CLEAR" }
  | { type: "HYDRATE"; items: CartItem[]; appliedPromo: AppliedPromo | null }
  | { type: "APPLY_PROMO"; promo: AppliedPromo }
  | { type: "CLEAR_PROMO" };

// Maksymalna ilość jednej pozycji — spójna z walidacją w /api/checkout
// (route odrzuca quantity > 99, więc UI nie może pozwolić jej zbudować).
export const MAX_CART_QTY = 99;

function clampQty(q: number): number {
  if (!Number.isFinite(q)) return 1;
  return Math.min(MAX_CART_QTY, Math.max(1, Math.trunc(q)));
}

// Stabilny klucz wariantu — sortuje po nazwie opcji żeby kolejność wyboru
// (np. najpierw Kolor, potem Strona) nie tworzyła osobnych pozycji w koszyku.
function variantKey(values?: Record<string, string>): string {
  if (!values) return "";
  return Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join("|");
}

function itemKey(
  id: string,
  values?: Record<string, string>,
  bundleUnitKey?: string
): string {
  return id + "::" + variantKey(values) + "::" + (bundleUnitKey ?? "");
}

export type { CartState, CartAction };
export function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const key = itemKey(action.item.id, action.item.variantValues, action.item.bundle?.unitKey);
      const existing = state.items.find(
        (i) => itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key
      );
      if (existing) {
        return {
          ...state,
          items: state.items.map((i) =>
            itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key
              ? { ...i, quantity: clampQty(i.quantity + action.item.quantity) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          { ...action.item, quantity: clampQty(action.item.quantity) },
        ],
      };
    }
    case "REMOVE": {
      const key = itemKey(action.id, action.variantValues);
      return {
        ...state,
        items: state.items.filter(
          (i) => itemKey(i.id, i.variantValues, i.bundle?.unitKey) !== key
        ),
      };
    }
    case "UPDATE_QTY": {
      const key = itemKey(action.id, action.variantValues);
      return {
        ...state,
        items: state.items.map((i) =>
          itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key
            ? { ...i, quantity: clampQty(action.quantity) }
            : i
        ),
      };
    }
    case "UPDATE_NOTES": {
      const key = itemKey(action.id, action.variantValues, action.bundleUnitKey);
      return {
        ...state,
        items: state.items.map((i) =>
          itemKey(i.id, i.variantValues, i.bundle?.unitKey) === key
            ? { ...i, notes: action.notes }
            : i
        ),
      };
    }
    case "ADD_BUNDLE": {
      if (action.items.length === 0) return state;
      const unitKey = action.items[0].bundle?.unitKey;
      if (!unitKey) return state;
      const exists = state.items.some((i) => i.bundle?.unitKey === unitKey);
      if (exists) {
        const inc = clampQty(action.items[0].quantity);
        return {
          ...state,
          items: state.items.map((i) =>
            i.bundle?.unitKey === unitKey
              ? { ...i, quantity: clampQty(i.quantity + inc) }
              : i
          ),
        };
      }
      return {
        ...state,
        items: [
          ...state.items,
          ...action.items.map((i) => ({ ...i, quantity: clampQty(i.quantity) })),
        ],
      };
    }
    case "REMOVE_BUNDLE":
      return {
        ...state,
        items: state.items.filter((i) => i.bundle?.unitKey !== action.unitKey),
      };
    case "UPDATE_BUNDLE_QTY":
      return {
        ...state,
        items: state.items.map((i) =>
          i.bundle?.unitKey === action.unitKey
            ? { ...i, quantity: clampQty(action.quantity) }
            : i
        ),
      };
    case "UPDATE_BUNDLE_TERMS":
      // Odświeżenie warunków rabatu zestawu (admin mógł zmienić po dodaniu do
      // koszyka). Aktualizuje meta WSZYSTKICH pozycji danego bundle.id.
      return {
        ...state,
        items: state.items.map((i) =>
          i.bundle && i.bundle.id === action.bundleId
            ? {
                ...i,
                bundle: {
                  ...i.bundle,
                  discountType: action.discountType,
                  discountValue: action.discountValue,
                },
              }
            : i
        ),
      };
    case "CLEAR":
      // Czyści też promo — rabat bez koszyka nie ma sensu (wcześniej robił
      // to osobny setAppliedPromo(null) w callbacku clear()).
      return state.items.length === 0 && state.appliedPromo === null
        ? state
        : { ...state, items: [], appliedPromo: null };
    case "HYDRATE":
      return { items: action.items, appliedPromo: action.appliedPromo, hydrated: true };
    case "APPLY_PROMO":
      return { ...state, appliedPromo: action.promo };
    case "CLEAR_PROMO":
      return state.appliedPromo === null ? state : { ...state, appliedPromo: null };
    default:
      return state;
  }
}

// localStorage keys
const LS_ITEMS = "mollien-cart-items";
const LS_PROMO = "mollien-cart-promo";

type CartContextValue = {
  items: CartItem[];
  total: number;
  count: number;
  notification: CartNotification | null;
  appliedPromo: AppliedPromo | null;
  // True dopiero po wczytaniu z localStorage. Komponenty które robią coś
  // destrukcyjnego (np. ClearCart na /checkout/success) MUSZĄ poczekać aż
  // hydrated=true — inaczej clear leci na pustym stanie a HYDRATE potem
  // przywraca koszyk z localStorage.
  hydrated: boolean;
  add: (item: CartItem) => void;
  remove: (id: string, variantValues?: Record<string, string>) => void;
  updateQty: (
    id: string,
    quantity: number,
    variantValues?: Record<string, string>
  ) => void;
  updateNotes: (
    id: string,
    notes: string,
    variantValues?: Record<string, string>,
    bundleUnitKey?: string
  ) => void;
  addBundle: (items: CartItem[]) => void;
  removeBundle: (unitKey: string) => void;
  updateBundleQty: (unitKey: string, quantity: number) => void;
  updateBundleTerms: (
    bundleId: string,
    discountType: BundleDiscountType,
    discountValue: number
  ) => void;
  clear: () => void;
  dismissNotification: () => void;
  applyPromo: (promo: AppliedPromo) => void;
  clearPromo: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, {
    items: [],
    appliedPromo: null,
    hydrated: false,
  });
  const [notification, setNotification] = useState<CartNotification | null>(null);
  const appliedPromo = state.appliedPromo;
  const hydrated = state.hydrated;

  // Hydrate z localStorage na mount (client-only). Items + promo + flaga
  // hydrated wchodzą jednym dispatch'em HYDRATE — bez setState w ciele efektu.
  useEffect(() => {
    let items: CartItem[] = [];
    let promo: AppliedPromo | null = null;
    try {
      const rawItems = localStorage.getItem(LS_ITEMS);
      if (rawItems) {
        const parsed = JSON.parse(rawItems) as CartItem[];
        if (Array.isArray(parsed)) items = parsed;
      }
      const rawPromo = localStorage.getItem(LS_PROMO);
      if (rawPromo) {
        const parsed = JSON.parse(rawPromo) as AppliedPromo;
        if (parsed && typeof parsed === "object" && parsed.code) {
          promo = parsed;
        }
      }
    } catch {
      // Uszkodzony JSON — ignorujemy.
    }
    dispatch({ type: "HYDRATE", items, appliedPromo: promo });
  }, []);

  // Persist items
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(LS_ITEMS, JSON.stringify(state.items));
    } catch {}
  }, [state.items, hydrated]);

  // Persist promo
  useEffect(() => {
    if (!hydrated) return;
    try {
      if (appliedPromo) localStorage.setItem(LS_PROMO, JSON.stringify(appliedPromo));
      else localStorage.removeItem(LS_PROMO);
    } catch {}
  }, [appliedPromo, hydrated]);

  // Dodanie do koszyka siedzi tu, a nie w przyciskach: dodać do koszyka da się
  // z karty produktu, z listingu i z cross-sellu w koszyku. Jedno miejsce = brak
  // ryzyka, że któraś ścieżka po cichu przestanie raportować.
  // Bez zgody trackPixel/trackGaEvent nie robią nic — każde ma własną bramkę.
  const add = useCallback((item: CartItem) => {
    dispatch({ type: "ADD", item });
    setNotification({ item, ts: Date.now() });
    trackPixel(
      "AddToCart",
      buildCartEventPayload([
        { productId: item.id, quantity: item.quantity, price: item.price },
      ])
    );
    trackGaEvent(
      "add_to_cart",
      buildGaCartPayload([
        { productId: item.id, name: item.name, quantity: item.quantity, price: item.price },
      ])
    );
  }, []);
  const remove = useCallback(
    (id: string, variantValues?: Record<string, string>) =>
      dispatch({ type: "REMOVE", id, variantValues }),
    []
  );
  const updateQty = useCallback(
    (id: string, quantity: number, variantValues?: Record<string, string>) =>
      dispatch({ type: "UPDATE_QTY", id, variantValues, quantity }),
    []
  );
  const updateNotes = useCallback(
    (
      id: string,
      notes: string,
      variantValues?: Record<string, string>,
      bundleUnitKey?: string
    ) => dispatch({ type: "UPDATE_NOTES", id, variantValues, notes, bundleUnitKey }),
    []
  );
  const addBundle = useCallback((items: CartItem[]) => {
    dispatch({ type: "ADD_BUNDLE", items });
    if (items[0]) setNotification({ item: items[0], ts: Date.now() });
    // Zestaw to JEDNO zdarzenie z kompletem pozycji — nie N osobnych, bo
    // w raporcie wyglądałyby jak N niezależnych dodań do koszyka.
    trackPixel(
      "AddToCart",
      buildCartEventPayload(
        items.map((item) => ({
          productId: item.id,
          quantity: item.quantity,
          price: item.price,
        }))
      )
    );
    trackGaEvent(
      "add_to_cart",
      buildGaCartPayload(
        items.map((item) => ({
          productId: item.id,
          name: item.name,
          quantity: item.quantity,
          price: item.price,
        }))
      )
    );
  }, []);
  const removeBundle = useCallback(
    (unitKey: string) => dispatch({ type: "REMOVE_BUNDLE", unitKey }),
    []
  );
  const updateBundleQty = useCallback(
    (unitKey: string, quantity: number) =>
      dispatch({ type: "UPDATE_BUNDLE_QTY", unitKey, quantity }),
    []
  );
  const updateBundleTerms = useCallback(
    (bundleId: string, discountType: BundleDiscountType, discountValue: number) =>
      dispatch({ type: "UPDATE_BUNDLE_TERMS", bundleId, discountType, discountValue }),
    []
  );
  const clear = useCallback(() => {
    // CLEAR w reducerze zeruje też appliedPromo.
    dispatch({ type: "CLEAR" });
    // Defensywnie czyścimy też localStorage natychmiastowo, niezależnie od
    // efektu persist — race z hydrate'em mógłby zapisać tu coś z powrotem.
    try {
      localStorage.removeItem(LS_ITEMS);
      localStorage.removeItem(LS_PROMO);
    } catch {}
  }, []);
  const dismissNotification = useCallback(() => setNotification(null), []);
  const applyPromo = useCallback(
    (promo: AppliedPromo) => dispatch({ type: "APPLY_PROMO", promo }),
    []
  );
  const clearPromo = useCallback(() => dispatch({ type: "CLEAR_PROMO" }), []);

  const value = useMemo<CartContextValue>(() => {
    const total = state.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = state.items.reduce((s, i) => s + i.quantity, 0);
    return {
      items: state.items,
      total,
      count,
      notification,
      appliedPromo,
      hydrated,
      add,
      remove,
      updateQty,
      updateNotes,
      addBundle,
      removeBundle,
      updateBundleQty,
      updateBundleTerms,
      clear,
      dismissNotification,
      applyPromo,
      clearPromo,
    };
  }, [state.items, notification, appliedPromo, hydrated, add, remove, updateQty, updateNotes, addBundle, removeBundle, updateBundleQty, updateBundleTerms, clear, dismissNotification, applyPromo, clearPromo]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export { itemKey as cartItemKey };
