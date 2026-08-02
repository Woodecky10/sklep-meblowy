"use client";

import { useState } from "react";
import Link from "next/link";
import { signOut } from "@/app/_lib/auth-actions";
import UnsavedChangesGuard from "./UnsavedChangesGuard";
import BackToTop from "@/app/_components/layout/BackToTop";

const NAV_ITEMS = [
  { href: "/admin", label: "Pulpit", icon: DashboardIcon },
  { href: "/admin/zamowienia", label: "Zamówienia", icon: OrdersIcon },
  { href: "/admin/produkty", label: "Produkty", icon: ProductsIcon },
  { href: "/admin/strona-glowna", label: "Strona główna", icon: HomeIcon },
  { href: "/admin/podstrony", label: "Podstrony", icon: PagesIcon },
  { href: "/admin/wyglad", label: "Wygląd", icon: PaletteIcon },
  { href: "/admin/polecane", label: "Polecane", icon: StarIcon },
  { href: "/admin/slider", label: "Slider", icon: SliderIcon },
  { href: "/admin/kafelki", label: "Kafelki", icon: TilesIcon },
  { href: "/admin/kategorie", label: "Kategorie", icon: CategoriesIcon },
  { href: "/admin/kolekcje", label: "Kolekcje", icon: CollectionsIcon },
  { href: "/admin/zestawy", label: "Zestawy", icon: BundlesIcon },
  { href: "/admin/tkaniny", label: "Tkaniny", icon: FabricsIcon },
  { href: "/admin/kody-rabatowe", label: "Kody rabatowe", icon: TicketIcon },
  { href: "/admin/zapytania", label: "Zapytania", icon: InboxIcon },
  { href: "/admin/probki", label: "Próbki", icon: SwatchIcon },
  { href: "/admin/reklamacje", label: "Reklamacje", icon: ComplaintsIcon },
];

// Licznik przy pozycji nawigacji — jedna reguła dla wszystkich badge'y.
// `label` idzie w aria-label, bo sama cyfra nic czytnikowi ekranu nie mówi.
function navBadge(
  href: string,
  counts: { newIssues: number; newOrders: number; newSamples: number }
): { count: number; label: string } | null {
  if (href === "/admin/reklamacje" && counts.newIssues > 0) {
    return { count: counts.newIssues, label: "nowe zgłoszenia" };
  }
  if (href === "/admin/zamowienia" && counts.newOrders > 0) {
    return { count: counts.newOrders, label: "nowe zamówienia" };
  }
  // Licznik próbek to „ile czeka na moją reakcję": zamówienia gotowe do
  // spakowania ORAZ anulowane, za które klient zapłacił (pieniądze do ręcznego
  // zwrotu w P24). Nieopłacone świadomie nie wchodzą (getNewSampleOrdersCount),
  // bo badge ma znaczyć pracę do zrobienia, a zamówieniem bez wpłaty
  // właścicielka się nie zajmuje. Etykieta MUSI obejmować oba przypadki —
  // „nowe zamówienia próbek" kłamałoby przy pozycji do zwrotu pieniędzy.
  if (href === "/admin/probki" && counts.newSamples > 0) {
    return { count: counts.newSamples, label: "zamówienia próbek do obsłużenia" };
  }
  return null;
}

