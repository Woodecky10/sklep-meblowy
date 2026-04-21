"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/_lib/auth-actions";

const links = [
  { href: "/sklep?kategoria=kanapy", label: "Kanapy" },
  { href: "/sklep?kategoria=lozka", label: "Łóżka" },
  { href: "/sklep?kategoria=fotele", label: "Fotele" },
  { href: "/sklep?kategoria=pufy", label: "Pufy" },
];

export default function MobileMenu({ isLoggedIn = false }: { isLoggedIn?: boolean }) {
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
            <div className="border-t border-[var(--border)] pt-4 flex flex-col gap-4">
              {isLoggedIn ? (
                <>
                  <Link
                    href="/konto"
                    onClick={() => setOpen(false)}
                    className="font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    Moje konto
                  </Link>
                  <Link
                    href="/konto/zamowienia"
                    onClick={() => setOpen(false)}
                    className="font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    Zamówienia
                  </Link>
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="font-sans text-sm uppercase tracking-widest text-red-600 hover:text-red-700 transition-colors text-left"
                    >
                      Wyloguj
                    </button>
                  </form>
                </>
              ) : (
                <>
                  <Link
                    href="/logowanie"
                    onClick={() => setOpen(false)}
                    className="font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    Zaloguj się
                  </Link>
                  <Link
                    href="/rejestracja"
                    onClick={() => setOpen(false)}
                    className="font-sans text-sm uppercase tracking-widest text-[var(--color-gold)] font-semibold transition-colors"
                  >
                    Zarejestruj się
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </>
  );
}
