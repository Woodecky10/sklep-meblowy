"use client";

import { useEffect, useRef } from "react";
import { trackGaEvent } from "@/app/_lib/ga-client";

// Wysyła zdarzenie GA4 raz na wejście na stronę. Bliźniak PixelEventOnce —
// używają go strony domykające transakcję (purchase po zakupie, generate_lead
// po zamówieniu próbek). Parametry liczy serwer, bo tylko on widzi zamówienie;
// tutaj zostaje samo wysłanie, bo `dataLayer` żyje wyłącznie w przeglądarce.
//
// ⚠️ Bez zgody na cookies ANALITYCZNE trackGaEvent nie robi nic — bramka jest
// w ga-client.ts, nie tutaj. To inna zgoda niż przy pixelu Meta (marketingowa),
// więc obie strony podziękowania mogą wysłać jedno zdarzenie, a drugie nie.
//
// Dwie warstwy ochrony przed policzeniem jednej transakcji dwa razy:
//  1. `sent` — Strict Mode w devie odpala efekty podwójnie.
//  2. `transaction_id` w ładunku (= id zamówienia) — po nim GA4 rozpoznaje, że
//     to ta sama transakcja, gdy klient odświeży stronę podziękowania albo
//     wróci na nią z linku w mailu. Dlatego purchase MUSI je nieść; bez niego
//     każde odświeżenie dokłada przychód.
export default function GaEventOnce({
  event,
  payload,
}: {
  event: string;
  payload: Record<string, unknown>;
}) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;
    sent.current = true;
    trackGaEvent(event, payload);
  }, [event, payload]);

  return null;
}