export default function AdminShell({
  userEmail,
  newIssues,
  newOrders,
  newSamples,
  children,
}: {
  userEmail: string | null;
  newIssues: number;
  newOrders: number;
  newSamples: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[var(--bg)] lg:flex">
      <UnsavedChangesGuard />
      <BackToTop />
      {/* Pasek mobilny z hamburgerem (tylko < lg) */}
      <header className="lg:hidden sticky top-0 z-30 flex items-center justify-between h-14 px-4 border-b border-[var(--border)] bg-[var(--card-bg)]">
        <Link
          href="/admin"
          className="font-display text-lg font-bold text-[var(--color-navy)] dark:text-[var(--color-gold)]"
        >
          Mollien
          <span className="ml-2 font-sans text-[10px] uppercase tracking-[0.25em] text-[var(--color-gold-text)]">
            Admin
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Otwórz menu"
          aria-expanded={open}
          className="w-9 h-9 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)]"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </header>

      {/* Backdrop (tylko gdy drawer otwarty, < lg) */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar — statyczny na lg, wysuwany drawer poniżej */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-64 border-r border-[var(--border)] bg-[var(--card-bg)] flex flex-col transition-transform duration-200 lg:static lg:z-auto lg:translate-x-0 lg:shrink-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-6 py-8 border-b border-[var(--border)] flex items-start justify-between">
          <div>
            <Link
              href="/"
              className="font-display text-xl font-bold text-[var(--color-navy)] dark:text-[var(--color-gold)]"
            >
              Mollien
            </Link>
            <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-[var(--color-gold-text)] mt-1">
              Panel admina
            </p>
          </div>
          {/* Zamknij (tylko w drawerze, < lg) */}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Zamknij menu"
            className="lg:hidden w-8 h-8 flex items-center justify-center rounded-full text-[var(--muted)] hover:text-[var(--fg)]"
          >
            <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <nav className="flex-1 py-4 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const badge = navBadge(item.href, { newIssues, newOrders, newSamples });
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 px-6 py-3 text-sm font-sans text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
              >
                <item.icon />
                <span className="flex-1">{item.label}</span>
                {badge && (
                  <span
                    aria-label={`${badge.count} — ${badge.label}`}
                    className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-[var(--color-gold)] text-[var(--color-navy)]"
                  >
                    {badge.count}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-6 py-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)] truncate mb-3" title={userEmail ?? ""}>
            {userEmail}
          </p>
          <form action={signOut}>
            <button
              type="submit"
              className="text-xs font-sans uppercase tracking-widest text-red-600 hover:text-red-700 transition-colors"
            >
              Wyloguj
            </button>
          </form>
        </div>
      </aside>

      {/* Treść */}
      <main className="flex-1 min-w-0 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 lg:py-10">{children}</div>
      </main>
    </div>
  );
}

function DashboardIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

function ProductsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M3 7l9-4 9 4-9 4-9-4z" />
      <path d="M3 7v10l9 4 9-4V7" />
      <path d="M12 11v10" />
    </svg>
  );
}

function SliderIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8" cy="19" r="1" fill="currentColor" />
      <circle cx="12" cy="19" r="1" fill="currentColor" />
      <circle cx="16" cy="19" r="1" fill="currentColor" />
    </svg>
  );
}

function StarIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

function TilesIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="8" height="8" rx="1" />
      <rect x="13" y="3" width="8" height="8" rx="1" />
      <rect x="3" y="13" width="8" height="8" rx="1" />
      <rect x="13" y="13" width="8" height="8" rx="1" />
    </svg>
  );
}

function CategoriesIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M3 7h18M3 12h18M3 17h12" />
    </svg>
  );
}

function CollectionsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <line x1="12" y1="22.08" x2="12" y2="12" />
    </svg>
  );
}

function BundlesIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="9" width="9" height="11" rx="1" />
      <rect x="13" y="5" width="8" height="15" rx="1" />
      <path d="M3 13h9M13 9h8" />
    </svg>
  );
}

function TicketIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M2 9V6a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" />
      <path d="M9 4v2M9 10v2M9 16v2" />
    </svg>
  );
}

function InboxIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <polyline points="22 12 16 12 14 15 10 15 8 12 2 12" />
      <path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
    </svg>
  );
}

function OrdersIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M6 2h9l5 5v15a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" />
      <path d="M14 2v6h6M9 13h6M9 17h6" />
    </svg>
  );
}

function FabricsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M3 6c3 2 6 2 9 0s6-2 9 0" />
      <path d="M3 12c3 2 6 2 9 0s6-2 9 0" />
      <path d="M3 18c3 2 6 2 9 0s6-2 9 0" />
    </svg>
  );
}

// Próbki tkanin — wachlarz wycinków (odróżnialny od falowanego FabricsIcon,
// który prowadzi do katalogu tkanin).
function SwatchIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="10" height="14" rx="1.5" />
      <path d="M15.5 5.5l3.8 1.4a1.5 1.5 0 0 1 .9 1.9l-4 11" />
      <circle cx="8" cy="15" r="1" fill="currentColor" />
    </svg>
  );
}

function ComplaintsIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function HomeIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V10z" />
    </svg>
  );
}

function PaletteIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M12 2a10 10 0 0 0 0 20h1.5a2.5 2.5 0 0 0 0-5H12a2 2 0 0 1-2-2c0-1 .8-2 2-2h4a6 6 0 0 0 6-6c0-3-4-5-10-5z" />
      <circle cx="7.5" cy="10.5" r="1" fill="currentColor" />
      <circle cx="12" cy="7" r="1" fill="currentColor" />
      <circle cx="16.5" cy="10.5" r="1" fill="currentColor" />
    </svg>
  );
}

function PagesIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </svg>
  );
}
