"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { computeTooltipPosition } from "@/app/_lib/tooltip-placement";

// Mały dostępny tooltip przy wartości wariantu. Pokazuje krótką informację na
// hover, focus i klik/tap (mobile).
//
// Dymek renderujemy PORTALEM do <body> z position: fixed, a nie w flow strony,
// bo w flow był ucinany: zawsze otwierał się w górę i przy pierwszej grupie
// opcji wjeżdżał pod przyklejony nagłówek (sticky z-50, ~133 px), a w rozwiniętej
// liście tkanin dodatkowo przycinał go overflow-hidden karty grupy i poziomy
// overflow-x: clip z globals.css. Portal + computeTooltipPosition (wybór strony
// nad/pod kotwicą + clamp do viewportu) rozwiązuje wszystkie trzy naraz.
//
// Konsekwencja portalu: CSS-owe group-hover/group-focus-within już nie zadziała
// (dymek nie jest potomkiem kafelka), więc otwieranie trzymamy w stanie JS.
export default function ValueInfoTip({ text }: { text: string }) {
  const id = useId();
  // Trzy niezależne powody widoczności — suma odtwarza dawne zachowanie CSS:
  // najazd myszą pokazuje dymek NIEZALEŻNIE od tego, czy klik go „przypiął".
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const [pinned, setPinned] = useState(false);
  const open = hovered || focused || pinned;

  // Pozycja liczona po pomiarze; null = pierwszy przebieg (dymek niewidoczny).
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLSpanElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  // Hover na CAŁYM kafelku próbki (SwatchButton ma klasę `group`) — tak działał
  // dawny group-hover. Zwykły chip nie ma przodka `.group`, więc hostem zostaje
  // sam wrapper, czyli hover działa na ikonce „i". Dotyk pomijamy — tam klik.
  useEffect(() => {
    const host: HTMLElement | null =
      ref.current?.closest<HTMLElement>(".group") ?? ref.current;
    if (!host) return;
    function onEnter(e: PointerEvent) {
      if (e.pointerType === "touch") return;
      setHovered(true);
    }
    function onLeave() {
      setHovered(false);
    }
    host.addEventListener("pointerenter", onEnter);
    host.addEventListener("pointerleave", onLeave);
    return () => {
      host.removeEventListener("pointerenter", onEnter);
      host.removeEventListener("pointerleave", onLeave);
    };
  }, []);

  // Pomiar dwuprzebiegowy: najpierw dymek jest w DOM, ale niewidoczny
  // (visibility: hidden) — dopiero wtedy znamy jego realną wysokość/szerokość
  // i możemy wybrać stronę oraz sclampować pozycję. setPos porównuje wartości,
  // więc scroll bez zmiany pozycji nie wywołuje re-renderu (zero pętli).
  //
  // Po zamknięciu NIE zerujemy pozycji: przy kolejnym otwarciu ten efekt
  // przelicza ją jeszcze przed malowaniem klatki, więc stara wartość nigdy nie
  // mignie. Rozmiar dymka jest niezależny od pozycji (w-max = width: max-content
  // + max-w-[220px]), więc pomiar „na starych współrzędnych" też jest poprawny.
  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const anchorEl = btnRef.current;
      const tipEl = tipRef.current;
      if (!anchorEl || !tipEl) return;
      const a = anchorEl.getBoundingClientRect();
      const t = tipEl.getBoundingClientRect();
      // Dolna krawędź przyklejonego nagłówka = „sufit" dla dymka. Poza sklepem
      // (np. admin) nagłówka nie ma → 0. Ujemne (przewinięty) też traktujemy jak 0.
      const headerBottom =
        document.querySelector("[data-sticky-header]")?.getBoundingClientRect().bottom ?? 0;
      const next = computeTooltipPosition({
        anchor: { top: a.top, left: a.left, width: a.width, height: a.height },
        tip: { width: t.width, height: t.height },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        topInset: Math.max(0, headerBottom),
      });
      setPos((prev) =>
        prev && prev.top === next.top && prev.left === next.left
          ? prev
          : { top: next.top, left: next.left }
      );
    }
    update();
    // capture: łapiemy też przewijanie kontenerów wewnętrznych (scroll nie bąbelkuje).
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [open, text]);

  // Dymek „przypięty" tapnięciem/klikiem zamykamy Escape'em oraz kliknięciem
  // poza ikonką (capture: łapiemy przed innymi handlerami). Dymek jest
  // pointer-events-none, więc nigdy nie bywa celem zdarzenia.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      setPinned(false);
      setFocused(false);
    }
    function onPointerDown(e: Event) {
      const t = e.target;
      if (!(t instanceof Node) || !ref.current?.contains(t)) setPinned(false);
    }
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  return (
    <span ref={ref} className="relative inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        aria-label="Informacja o wariancie"
        aria-describedby={open ? id : undefined}
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setPinned((v) => !v);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(e) => e.stopPropagation()}
        className="w-4 h-4 inline-flex items-center justify-center rounded-full border border-[var(--border)] text-[10px] leading-none text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-gold)] cursor-help"
      >
        i
      </button>
      {/* Portal tylko gdy otwarty — dzięki temu serwerowy HTML go nie zawiera
          i nie ma niezgodności hydracji. z-[60]: nad nagłówkiem (z-50), pod
          toastami (z-[70]). Ramka + cień: w motywach, gdzie --color-navy równa
          się tłu strony, samo tło nie odcinałoby dymka od reszty. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={tipRef}
            id={id}
            role="tooltip"
            style={{
              position: "fixed",
              top: pos ? pos.top : 0,
              left: pos ? pos.left : 0,
              visibility: pos ? "visible" : "hidden",
            }}
            className={`z-[60] w-max max-w-[220px] rounded-lg border border-[var(--border)] bg-[var(--color-navy)] text-white text-xs font-sans leading-snug px-2.5 py-1.5 shadow-lg pointer-events-none transition-opacity ${
              pos ? "opacity-100" : "opacity-0"
            }`}
          >
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
