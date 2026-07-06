"use client";

import { useEffect, useState } from "react";
import { getDictionary } from "@/app/_lib/dictionaries";
import { useClientLocale } from "@/app/_lib/useClientLocale";

// Pływający przycisk powrotu na górę. Zawsze zamontowany — widoczność
// sterowana klasami (opacity + pointer-events), więc SSR i pierwsza klatka
// klienta renderują to samo (ukryty) i nie ma hydration mismatch, a
// pojawianie się jest animowane zamiast skokowe.
const SHOW_AFTER_PX = 600;

export default function BackToTop() {
  const t = getDictionary(useClientLocale());
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > SHOW_AFTER_PX);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label={t.a11y.backToTop}
      aria-hidden={!visible}
      tabIndex={visible ? 0 : -1}
      className={`fixed bottom-6 right-4 sm:right-6 z-40 w-12 h-12 rounded-full bg-[var(--color-navy)] text-white shadow-lg flex items-center justify-center transition-all duration-300 hover:bg-[var(--color-gold)] hover:text-[var(--color-navy)] ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M12 19V5" />
        <path d="m5 12 7-7 7 7" />
      </svg>
    </button>
  );
}
