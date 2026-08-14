"use client";

import { useEffect } from "react";
import { buildCartEventPayload } from "@/app/_lib/meta-pixel";
import { trackPixel } from "@/app/_lib/meta-pixel-client";

// ViewContent — „oglądał ten konkretny mebel". To zdarzenie karmi reklamy
// dynamiczne: bez niego Meta wie tylko, że ktoś był w sklepie, a nie CO oglądał.
//
// Bez zgody marketingowej trackPixel nie robi nic.
export default function ViewContentEvent({
  productId,
  price,
}: {
  productId: string;
  price: number;
}) {
  // Zależność po `productId`, a nie pusta tablica: przejście między dwoma
  // kartami produktu nie przeładowuje dokumentu i przy `[]` drugi mebel nigdy
  // by się nie zaraportował.
  useEffect(() => {
    trackPixel("ViewContent", buildCartEventPayload([{ productId, quantity: 1, price }]));
  }, [productId, price]);

  return null;
}
