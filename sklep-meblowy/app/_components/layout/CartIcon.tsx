"use client";

import LocalizedLink from "../ui/LocalizedLink";
import { useCart } from "@/app/_context/CartContext";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

export default function CartIcon() {
  const { count } = useCart();
  const t = getDictionary(useClientLocale());
  return (
    <LocalizedLink
      href="/koszyk"
      className="relative w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] transition-colors"
      aria-label={t.nav.cart}
    >
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
        <line x1="3" y1="6" x2="21" y2="6" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-[var(--color-gold)] text-white text-[10px] font-bold flex items-center justify-center leading-none">
          {count > 9 ? "9+" : count}
        </span>
      )}
    </LocalizedLink>
  );
}
