"use client";

import { createContext, useContext, useMemo, useReducer, useCallback } from "react";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variantValues?: Record<string, string>;
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
  add: (item: CartItem) => void;
  remove: (id: string, variantValues?: Record<string, string>) => void;
  updateQty: (
    id: string,
    quantity: number,
    variantValues?: Record<string, string>
  ) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  const add = useCallback((item: CartItem) => dispatch({ type: "ADD", item }), []);
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
  const clear = useCallback(() => dispatch({ type: "CLEAR" }), []);

  const value = useMemo<CartContextValue>(() => {
    const total = state.items.reduce((s, i) => s + i.price * i.quantity, 0);
    const count = state.items.reduce((s, i) => s + i.quantity, 0);
    return {
      items: state.items,
      total,
      count,
      add,
      remove,
      updateQty,
      clear,
    };
  }, [state.items, add, remove, updateQty, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}

export { itemKey as cartItemKey };
