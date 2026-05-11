"use client";

import { createContext, useContext, useMemo, useReducer, useCallback, useState } from "react";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variantValues?: Record<string, string>;
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
  | { type: "CLEAR" };

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
    case "CLEAR":
      return state.items.length === 0 ? state : { items: [] };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  total: number;
  count: number;
  notification: CartNotification | null;
  appliedPromo: AppliedPromo | null;
  add: (item: CartItem) => void;
  remove: (id: string, variantValues?: Record<string, string>) => void;
  updateQty: (
    id: string,
    quantity: number,
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
  const clear = useCallback(() => {
    dispatch({ type: "CLEAR" });
    setAppliedPromo(null);
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
      add,
      remove,
      updateQty,
      clear,
      dismissNotification,
      applyPromo,
      clearPromo,
    };
  }, [state.items, notification, appliedPromo, add, remove, updateQty, clear, dismissNotification, applyPromo, clearPromo]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export { itemKey as cartItemKey };
