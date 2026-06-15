"use client";

import { useState } from "react";
import { useClientLocale } from "@/app/_lib/useClientLocale";

// Interaktywny input oceny — hover + click.
export default function StarInput({
  value,
  onChange,
  size = 28,
}: {
  value: number;
  onChange: (v: number) => void;
  size?: number;
}) {
  const [hover, setHover] = useState(0);
  const display = hover || value;
  const de = useClientLocale() === "de";

  return (
    <div className="inline-flex items-center gap-1" role="radiogroup" aria-label={de ? "Bewertung" : "Ocena"}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} / 5`}
          onMouseEnter={() => setHover(n)}
          onMouseLeave={() => setHover(0)}
          onClick={() => onChange(n)}
          className="transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-[var(--color-gold)] rounded-sm"
        >
          <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
            <path
              d="M12 2 l3.09 6.26 L22 9.27 l-5 4.87 L18.18 22 L12 18.27 L5.82 22 L7 14.14 l-5 -4.87 L8.91 8.26 z"
              fill={display >= n ? "var(--color-gold)" : "var(--border)"}
            />
          </svg>
        </button>
      ))}
      {value > 0 && (
        <span className="ml-2 text-xs font-sans text-[var(--muted)]">{value} / 5</span>
      )}
    </div>
  );
}
