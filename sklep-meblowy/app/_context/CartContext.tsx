"use client";

import { createContext, useContext, useReducer } from "react";

export type CartItem = {
  id: string;
  name: string;
  price: number;
  image: string;
  quantity: number;
  variant?: string;
};

type CartState = { items: CartItem[] };

type CartAction =
  | { type: "ADD"; item: CartItem }
  | { type: "REMOVE"; id: string; variant?: string }
  | { type: "UPDATE_QTY"; id: string; variant?: string; quantity: number }
  | { type: "CLEAR" };

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case "ADD": {
      const key = action.item.id + (action.item.variant ?? "");
      const existing = state.items.find(
        (i) => i.id + (i.variant ?? "") === key
      );
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.id + (i.variant ?? "") === key
              ? { ...i, quantity: i.quantity + action.item.quantity }
              : i
          ),
        };
      }
      return { items: [...state.items, action.item] };
    }
    case "REMOVE":
      return {
        items: state.items.filter(
          (i) => i.id + (i.variant ?? "") !== action.id + (action.variant ?? "")
        ),
      };
    case "UPDATE_QTY":
      return {
        items: state.items.map((i) =>
          i.id + (i.variant ?? "") === action.id + (action.variant ?? "")
            ? { ...i, quantity: action.quantity }
            : i
        ),
      };
    case "CLEAR":
      return { items: [] };
    default:
      return state;
  }
}

type CartContextValue = {
  items: CartItem[];
  total: number;
  count: number;
  add: (item: CartItem) => void;
  remove: (id: string, variant?: string) => void;
  updateQty: (id: string, quantity: number, variant?: string) => void;
  clear: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  const total = state.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const count = state.items.reduce((s, i) => s + i.quantity, 0);

  return (
    <CartContext.Provider
      value={{
        items: state.items,
        total,
        count,
        add: (item) => dispatch({ type: "ADD", item }),
        remove: (id, variant) => dispatch({ type: "REMOVE", id, variant }),
        updateQty: (id, quantity, variant) =>
          dispatch({ type: "UPDATE_QTY", id, variant, quantity }),
        clear: () => dispatch({ type: "CLEAR" }),
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used inside CartProvider");
  return ctx;
}
