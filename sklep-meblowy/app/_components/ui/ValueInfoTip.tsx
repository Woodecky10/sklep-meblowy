"use client";

import { useEffect, useId, useRef, useState } from "react";

// Mały dostępny tooltip przy wartości wariantu. Pokazuje krótką informację na
// hover i focus (CSS: group-hover/group-focus-within) oraz na klik/tap (mobile).
export default function ValueInfoTip({ text }: { text: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  // Tooltip otwarty tapnięciem (mobile) zamykamy Escape'em oraz kliknięciem poza
  // — hover/focus na desktopie i tak działa niezależnie przez CSS. Listenery
  // dokładamy tylko gdy otwarty (capture: łapiemy przed innymi handlerami).
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onPointerDown(e: Event) {
      const t = e.target;
      if (!(t instanceof Node) || !ref.current?.contains(t)) setOpen(false);
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex group align-middle">
      <button
        type="button"
        aria-label="Informacja o wariancie"
        aria-describedby={id}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[10px] leading-none text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] cursor-help"
      >
        i
      </button>
      <span
        id={id}
        role="tooltip"
        className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 w-max max-w-[220px] rounded-lg bg-[var(--color-navy)] text-white text-xs font-sans leading-snug px-2.5 py-1.5 shadow-lg pointer-events-none transition-opacity ${
          open ? "opacity-100" : "opacity-0"
        } group-hover:opacity-100 group-focus-within:opacity-100`}
      >
        {text}
      </span>
    </span>
  );
}
