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
import { getMenuItems } from "@/app/_lib/menu-server";
import { prepareMenuItems } from "@/app/_lib/menu";
import NavStrip from "./NavStrip";

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
    menuRows,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getSections(locale),
    getCategories(locale),
    getWishlistCount(),
    getMenuItems(),
  ]);

  const navbarItems = prepareMenuItems(menuRows, "navbar", locale);

  // Grupowanie kategorii pod sekcjami — jedna iteracja zamiast N+1 zapytań.
  const categoriesBySection = new Map<string, typeof categories>();
  for (const c of categories) {
    const arr = categoriesBySection.get(c.group_slug) ?? [];
    arr.push(c);
    categoriesBySection.set(c.group_slug, arr);
  }

  // Lekka projekcja dla komponentów klienckich (NavStrip, MobileMenu) — bez
  // rzeczy nie potrzebnych.
  const clientSections = sections.map((s) => ({
    slug: s.slug,
    label: s.label,
    categories: (categoriesBySection.get(s.slug) ?? []).map((c) => ({
      slug: c.slug,
      label: c.label,
    })),
  }));

  return (
    <header className="bg-[var(--bg)] border-b border-[var(--border)] backdrop-blur-sm">
      {/* min-h-24 zamiast h-24: gdy pasek nawigacji zawinie się do drugiego
          rzędu (dużo grup kategorii), header rośnie w dół zamiast wypychać
          ikony poza prawą krawędź. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-24 py-2 flex items-center justify-between gap-2 sm:gap-6 relative">
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

        {/* Nawigacja (desktop) — grupy kategorii + podstrony z menu. Przy braku
            miejsca pozycje zawijają się do kolejnego rzędu, więc dodanie grupy
            w panelu nigdy nie ucina prawej części strony. */}
        <NavStrip
          sections={clientSections}
          pageLinks={navbarItems}
          labels={{ allInSection: t.nav.allInSection }}
        />

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
            sections={clientSections}
            pageLinks={navbarItems}
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
