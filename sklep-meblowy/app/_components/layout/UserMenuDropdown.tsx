"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/_lib/auth-actions";

export default function UserMenuDropdown({
  label,
  initial,
}: {
  label: string;
  initial: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Moje konto"
        className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-full bg-[var(--color-navy)] text-white text-sm font-semibold hover:bg-[var(--color-gold)] transition-colors"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--muted)] uppercase tracking-widest mb-1">
              Zalogowano jako
            </p>
            <p className="text-sm font-semibold text-[var(--fg)] truncate">
              {label}
            </p>
          </div>
          <nav className="flex flex-col py-1">
            <Link
              href="/konto"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--border)] transition-colors"
            >
              Profil
            </Link>
            <Link
              href="/konto/zamowienia"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--border)] transition-colors"
            >
              Zamówienia
            </Link>
            <form action={signOut} className="border-t border-[var(--border)]">
              <button
                type="submit"
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
              >
                Wyloguj
              </button>
            </form>
          </nav>
        </div>
      )}
    </div>
  );
}
