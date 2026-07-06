import LocalizedLink from "../ui/LocalizedLink";
import Image from "next/image";
import { Suspense } from "react";
import ThemeToggle from "./ThemeToggle";
import CartIcon from "./CartIcon";
import MobileMenu from "./MobileMenu";
import UserMenu from "./UserMenu";
import SearchBox from "./SearchBox";
import WishlistIcon from "./WishlistIcon";
import { createClient } from "@/app/_lib/supabase/server";
import { isAdmin } from "@/app/_lib/admin";
import { getSections, getCategories } from "@/app/_lib/categories";
import { getWishlistCount } from "@/app/_lib/wishlist";
import { COMPANY } from "@/app/_lib/company";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";

export default async function Navbar() {
  const supabase = await createClient();
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [
    {
      data: { user },
    },
    sections,
    categories,
    wishlistCount,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getSections(locale),
    getCategories(locale),
    getWishlistCount(),
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
    <header className="bg-[var(--bg)] border-b border-[var(--border)] backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-24 flex items-center justify-between gap-2 sm:gap-6 relative">
        {/* Logo */}
        <LocalizedLink
          href="/"
          className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0"
          aria-label={`${COMPANY.brandName} — ${t.nav.homeAria}`}
        >
          <Image
            src="/logo-mark.svg"
            alt=""
            width={80}
            height={80}
            className="w-12 h-12 sm:w-16 sm:h-16 lg:w-20 lg:h-20 mt-[3px] shrink-0"
            priority
          />
          <span className="hidden sm:inline font-display text-2xl lg:text-3xl font-bold tracking-tight text-[var(--color-navy)] dark:text-[var(--color-gold)] truncate">
            {COMPANY.displayName}
          </span>
        </LocalizedLink>

        {/* Nawigacja + searchbar (desktop) */}
        <div className="hidden lg:flex items-center gap-8 flex-1 justify-center">
          <nav className="flex items-center gap-6">
            {sections.map((section) => {
              const cats = categoriesBySection.get(section.slug) ?? [];
              // Sam HEADER sekcji jest klikalny — prowadzi do /sklep?sekcja=<slug>
              // pokazując WSZYSTKIE produkty z tej sekcji (bez wyboru
              // sub-kategorii). Hover wciąż otwiera dropdown z sub-kategoriami
              // dla bardziej precyzyjnego filtra. CSS group-hover na divie
              // działa tak samo niezależnie od tego czy headerem jest Link
              // czy button.
              return (
                <div key={section.slug} className="relative group shrink-0">
                  <LocalizedLink
                    href={`/sklep?sekcja=${section.slug}`}
                    className="font-sans text-xs uppercase tracking-widest text-[var(--muted)] group-hover:text-[var(--color-gold)] transition-colors flex items-center gap-1 h-24 whitespace-nowrap"
                  >
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
                  </LocalizedLink>
                  <div className="absolute top-full left-1/2 -translate-x-1/2 min-w-[220px] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
                    {/* Pierwszy item = link do całej sekcji (skrót dla użytkownika
                        który najechał na dropdown i chce zobaczyć wszystko). */}
                    <LocalizedLink
                      href={`/sklep?sekcja=${section.slug}`}
                      className="block px-5 py-2.5 text-sm text-[var(--color-gold)] hover:bg-[var(--bg)] transition-colors border-b border-[var(--border)] mb-1 font-medium"
                    >
                      {t.nav.allInSection} {section.label.toLowerCase()}
                    </LocalizedLink>
                    {cats.map((c) => (
                      <LocalizedLink
                        key={c.slug}
                        href={`/sklep?kategoria=${c.slug}`}
                        className="block px-5 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                      >
                        {c.label}
                      </LocalizedLink>
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
          <WishlistIcon count={wishlistCount} />
          <CartIcon />
          <MobileMenu
            isLoggedIn={!!user}
            isAdmin={isAdmin(user)}
            sections={mobileSections}
            labels={{
              menu: t.nav.menu,
              allInSection: t.nav.allInSection,
              adminPanel: t.nav.adminPanel,
              myAccount: t.nav.myAccount,
              orders: t.nav.orders,
              logout: t.nav.logout,
              login: t.nav.login,
              register: t.nav.register,
            }}
          />
        </div>
      </div>
    </header>
  );
}
