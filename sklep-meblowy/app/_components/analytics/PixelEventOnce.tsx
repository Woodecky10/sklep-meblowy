"use client";

import { useEffect, useRef } from "react";
import { trackPixel } from "@/app/_lib/meta-pixel-client";

// Wysyła zdarzenie pixela Meta raz na wejście na stronę. Używane przez strony
// domykające transakcję (Purchase po zakupie, Lead po zamówieniu próbek) —
// parametry liczy serwer, bo tylko on widzi zamówienie; tutaj zostaje samo
// wysłanie, bo `fbq` żyje wyłącznie w przeglądarce.
//
// ⚠️ Bez zgody na cookies marketingowe trackPixel nie robi nic — bramka jest
// w meta-pixel-client.ts, nie tutaj.
//
// Dwie warstwy ochrony przed policzeniem jednej transakcji dwa razy:
//  1. `sent` — Strict Mode w devie odpala efekty podwójnie.
//  2. `eventId` (= id zamówienia) — deduplikacja po stronie Meta, gdy klient
//     odświeży stronę podziękowania albo wróci na nią z linku w mailu.
export default function PixelEventOnce({
  event,
  payload,
  eventId,
}: {
  event: string;
  payload: Record<string, unknown>;
  eventId: string;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackPixel(event, payload, eventId);
  }, [event, payload, eventId]);

  return null;
}
