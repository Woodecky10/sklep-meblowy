"use client";

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  parseConsent,
  readConsentRaw,
  subscribeConsent,
} from "@/app/_components/layout/CookieBanner";
import {
  GA_MEASUREMENT_ID,
  gaConsentSignals,
  type ConsentSignals,
} from "@/app/_lib/analytics";

// Ładuje gtag.js DOPIERO po zgodzie na cookies analityczne. Snippet od Google
// wkleja skrypt bezwarunkowo w <head> — tutaj jest inaczej z dwóch powodów:
//
// 1. RODO: baner ma przełącznik „Analityczne", więc musi on realnie decydować
//    o załadowaniu GA, a nie być ozdobą.
// 2. CSP: script-src nie ma 'unsafe-inline' (app/_lib/csp.ts), więc inline
//    <script> ze snippetu zostałby zablokowany. Skrypt wstrzykiwany z JS-a
//    bundla przechodzi dzięki 'strict-dynamic' — zaufanie dziedziczy się ze
//    skryptu, który go wstawia, bez dopisywania hostów do script-src.

declare global {
  interface Window {
    dataLayer?: unknown[];
  }
}

// Odpowiednik `function gtag(){dataLayer.push(arguments)}` ze snippetu Google.
// MUSI pushować obiekt `arguments`, nie tablicę — gtag.js czyta kolejkę po
// właściwościach `arguments` i tablica jest po cichu ignorowana. Stąd function
// expression zamiast strzałki.
const gtag: (...args: unknown[]) => void = function () {
  // Rest params dałyby tablicę, a gtag.js czyta wyłącznie obiekt `arguments` —
  // podmiana nie wywala błędu, tylko po cichu zabija pomiar. Stąd wyjątek:
  // eslint-disable-next-line prefer-rest-params
  (window.dataLayer ??= []).push(arguments);
};

// Skrypt wstrzykujemy raz na życie dokumentu, niezależnie od remountów.
let tagStarted = false;

function startTag(id: string, signals: ConsentSignals) {
  if (tagStarted) return;
  tagStarted = true;

  window.dataLayer ??= [];
  // Kolejność wg Google: consent 'default' MUSI trafić do kolejki przed
  // config, inaczej pierwsze zdarzenie poleci z domyślami Google, nie naszymi.
  gtag("consent", "default", {
    analytics_storage: "denied",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  gtag("consent", "update", signals);
  gtag("js", new Date());
  gtag("config", id);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
  document.head.appendChild(script);
}

// Wymaga wystartowanego tagu — pilnuje tego wywołujący.
function pushConsentUpdate(signals: ConsentSignals) {
  gtag("consent", "update", signals);
}

function clearGaCookies() {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n.startsWith("_ga") || n === "_gid");
  if (names.length === 0) return;

  // GA zapisuje cookie na domenie rejestrowalnej (.mollien.pl), a nie na
  // hoście (www.mollien.pl) — kasowanie działa tylko przy zgodnym atrybucie
  // domain, więc lecimy po wszystkich wariantach od hosta w górę.
  const parts = window.location.hostname.split(".");
  const domains: (string | null)[] = [null];
  for (let i = 0; i <= parts.length - 2; i++) {
    const domain = parts.slice(i).join(".");
    domains.push(domain, `.${domain}`);
  }

  for (const name of names) {
    for (const domain of domains) {
      const scope = domain ? `; domain=${domain}` : "";
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${scope}`;
    }
  }
}

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
      if (tagStarted) pushConsentUpdate(signals);
      else startTag(GA_MEASUREMENT_ID, signals);
      return;
    }

    // Cofnięcie zgody musi zrobić więcej niż sygnał 'consent update': raz
    // załadowany gtag.js zostaje w pamięci strony i nadal wysyła bezcookie'owe
    // pingi, a zapisane cookies same nie znikną.
    if (tagStarted) {
      // Kolejność ma znaczenie: najpierw odetnij tag sygnałem, potem czyść.
      // Odwrotnie gtag.js zdąży odtworzyć cookie sesji (_ga_<id>) przy
      // zamykaniu strony i przeżyje ono przeładowanie — sprawdzone.
      pushConsentUpdate(signals);
      clearGaCookies();
      window.location.reload();
      return;
    }

    // Po przeładowaniu tagu nie ma, więc dopiero to kasowanie jest ostateczne.
    clearGaCookies();
  }, [consent]);

  return null;
}
