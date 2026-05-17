"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/app/_context/CartContext";

// Czyści koszyk po pomyślnej płatności. MUSI poczekać na hydrated=true,
// bo CartProvider hydruje koszyk z localStorage w useEffect — jeśli
// odpalimy clear() przed hydrate'em, dispatch CLEAR poleci na pustym
// stanie, a potem HYDRATE przywróci koszyk z localStorage.
export default function ClearCart() {
  const { clear, hydrated } = useCart();
  const done = useRef(false);
  useEffect(() => {
    if (!hydrated || done.current) return;
    done.current = true;
    clear();
  }, [clear, hydrated]);
  return null;
}
