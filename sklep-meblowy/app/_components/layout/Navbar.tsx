import Link from "next/link";
import { Suspense } from "react";
import ThemeToggle from "./ThemeToggle";
import CartIcon from "./CartIcon";
import MobileMenu from "./MobileMenu";
import UserMenu from "./UserMenu";
import SearchBox from "./SearchBox";
import { createClient } from "@/app/_lib/supabase/server";
import { SECTIONS, getCategoriesBySection } from "@/app/_lib/categories";

export default async function Navbar() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <header className="sticky top-0 z-50 bg-[var(--card-bg)] border-b border-[var(--border)] backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between relative">
        <Link
          href="/"
          className="font-display text-xl font-bold tracking-tight text-[var(--color-navy)] dark:text-[var(--color-gold)]"
        >
          Meble<span className="text-[var(--color-gold)]">Premium</span>
        </Link>

        <nav className="hidden md:flex items-center gap-8">
          {SECTIONS.map((section) => {
            const cats = getCategoriesBySection(section.slug);
            return (
              <div key={section.slug} className="relative group">
                <button className="font-sans text-xs uppercase tracking-widest text-[var(--muted)] group-hover:text-[var(--color-gold)] transition-colors flex items-center gap-1 h-16">
                  {section.label}
                  <svg
                    width="10"
                    height="10"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                <div className="absolute top-full left-1/2 -translate-x-1/2 min-w-[220px] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                  {cats.map((c) => (
                    <Link
                      key={c.slug}
                      href={`/sklep?kategoria=${c.slug}`}
                      className="block px-5 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                    >
                      {c.label}
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Suspense fallback={<div className="w-10 h-10" />}>
            <SearchBox />
          </Suspense>
          <ThemeToggle />
          <UserMenu />
          <CartIcon />
          <MobileMenu isLoggedIn={!!user} />
        </div>
      </div>
    </header>
  );
}
