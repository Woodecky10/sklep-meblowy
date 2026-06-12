import { useEffect, useRef, type RefObject } from "react";

// Wspólna dostępność modali (audyt 2026-06-11 LOW: modale bez blokady scrolla
// tła ani focus-trapu; InquiryModal bez Escape). Hook robi:
//   - blokadę scrolla tła (body overflow hidden) na czas otwarcia,
//   - Escape → onClose (jeśli podany),
//   - focus-trap Tab/Shift+Tab w obrębie containerRef (jeśli trapFocus),
//   - przywrócenie focusu do elementu sprzed otwarcia po zamknięciu.
//
// Generyk po elemencie kontenera, żeby uniknąć problemów z wariancją
// RefObject (useRef<HTMLDivElement> nie przypisuje się do RefObject<HTMLElement>).
export function useModal<E extends HTMLElement = HTMLElement>(
  active: boolean,
  options: {
    onClose?: () => void;
    containerRef?: RefObject<E | null>;
    trapFocus?: boolean;
  } = {}
) {
  const { onClose, containerRef, trapFocus } = options;
  // onClose w ref — efekt nie zależy od jego tożsamości (caller nie musi
  // owijać w useCallback, bez re-runu przy każdym renderze). Aktualizacja
  // refa w efekcie (nie w renderze) — wymóg react-hooks/refs.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!active) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const FOCUSABLE =
      'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';
    const focusables = (): HTMLElement[] => {
      const el = containerRef?.current;
      if (!el) return [];
      return Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    };

    // Początkowy focus do wnętrza modala — bez tego trap nie zadziała, dopóki
    // user sam nie kliknie w środku (Tab z triggera uciekłby poza modal).
    if (trapFocus) focusables()[0]?.focus();

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && onCloseRef.current) {
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !trapFocus) return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const el = document.activeElement;
      if (e.shiftKey && el === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && el === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, [active, containerRef, trapFocus]);
}
