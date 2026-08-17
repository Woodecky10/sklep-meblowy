"use client";

import { useEffect } from "react";
import { buildCartEventPayload } from "@/app/_lib/meta-pixel";
import { trackPixel } from "@/app/_lib/meta-pixel-client";
import { buildGaCartPayload } from "@/app/_lib/ga-ecommerce";
import { trackGaEvent } from "@/app/_lib/ga-client";

// „Oglądał ten konkretny mebel" — jeden fakt, dwa raporty:
//
//  • Meta `ViewContent` karmi reklamy dynamiczne: bez niego Meta wie tylko, że
//    ktoś był w sklepie, a nie CO oglądał.
//  • GA4 `view_item` zasila raport „Wyświetlone produkty" — ten, który do tej
//    pory pokazywał zero.
//
// Każde zdarzenie ma własną bramkę zgody i wisi na innym przełączniku banera
// (Meta: marketing, GA: analityka), więc bez zgody odpowiednia funkcja po prostu
// nic nie robi. Dlatego wołamy obie bezwarunkowo.
export default function ProductViewEvents({
  productId,
  name,
  price,
}: {
  productId: string;
  name: string;
  price: number;
}) {
  // Zależność po `productId`, a nie pusta tablica: przejście między dwoma
  // kartami produktu nie przeładowuje dokumentu i przy `[]` drugi mebel nigdy
  // by się nie zaraportował.
  useEffect(() => {
    trackPixel("ViewContent", buildCartEventPayload([{ productId, quantity: 1, price }]));
    trackGaEvent(
      "view_item",
      buildGaCartPayload([{ productId, name, quantity: 1, price }])
    );
  }, [productId, name, price]);

  return null;
}
