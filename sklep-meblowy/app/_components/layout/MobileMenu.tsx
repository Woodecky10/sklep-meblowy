"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/_lib/auth-actions";

export type MobileMenuSection = {
  slug: string;
  label: string;
  categories: { slug: string; label: string }[];
};

export default function MobileMenu({
  isLoggedIn = false,
  isAdmin = false,
  sections = [],
}: {
  isLoggedIn?: boolean;
  isAdmin?: boolean;
  sections?: MobileMenuSection[];
}) {
  const [open, setOpen] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>(null);

  return (
    <>
      <button
        onClick={() => setOpen(!open)}
        className="lg:hidden w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)]"
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
        <div className="absolute top-full left-0 right-0 bg-[var(--card-bg)] border-b border-[var(--border)] shadow-lg lg:hidden">
          <nav className="flex flex-col px-6 py-4 gap-3">
            {sections.map((section) => {
              const cats = section.categories;
              const isOpen = openSection === section.slug;
              return (
                <div key={section.slug}>
                  <button
                    onClick={() => setOpenSection(isOpen ? null : section.slug)}
                    className="w-full flex items-center justify-between font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors py-1"
                  >
                    <span>{section.label}</span>
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className={`transition-transform ${isOpen ? "rotate-180" : ""}`}
                    >
                      <polyline points="6 9 12 15 18 9" />
                    </svg>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-2 mt-2 pl-4 border-l border-[var(--border)]">
                      {cats.map((c) => (
                        <Link
                          key={c.slug}
                          href={`/sklep?kategoria=${c.slug}`}
                          onClick={() => setOpen(false)}
                          className="text-sm text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
                        >
                          {c.label}
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <Link
              href="/o-nas"
              onClick={() => setOpen(false)}
              className="font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors py-1"
            >
              O nas
            </Link>
            <Link
              href="/kontakt"
              onClick={() => setOpen(false)}
              className="font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors py-1"
            >
              Kontakt
            </Link>
            <div className="border-t border-[var(--border)] pt-4 mt-2 flex flex-col gap-4">
              {isLoggedIn ? (
                <>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setOpen(false)}
                      className="font-sans text-sm uppercase tracking-widest text-[var(--color-gold)] font-semibold flex items-center gap-2"
                    >
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                        <rect x="3" y="3" width="7" height="7" rx="1" />
                        <rect x="14" y="3" width="7" height="7" rx="1" />
                        <rect x="3" y="14" width="7" height="7" rx="1" />
                        <rect x="14" y="14" width="7" height="7" rx="1" />
                      </svg>
                      Panel admina
                    </Link>
                  )}
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
