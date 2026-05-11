import Link from "next/link";
import type { Metadata } from "next";
import { requireAdmin } from "@/app/_lib/admin";
import { signOut } from "@/app/_lib/auth-actions";

export const metadata: Metadata = {
  title: "Panel admina",
  robots: { index: false, follow: false },
};

const NAV_ITEMS = [
  { href: "/admin", label: "Pulpit", icon: DashboardIcon },
  { href: "/admin/produkty", label: "Produkty", icon: ProductsIcon },
  { href: "/admin/polecane", label: "Polecane", icon: StarIcon },
  { href: "/admin/slider", label: "Slider", icon: SliderIcon },
  { href: "/admin/kafelki", label: "Kafelki", icon: TilesIcon },
  { href: "/admin/kategorie", label: "Kategorie", icon: CategoriesIcon },
  { href: "/admin/baselinker", label: "BaseLinker", icon: BLIcon },
];

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="min-h-screen flex bg-[var(--bg)]">
      {/* Sidebar */}
      <aside className="w-64 shrink-0 border-r border-[var(--border)] bg-[var(--card-bg)] flex flex-col">
        <div className="px-6 py-8 border-b border-[var(--border)]">
          <Link
            href="/"
            className="font-display text-xl font-bold text-[var(--color-navy)] dark:text-[var(--color-gold)]"
          >
            Mollien
          </Link>
          <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-[var(--color-gold)] mt-1">
            Panel admina
          </p>
        </div>

        <nav className="flex-1 py-4">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-6 py-3 text-sm font-sans text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
            >
              <item.icon />
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="px-6 py-4 border-t border-[var(--border)]">
          <p className="text-xs text-[var(--muted)] truncate mb-3" title={user.email ?? ""}>
            {user.email}
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

      {/* Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-8 py-10">{children}</div>
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

function BLIcon() {
  return (
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}
