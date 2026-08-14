// Runtime pixela Meta — wszystko, co dotyka `window.fbq`. Osobno od
// app/_lib/meta-pixel.ts (czysta logika, importowana też przez proxy) i od
// MetaPixel.tsx (glue reactowy), bo zdarzenia wysyłają z siebie miejsca
// rozrzucone po appce: koszyk, karta produktu, strona podziękowania.
//
// ⚠️ Snippet z Menedżera zdarzeń Meta jest tu przepisany, a nie wklejony.
// Powód: script-src NIE ma 'unsafe-inline' (app/_lib/csp.ts), więc inline
// <script> ze snippetu zostałby zablokowany. Skrypt wstrzykiwany z JS-a bundla
// przechodzi dzięki 'strict-dynamic' — zaufanie dziedziczy się ze skryptu,
// który go wstawia.

import { getConsent } from "@/app/_components/layout/CookieBanner";
import { META_PIXEL_ID } from "@/app/_lib/meta-pixel";

// Kolejka fbq przyjmuje obiekty `arguments`, dokładnie jak dataLayer w gtag.
type FbqFn = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[];
  loaded: boolean;
  version: string;
};

declare global {
  interface Window {
    fbq?: FbqFn;
    _fbq?: FbqFn;
  }
}

// Skrypt wstrzykujemy raz na życie dokumentu, niezależnie od remountów.
let pixelStarted = false;

// Odpowiednik `n=f.fbq=function(){...}` ze snippetu Meta. MUSI pushować obiekt
// `arguments`, nie tablicę — fbevents.js po załadowaniu odtwarza kolejkę,
// czytając ją jak listę argumentów, i tablica jest po cichu ignorowana. Stąd
// function expression zamiast strzałki.
function ensureFbq(): FbqFn {
  if (window.fbq) return window.fbq;

  const fbq = function (this: unknown) {
    // Rest params dałyby tablicę — patrz komentarz wyżej.
    // eslint-disable-next-line prefer-rest-params
    const args = arguments;
    // Wywołanie metodą na `fbq` ustawia `this` tak samo jak `.apply(fbq, …)`
    // w oryginalnym snippecie. Do KOLEJKI trafia natomiast surowy `arguments`,
    // bo tego formatu oczekuje fbevents.js przy jej odtwarzaniu.
    if (fbq.callMethod) fbq.callMethod(...(args as unknown as unknown[]));
    else fbq.queue.push(args);
  } as unknown as FbqFn;

  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = "2.0";

  window.fbq = fbq;
  // `_fbq` to alias, którego szuka sam fbevents.js przy starcie.
  window._fbq ??= fbq;
  return fbq;
}

// Startuje pixel, jeśli jest skonfigurowany I użytkownik zgodził się na cookies
// marketingowe. Idempotentne — wołane i przez komponent, i przez każde
// zdarzenie.
//
// ⚠️ Zgodę czytamy TUTAJ, a nie polegamy na tym, że komponent MetaPixel zdążył
// wystartować. Efekty Reacta lecą od dzieci do rodziców, więc zdarzenie ze
// strony (np. Purchase na /checkout/success) odpala się ZANIM efekt MetaPixel
// z layoutu. Bez tego pierwsze zdarzenie po wejściu na stronę ginęłoby.
function startPixelIfConsented(): FbqFn | null {
  if (!META_PIXEL_ID) return null;
  if (!getConsent()?.marketing) return null;

  const fbq = ensureFbq();
  if (pixelStarted) return fbq;
  pixelStarted = true;

  fbq("init", META_PIXEL_ID);

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  document.head.appendChild(script);

  return fbq;
}

/**
 * Wysyła standardowe zdarzenie pixela. Bez zgody marketingowej nie robi NIC —
 * to jedyna bramka, więc wywołujący nie musi sprawdzać zgody u siebie.
 *
 * `eventId` włącza deduplikację po stronie Meta: to samo id wysłane drugi raz
 * (odświeżenie strony podziękowania) liczy się jako jedno zdarzenie.
 */
export function trackPixel(
  event: string,
  params?: Record<string, unknown>,
  eventId?: string
): void {
  if (typeof window === "undefined") return;
  const fbq = startPixelIfConsented();
  if (!fbq) return;
  fbq("track", event, params ?? {}, eventId ? { eventID: eventId } : undefined);
}

/** Start pixela + PageView. Woła wyłącznie komponent MetaPixel. */
export function startPixelWithPageView(): void {
  if (startPixelIfConsented()) trackPixel("PageView");
}

/** Czy pixel zdążył wystartować w tym życiu dokumentu (do obsługi cofnięcia zgody). */
export function isPixelStarted(): boolean {
  return pixelStarted;
}

/**
 * Cofnięcie zgody. Sam sygnał `consent revoke` nie wystarcza: raz załadowany
 * fbevents.js zostaje w pamięci strony, a zapisane cookies same nie znikną.
 * Kolejność jak przy GA — najpierw odetnij, potem czyść.
 */
export function revokePixel(): void {
  if (pixelStarted) window.fbq?.("consent", "revoke");
  clearPixelCookies();
}

// `_fbp` (identyfikator przeglądarki) i `_fbc` (klik z reklamy) to jedyne
// cookies, jakie zapisuje pixel.
export function clearPixelCookies(): void {
  const names = document.cookie
    .split(";")
    .map((c) => c.split("=")[0].trim())
    .filter((n) => n === "_fbp" || n === "_fbc");
  if (names.length === 0) return;

  // Pixel zapisuje cookie na domenie rejestrowalnej (.mollien.pl), a nie na
  // hoście (www.mollien.pl) — kasowanie działa tylko przy zgodnym atrybucie
  // domain, więc lecimy po wszystkich wariantach od hosta w górę. Ten sam
  // problem i to samo lekarstwo co w GoogleAnalytics.tsx.
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
