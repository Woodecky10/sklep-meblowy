"use client";

import { useEffect, useState } from "react";
import LocalizedLink from "../ui/LocalizedLink";
import Image from "next/image";
import { useCart } from "@/app/_context/CartContext";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

const VISIBLE_MS = 3500;

export default function CartToast() {
  const { notification, dismissNotification } = useCart();
  const t = getDictionary(useClientLocale());
  const [visible, setVisible] = useState(false);

  // Nowa notyfikacja → start od ukrytego (fade-in robi timer w efekcie).
  // Wzorzec "adjusting state during render" zamiast setState w ciele efektu.
  const [prevNotification, setPrevNotification] = useState(notification);
  if (notification !== prevNotification) {
    setPrevNotification(notification);
    if (notification) setVisible(false);
  }

  useEffect(() => {
    if (!notification) return;
    // Pokazujemy po pierwszym paint (transition robi fade-in), potem auto-hide
    // i zdjęcie notyfikacji 300ms po zakończeniu fade-out.
    const showTimer = setTimeout(() => setVisible(true), 20);
    const hideTimer = setTimeout(() => setVisible(false), VISIBLE_MS);
    const removeTimer = setTimeout(() => dismissNotification(), VISIBLE_MS + 300);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
      clearTimeout(removeTimer);
    };
  }, [notification, dismissNotification]);

  if (!notification) return null;

  const { item } = notification;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed top-28 right-4 sm:right-6 z-[60] w-[calc(100%-2rem)] sm:w-80 transition-all duration-300 ${
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2 pointer-events-none"
      }`}
    >
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl p-4 flex items-start gap-3">
        <div className="relative w-14 h-14 shrink-0 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800">
          {item.image ? (
            <Image
              src={item.image}
              alt=""
              fill
              sizes="56px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-sans text-[10px] uppercase tracking-widest text-[var(--color-gold)] mb-1">
            {t.cart.toastAdded}
          </p>
          <p className="font-display text-sm font-semibold text-[var(--fg)] truncate">
            {item.name}
          </p>
          <LocalizedLink
            href="/koszyk"
            onClick={() => dismissNotification()}
            className="inline-block mt-2 text-xs font-sans uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
          >
            {t.cart.viewCart} →
          </LocalizedLink>
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(() => dismissNotification(), 300);
          }}
          aria-label={t.common.close}
          className="shrink-0 -mr-1 -mt-1 w-6 h-6 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}
