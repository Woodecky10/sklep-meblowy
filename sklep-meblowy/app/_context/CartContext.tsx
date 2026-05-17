"use client";

import { createContext, useContext, useMemo, useReducer, useCallback, useState, useEffect } from "react";

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

type CartState = { items: CartItem[] };

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
    }
  | { type: "CLEAR" }
  | { type: "HYDRATE"; items: CartItem[] };

// Stabilny klucz wariantu — sortuje po nazwie opcji żeby kolejność wyboru
// (np. najpierw Kolor, potem Strona) nie tworzyła osobnych pozycji w koszyku.
function variantKey(values?: Record<string, string>): string {
  if (!values) return "";
  return Object.keys(values)
    .sort()
    .map((k) => `${k}=${values[k]}`)
    .join("|");
}

function itemKey(id: string, values?: Record<string, string>): string {
  return id + "::" + variantKey(values);
}

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const key = itemKey(action.item.id, action.item.variantValues);
      const existing = state.items.find(
        (i) => itemKey(i.id, i.variantValues) === key
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            itemKey(i.id, i.variantValues) === key
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }
    case "REMOVE": {
      const key = itemKey(action.id, action.variantValues);
      return {
        items: state.items.filter((i) => itemKey(i.id, i.variantValues) !== key),
      };
    }
    case "UPDATE_QTY": {
      const key = itemKey(action.id, action.variantValues);
      return {
        items: state.items.map((i) =>
          itemKey(i.id, i.variantValues) === key
            ? { ...i, quantity: action.quantity }
            : i
        ),
      };
    }
    case "UPDATE_NOTES": {
      const key = itemKey(action.id, action.variantValues);
      return {
        items: state.items.map((i) =>
          itemKey(i.id, i.variantValues) === key
            ? { ...i, notes: action.notes }
            : i
        ),
      };
    }
    case "CLEAR":
      return state.items.length === 0 ? state : { items: [] };
    case "HYDRATE":
      return { items: action.items };
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
    variantValues?: Record<string, string>
  ) => void;
  clear: () => void;
  dismissNotification: () => void;
  applyPromo: (promo: AppliedPromo) => void;
  clearPromo: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });
  const [notification, setNotification] = useState<CartNotification | null>(null);
  const [appliedPromo, setAppliedPromo] = useState<AppliedPromo | null>(null);
  // hydrated=true dopiero po odczycie z localStorage, żeby nie nadpisać
  // zapisanego stanu pustym przy pierwszym renderze.
  const [hydrated, setHydrated] = useState(false);

  // Hydrate z localStorage na mount (client-only).
  useEffect(() => {
    try {
      const rawItems = localStorage.getItem(LS_ITEMS);
      if (rawItems) {
        const items = JSON.parse(rawItems) as CartItem[];
        if (Array.isArray(items)) dispatch({ type: "HYDRATE", items });
      }
      const rawPromo = localStorage.getItem(LS_PROMO);
      if (rawPromo) {
        const promo = JSON.parse(rawPromo) as AppliedPromo;
        if (promo && typeof promo === "object" && promo.code) {
          setAppliedPromo(promo);
        }
      }
    } catch {
      // Uszkodzony JSON — ignorujemy.
    }
    setHydrated(true);
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

  const add = useCallback((item: CartItem) => {
    dispatch({ type: "ADD", item });
    setNotification({ item, ts: Date.now() });
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
    (id: string, notes: string, variantValues?: Record<string, string>) =>
      dispatch({ type: "UPDATE_NOTES", id, variantValues, notes }),
    []
  );
  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
    setAppliedPromo(null);
    // Defensywnie czyścimy też localStorage natychmiastowo, niezależnie od
    // efektu persist — race z hydrate'em mógłby zapisać tu coś z powrotem.
    try {
      localStorage.removeItem(LS_ITEMS);
      localStorage.removeItem(LS_PROMO);
    } catch {}
  }, []);
  const dismissNotification = useCallback(() => setNotification(null), []);
  const applyPromo = useCallback((promo: AppliedPromo) => setAppliedPromo(promo), []);
  const clearPromo = useCallback(() => setAppliedPromo(null), []);

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
      clear,
      dismissNotification,
      applyPromo,
      clearPromo,
    };
  }, [state.items, notification, appliedPromo, hydrated, add, remove, updateQty, updateNotes, clear, dismissNotification, applyPromo, clearPromo]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export { itemKey as cartItemKey };
