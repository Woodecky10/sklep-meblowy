"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  parseConsent,
  readConsentRaw,
  subscribeConsent,
} from "@/app/_components/layout/CookieBanner";
import { GA_MEASUREMENT_ID, gaConsentSignals } from "@/app/_lib/analytics";
import {
  startGaIfConsented,
  pushGaConsentUpdate,
  isGaStarted,
  clearGaCookies,
} from "@/app/_lib/ga-client";

// Pilnuje zgody na cookies analityczne: startuje tag po jej udzieleniu i sprząta
// po jej cofnięciu. Cała mechanika `dataLayer` siedzi w app/_lib/ga-client.ts —
// tutaj zostaje sam glue reactowy, bo zdarzenia e-commerce wysyłają z siebie
// także inne miejsca (karta produktu, koszyk, strona podziękowania).
//
// Snippet od Google wkleja skrypt bezwarunkowo w <head> — tutaj jest inaczej
// z dwóch powodów:
//
// 1. RODO: baner ma przełącznik „Analityczne", więc musi on realnie decydować
//    o załadowaniu GA, a nie być ozdobą.
// 2. CSP: script-src nie ma 'unsafe-inline' (app/_lib/csp.ts) — szczegóły
//    w ga-client.ts.
export default function GoogleAnalytics() {
  // Snapshot to surowy string — patrz komentarz przy readConsentRaw.
  const raw = useSyncExternalStore(subscribeConsent, readConsentRaw, () => null);
  const consent = useMemo(() => parseConsent(raw), [raw]);

  useEffect(() => {
    // Brak decyzji = brak zgody: nie ładujemy nic, dopóki użytkownik nie kliknie.
    if (!GA_MEASUREMENT_ID || !consent) return;
    const signals = gaConsentSignals(consent);
    if (consent.analytics) {
      // Tag już działa → sama zmiana zgody marketingowej idzie sygnałem.
      if (isGaStarted()) pushGaConsentUpdate(signals);
      else startGaIfConsented();
      return;
    }

    // Cofnięcie zgody musi zrobić więcej niż sygnał 'consent update': raz
    // załadowany gtag.js zostaje w pamięci strony i nadal wysyła bezcookie'owe
    // pingi, a zapisane cookies same nie znikną.
    if (isGaStarted()) {
      // Kolejność ma znaczenie: najpierw odetnij tag sygnałem, potem czyść.
      // Odwrotnie gtag.js zdąży odtworzyć cookie sesji (_ga_<id>) przy
      // zamykaniu strony i przeżyje ono przeładowanie — sprawdzone.
      pushGaConsentUpdate(signals);
      clearGaCookies();
      window.location.reload();
      return;
    }

    // Po przeładowaniu tagu nie ma, więc dopiero to kasowanie jest ostateczne.
    clearGaCookies();
  }, [consent]);

  return null;
}
