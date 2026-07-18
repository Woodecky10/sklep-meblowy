"use client";

import { useSyncExternalStore } from "react";
import LocalizedLink from "../ui/LocalizedLink";
import type { Locale } from "@/app/_lib/i18n";
import {
  type PromoBannerData,
  PROMO_COLOR_CLASSES,
  promoKey,
} from "@/app/_lib/promo-banner";

// Baner promocyjny nad topbarem. Dane z serwera (layout). Tekst wg locale
// (DE z fallbackiem na PL). Zamknięcie (X) zapamiętane w localStorage kluczem
// = hash treści PL → zmiana tekstu przez admina pokazuje baner znów.
const DISMISS_STORAGE_KEY = "promo-dismissed";
const DISMISS_EVENT = "promo-dismissed";

// useSyncExternalStore zamiast setState-w-efekcie (wzorzec CookieBanner):
// serwer + pierwszy render klienta = NIE zdismissowany (baner widoczny),
// po hydracji czytamy localStorage. Subskrypcja na własny X (DISMISS_EVENT)
// i zmiany w innej karcie ("storage"). Hydration-safe, bez cascading renders.
function subscribeDismiss(callback: () => void): () => void {
  window.addEventListener(DISMISS_EVENT, callback);
  window.addEventListener("storage", callback);
  return () => {
    window.removeEventListener(DISMISS_EVENT, callback);
    window.removeEventListener("storage", callback);
  };
}

function readDismissed(key: string): boolean {
  try {
    return localStorage.getItem(DISMISS_STORAGE_KEY) === key;
  } catch {
    return false; // brak localStorage (prywatny tryb) — pokaż baner
  }
}

export default function PromoBanner({
  data,
  locale,
  closeLabel,
}: {
  data: PromoBannerData;
  locale: Locale;
  closeLabel: string;
}) {
  const text =
    locale === "de" ? data.text_de ?? data.text : data.text;
  const key = promoKey(data.text);

  const dismissed = useSyncExternalStore(
    subscribeDismiss,
    () => readDismissed(key),
    () => false
  );

  if (!data.enabled || !text || dismissed) return null;

  function close() {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, key);
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(DISMISS_EVENT));
  }

  const colorCls = PROMO_COLOR_CLASSES[data.color];
  // Wewnętrzny link (/...) przez LocalizedLink; „//" to protocol-relative
  // (zewnętrzny) — traktuj jak zewnętrzny.
  const isInternal = data.link
    ? data.link.startsWith("/") && !data.link.startsWith("//")
    : false;
  const inner = (
    <span className="flex-1 text-center px-4 truncate">{text}</span>
  );

  return (
    <div className={`relative text-xs sm:text-sm font-medium ${colorCls}`}>
      <div className="max-w-7xl mx-auto px-10 h-9 flex items-center justify-center">
        {data.link ? (
          isInternal ? (
            <LocalizedLink href={data.link} className="flex-1 text-center px-4 truncate hover:underline">
              {text}
            </LocalizedLink>
          ) : (
            <a href={data.link} target="_blank" rel="noopener noreferrer" className="flex-1 text-center px-4 truncate hover:underline">
              {text}
            </a>
          )
        ) : (
          inner
        )}
      </div>
      <button
        type="button"
        onClick={close}
        aria-label={closeLabel}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center rounded-full hover:bg-black/10"
      >
        <svg aria-hidden="true" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
