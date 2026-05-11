import Link from "next/link";
import Image from "next/image";
import { Suspense } from "react";
import ThemeToggle from "./ThemeToggle";
import CartIcon from "./CartIcon";
import MobileMenu from "./MobileMenu";
import UserMenu from "./UserMenu";
import SearchBox from "./SearchBox";
import { createClient } from "@/app/_lib/supabase/server";
import { isAdmin } from "@/app/_lib/admin";
import { getSections, getCategories } from "@/app/_lib/categories";
import { COMPANY } from "@/app/_lib/company";

export default async function Navbar() {
  const supabase = await createClient();
  const [
    {
      data: { user },
    },
    sections,
    categories,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getSections(),
    getCategories(),
  ]);

  // Grupowanie kategorii pod sekcjami — jedna iteracja zamiast N+1 zapytań.
  const categoriesBySection = new Map<string, typeof categories>();
  for (const c of categories) {
    const arr = categoriesBySection.get(c.group_slug) ?? [];
    arr.push(c);
    categoriesBySection.set(c.group_slug, arr);
  }

  // Lekka projekcja dla MobileMenu (klient) — bez rzeczy nie potrzebnych.
  const mobileSections = sections.map((s) => ({
    slug: s.slug,
    label: s.label,
    categories: (categoriesBySection.get(s.slug) ?? []).map((c) => ({
      slug: c.slug,
      label: c.label,
    })),
  }));

  return (
    <header className="sticky top-0 z-50 bg-[var(--bg)] border-b border-[var(--border)] backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-6 h-24 flex items-center justify-between gap-6 relative">
        {/* Logo */}
        <Link
          href="/"
          className="flex items-center gap-3 shrink-0"
          aria-label={`${COMPANY.brandName} — strona główna`}
        >
          <Image
            src="/logo-mark.svg"
            alt=""
            width={80}
            height={80}
            className="w-16 h-16 lg:w-20 lg:h-20 mt-[3px]"
            priority
          />
          <span className="font-display text-2xl lg:text-3xl font-bold tracking-tight text-[var(--color-navy)] dark:text-[var(--color-gold)]">
            {COMPANY.displayName}
          </span>
        </Link>

        {/* Nawigacja + searchbar (desktop) */}
        <div className="hidden lg:flex items-center gap-8 flex-1 justify-center">
          <nav className="flex items-center gap-6">
            {sections.map((section) => {
              const cats = categoriesBySection.get(section.slug) ?? [];
              return (
                <div key={section.slug} className="relative group shrink-0">
                  <button className="font-sans text-xs uppercase tracking-widest text-[var(--muted)] group-hover:text-[var(--color-gold)] transition-colors flex items-center gap-1 h-24 whitespace-nowrap">
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
        </div>

        {/* Searchbar inline na desktopie + ikony */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="hidden xl:block">
            <Suspense fallback={<div className="w-64 h-10" />}>
              <SearchBox variant="inline" />
            </Suspense>
          </div>
          <div className="xl:hidden">
            <Suspense fallback={<div className="w-10 h-10" />}>
              <SearchBox variant="icon" />
            </Suspense>
          </div>
          <ThemeToggle />
          <UserMenu />
          <CartIcon />
          <MobileMenu
            isLoggedIn={!!user}
            isAdmin={isAdmin(user)}
            sections={mobileSections}
          />
        </div>
      </div>
    </header>
  );
}
