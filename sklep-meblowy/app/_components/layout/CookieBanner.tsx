"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

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

export default function CookieBanner() {
  const [open, setOpen] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const existing = getConsent();
    if (!existing) setOpen(true);
  }, []);

  function acceptAll() {
    saveConsent(true, true);
    setOpen(false);
  }

  function rejectAll() {
    saveConsent(false, false);
    setOpen(false);
  }

  function saveCustom() {
    saveConsent(analytics, marketing);
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl p-6 md:p-8">
        <div className="flex flex-col gap-4">
          <div>
            <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-2">
              Dbamy o Twoją prywatność
            </h2>
            <p className="text-sm text-[var(--muted)] leading-relaxed">
              Używamy plików cookies, aby sklep działał poprawnie i aby móc lepiej rozumieć, jak z
              niego korzystasz. Niezbędne cookies są zawsze aktywne. Analitykę i marketing
              włączamy wyłącznie za Twoją zgodą. Szczegóły w{" "}
              <Link
                href="/prywatnosc"
                className="underline text-[var(--color-gold-text)] hover:opacity-80"
              >
                Polityce prywatności
              </Link>
              .
            </p>
          </div>

          {showDetails && (
            <div className="flex flex-col gap-3 border-t border-[var(--border)] pt-4">
              <Row
                name="Niezbędne"
                desc="Wymagane do działania sklepu: sesja logowania, koszyk, zabezpieczenia."
                checked
                disabled
                onChange={() => {}}
              />
              <Row
                name="Analityczne"
                desc="Anonimowe statystyki ruchu – pomagają ulepszać sklep."
                checked={analytics}
                onChange={setAnalytics}
              />
              <Row
                name="Marketingowe"
                desc="Reklamy dopasowane do Twoich zainteresowań."
                checked={marketing}
                onChange={setMarketing}
              />
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            {!showDetails && (
              <button
                onClick={() => setShowDetails(true)}
                className="px-5 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--fg)] transition-colors"
              >
                Dostosuj
              </button>
            )}
            {showDetails && (
              <button
                onClick={saveCustom}
                className="px-5 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--fg)] transition-colors"
              >
                Zapisz wybór
              </button>
            )}
            <button
              onClick={rejectAll}
              className="px-5 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-full border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--fg)] transition-colors"
            >
              Tylko niezbędne
            </button>
            <button
              onClick={acceptAll}
              className="px-5 py-2.5 text-sm font-sans font-semibold uppercase tracking-wider rounded-full bg-[var(--color-navy)] text-white hover:bg-[var(--color-gold)] transition-colors"
            >
              Akceptuj wszystkie
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
