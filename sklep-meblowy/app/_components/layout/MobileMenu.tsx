"use client";

import { useState } from "react";
import Link from "next/link";

const links = [
  { href: "/sklep?kategoria=kanapy", label: "Kanapy" },
  { href: "/sklep?kategoria=lozka", label: "Łóżka" },
  { href: "/sklep?kategoria=fotele", label: "Fotele" },
  { href: "/sklep?kategoria=pufy", label: "Pufy" },
];

export default function MobileMenu() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="md:hidden w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)]"
        aria-label="Menu"
      >
        {open ? (
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        ) : (
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 bg-[var(--card-bg)] border-b border-[var(--border)] shadow-lg md:hidden">
          <nav className="flex flex-col px-6 py-4 gap-4">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                onClick={() => setOpen(false)}
                className="font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>
      )}
    </>
  );
}
