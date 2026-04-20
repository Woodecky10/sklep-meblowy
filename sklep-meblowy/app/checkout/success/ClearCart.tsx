"use client";

import { useEffect, useRef } from "react";
import { useCart } from "@/app/_context/CartContext";

export default function ClearCart() {
  const { clear } = useCart();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    clear();
  }, [clear]);
  return null;
}
