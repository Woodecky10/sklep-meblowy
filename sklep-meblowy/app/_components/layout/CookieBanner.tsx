"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";
import { localizeHref } from "@/app/_lib/i18n";

// Kategorie cookies zgodne z dobrą praktyką RODO:
// - necessary: zawsze włączone, niezbędne do działania sklepu (sesja, koszyk)
// - analytics: opcjonalne, do analityki (wymaga zgody)
// - marketing: opcjonalne, do remarketingu (wymaga zgody)
export type CookieConsent = {
  necessary: true; // zawsze
  analytics: boolean;
  marketing: boolean;
  version: number;
  decidedAt: string;
};

const STORAGE_KEY = "mollien.cookie-consent";
const CONSENT_VERSION = 1;

// Wspólny styl przycisków wtórnych (Dostosuj/Zapisz/tylko niezbędne).
const secondaryBtnClass =
  "px-5 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--fg)] transition-colors";

export function getConsent(): CookieConsent | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CookieConsent;
    if (parsed.version !== CONSENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(analytics: boolean, marketing: boolean) {
  const consent: CookieConsent = {
    necessary: true,
    analytics,
    marketing,
    version: CONSENT_VERSION,
    decidedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(consent));
  // Pozwala innym komponentom (np. GA loaderowi) zareagować natychmiast.
  window.dispatchEvent(new CustomEvent("cookie-consent", { detail: consent }));
}

// Subskrypcja na decyzję cookie — saveConsent dispatchuje event
// "cookie-consent", więc baner zamyka się sam po zapisie zgody.
function subscribeConsent(callback: () => void): () => void {
  window.addEventListener("cookie-consent", callback);
  return () => window.removeEventListener("cookie-consent", callback);
}

export default function CookieBanner() {
  // useSyncExternalStore zamiast setState-w-efekcie: na serwerze "zgoda
  // rozstrzygnięta" (baner niewidoczny), po hydracji czytamy localStorage.
  const consentDecided = useSyncExternalStore(
    subscribeConsent,
    () => getConsent() !== null,
    () => true
  );
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);
  const locale = useClientLocale();
  const t = getDictionary(locale);

  // saveConsent emituje "cookie-consent" → consentDecided=true → baner znika.
  function acceptAll() {
    saveConsent(true, true);
  }

  function rejectAll() {
    saveConsent(false, false);
  }

  function saveCustom() {
    saveConsent(analytics, marketing);
  }

  // Lewy przycisk pełni dwie role w zależności od stanu: przed rozwinięciem
  // otwiera szczegóły, po rozwinięciu zapisuje wybór niestandardowy.
  function onCustomizeOrSave() {
    if (showDetails) saveCustom();
    else setShowDetails(true);
  }

  if (consentDecided) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 md:p-8">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-2">
              {t.cookies.heading}
            </h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              {t.cookies.body}{" "}
              <Link
                href={localizeHref("/prywatnosc", locale)}
                className="underline text-[var(--color-gold-text)] hover:opacity-80"
              >
                {t.cookies.privacyLink}
              </Link>
              .
            </p>
          </div>

          {showDetails && (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
              <Row
                name={t.cookies.necessary}
                desc={t.cookies.necessaryDesc}
                checked
                disabled
                onChange={() => {}}
              />
              <Row
                name={t.cookies.analytics}
                desc={t.cookies.analyticsDesc}
                checked={analytics}
                onChange={setAnalytics}
              />
              <Row
                name={t.cookies.marketing}
                desc={t.cookies.marketingDesc}
                checked={marketing}
                onChange={setMarketing}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            {/* Jeden przycisk: przed rozwinięciem otwiera szczegóły, po
                rozwinięciu zapisuje wybór niestandardowy (ten sam styl). */}
            <button onClick={onCustomizeOrSave} className={secondaryBtnClass}>
              {showDetails ? t.cookies.save : t.cookies.customize}
            </button>
            <button
              onClick={rejectAll}
              className={secondaryBtnClass}
            >
              {t.cookies.onlyNecessary}
            </button>
            <button
              onClick={acceptAll}
              className="px-5 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors"
            >
              {t.cookies.acceptAll}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({
  name,
  desc,
  checked,
  disabled,
  onChange,
}: {
  name: string;
  desc: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 w-4 h-4 accent-[var(--color-gold)] disabled:opacity-60"
      />
      <div className="flex-1">
        <p className="font-sans text-sm font-semibold text-[var(--fg)]">{name}</p>
        <p className="text-xs text-[var(--muted)] leading-relaxed">{desc}</p>
      </div>
    </label>
  );
}
