"use client";

import { openCookieSettings } from "./CookieBanner";

// Stopka jest serwerowa, a otwarcie banera to akcja kliencka — stąd ten cienki
// most. Etykieta przychodzi z propsa, żeby nie ciągnąć tu całego słownika.
export default function CookieSettingsLink({
  label,
  className,
}: {
  label: string;
  className?: string;
}) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {label}
    </button>
  );
}
