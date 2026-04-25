"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/app/_context/CartContext";

const VISIBLE_MS = 3500;

export default function CartToast() {
  const { notification, dismissNotification } = useCart();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!notification) return;
    setVisible(true);
    const hideTimer = setTimeout(() => setVisible(false), VISIBLE_MS);
    const removeTimer = setTimeout(() => dismissNotification(), VISIBLE_MS + 300);
    return () => {
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
            Dodano do koszyka
          </p>
          <p className="font-display text-sm font-semibold text-[var(--fg)] truncate">
            {item.name}
          </p>
          <Link
            href="/koszyk"
            onClick={() => dismissNotification()}
            className="inline-block mt-2 text-xs font-sans uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
          >
            Zobacz koszyk →
          </Link>
        </div>
        <button
          onClick={() => {
            setVisible(false);
            setTimeout(() => dismissNotification(), 300);
          }}
          aria-label="Zamknij"
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
