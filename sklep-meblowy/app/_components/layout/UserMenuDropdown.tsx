"use client";

import { useEffect, useRef, useState } from "react";
import LocalizedLink from "../ui/LocalizedLink";
import { signOut } from "@/app/_lib/auth-actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary } from "@/app/_lib/dictionaries";

export default function UserMenuDropdown({
  label,
  initial,
  isAdminUser = false,
}: {
  label: string;
  initial: string;
  isAdminUser?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const t = getDictionary(useClientLocale());

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
        aria-label={t.nav.myAccount}
        aria-haspopup="menu"
        aria-expanded={open}
        className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-full bg-[var(--color-navy)] text-white text-sm font-semibold hover:bg-[var(--color-gold)] transition-colors"
      >
        {initial}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-56 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-lg overflow-hidden z-50">
          <div className="px-4 py-3 border-b border-[var(--border)]">
            <p className="text-xs text-[var(--muted)] uppercase tracking-widest mb-1">
              {t.nav.loggedInAs}
            </p>
            <p className="text-sm font-semibold text-[var(--fg)] truncate">
              {label}
            </p>
          </div>
          <nav className="flex flex-col py-1">
            {isAdminUser && (
              <LocalizedLink
                href="/admin"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[var(--color-gold)] hover:bg-[var(--border)] transition-colors border-b border-[var(--border)]"
              >
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
                {t.nav.adminPanel}
              </LocalizedLink>
            )}
            <LocalizedLink
              href="/konto"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--border)] transition-colors"
            >
              {t.nav.profile}
            </LocalizedLink>
            <LocalizedLink
              href="/konto/zamowienia"
              onClick={() => setOpen(false)}
              className="px-4 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--border)] transition-colors"
            >
              {t.nav.orders}
            </LocalizedLink>
            <form action={signOut} className="border-t border-[var(--border)]">
              <button
                type="submit"
                className="w-full text-left px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
              >
                {t.nav.logout}
              </button>
            </form>
          </nav>
        </div>
      )}
    </div>
  );
}
