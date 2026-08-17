// Runtime GA4 — wszystko, co dotyka `window.dataLayer`. Osobno od
// app/_lib/analytics.ts (czysta logika: identyfikator + mapowanie zgód) i od
// GoogleAnalytics.tsx (glue reactowy), bo zdarzenia wysyłają z siebie miejsca
// rozrzucone po appce: karta produktu, koszyk, strona podziękowania.
//
// Bliźniak app/_lib/meta-pixel-client.ts — ta sama konstrukcja, inny dostawca.
//
// ⚠️ Snippet od Google jest tu przepisany, a nie wklejony. Powód: script-src NIE
// ma 'unsafe-inline' (app/_lib/csp.ts), więc inline <script> ze snippetu
// zostałby zablokowany. Skrypt wstrzykiwany z JS-a bundla przechodzi dzięki
// 'strict-dynamic' — zaufanie dziedziczy się ze skryptu, który go wstawia.

import { getConsent } from "@/app/_components/layout/CookieBanner";
import {
  GA_MEASUREMENT_ID,
  gaConsentSignals,
  type ConsentSignals,
} from "@/app/_lib/analytics";

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

/**
 * Startuje tag, jeśli GA jest skonfigurowane I użytkownik zgodził się na cookies
 * analityczne. Idempotentne — wołane i przez komponent, i przez każde zdarzenie.
 *
 * ⚠️ Zgodę czytamy TUTAJ, a nie polegamy na tym, że komponent GoogleAnalytics
 * zdążył wystartować. Efekty Reacta lecą od dzieci do rodziców, więc zdarzenie
 * ze strony (np. purchase na /checkout/success) odpala się ZANIM efekt
 * GoogleAnalytics z layoutu. Bez tego pierwsze zdarzenie po wejściu na stronę
 * ginęłoby — a akurat na stronie podziękowania to JEDYNE zdarzenie, jakie tam
 * poleci.
 */
export function startGaIfConsented(): boolean {
  if (!GA_MEASUREMENT_ID) return false;
  const consent = getConsent();
  if (!consent?.analytics) return false;

  startTag(GA_MEASUREMENT_ID, gaConsentSignals(consent));
  return true;
}

/**
 * Wysyła zdarzenie GA4. Bez zgody analitycznej nie robi NIC — to jedyna bramka,
 * więc wywołujący nie musi sprawdzać zgody u siebie.
 *
 * ⚠️ Bramka jest INNA niż przy pixelu Meta (tam: zgoda marketingowa). To celowe:
 * GA4 to narzędzie analityczne, pixel to remarketing. Efekt uboczny, który
 * będzie widać w raportach: liczby w GA4 i w Menedżerze reklam nie będą równe.
 */
export function trackGaEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  if (!startGaIfConsented()) return;
  gtag("event", name, params ?? {});
}

/** Wymaga wystartowanego tagu — pilnuje tego wywołujący. */
export function pushGaConsentUpdate(signals: ConsentSignals): void {
  gtag("consent", "update", signals);
}

/** Czy tag zdążył wystartować w tym życiu dokumentu (do obsługi cofnięcia zgody). */
export function isGaStarted(): boolean {
  return tagStarted;
}

export function clearGaCookies(): void {
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
