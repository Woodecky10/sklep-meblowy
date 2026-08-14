"use client";

import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import {
  parseConsent,
  readConsentRaw,
  subscribeConsent,
} from "@/app/_components/layout/CookieBanner";
import { META_PIXEL_ID } from "@/app/_lib/meta-pixel";
import {
  clearPixelCookies,
  isPixelStarted,
  revokePixel,
  startPixelWithPageView,
} from "@/app/_lib/meta-pixel-client";

// Ładuje pixel Meta DOPIERO po zgodzie na cookies MARKETINGOWE — nie
// analityczne. Pixel służy remarketingowi (kierowaniu reklam na Facebooku i
// Instagramie do osób, które były w sklepie), więc podpięcie go pod zgodę
// „Analityczne" oznaczałoby zbieranie danych reklamowych od ludzi, którzy
// zgodzili się wyłącznie na statystyki.
//
// Cała mechanika `fbq` siedzi w app/_lib/meta-pixel-client.ts — tutaj zostaje
// tylko reakcja na zmianę zgody i na zmianę adresu.

export default function MetaPixel() {
  // Snapshot to surowy string — patrz komentarz przy readConsentRaw.
  const raw = useSyncExternalStore(subscribeConsent, readConsentRaw, () => null);
  const consent = useMemo(() => parseConsent(raw), [raw]);
  const pathname = usePathname();

  // Ostatni adres, z którego poszedł PageView. Bez tego ponowne zapisanie zgody
  // w banerze (zmienia się `decidedAt`, więc i obiekt zgody) wysyłałoby drugi
  // PageView z tej samej strony.
  const lastTrackedPath = useRef<string | null>(null);

  useEffect(() => {
    // Brak decyzji = brak zgody: nie ładujemy nic, dopóki użytkownik nie kliknie.
    if (!META_PIXEL_ID || !consent) return;

    if (consent.marketing) {
      // Next nie przeładowuje dokumentu przy przejściu między podstronami, więc
      // bez tego pixel widziałby wyłącznie stronę wejścia.
      if (lastTrackedPath.current === pathname) return;
      lastTrackedPath.current = pathname;
      startPixelWithPageView();
      return;
    }

    // Cofnięcie zgody: fbevents.js raz załadowany zostaje w pamięci strony,
    // więc sam sygnał nie wystarcza — trzeba przeładować dokument.
    if (isPixelStarted()) {
      revokePixel();
      window.location.reload();
      return;
    }

    // Po przeładowaniu skryptu nie ma, więc dopiero to kasowanie jest ostateczne.
    lastTrackedPath.current = null;
    clearPixelCookies();
  }, [consent, pathname]);

  return null;
}
