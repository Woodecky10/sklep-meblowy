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
import { getCategories } from "@/app/_lib/categories";
import { menuProjection } from "@/app/_lib/category-tree";
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
    categories,
    wishlistCount,
    menuRows,
  ] = await Promise.all([
    supabase.auth.getUser(),
    getCategories(locale),
    getWishlistCount(),
    getMenuItems(),
  ]);

  const navbarItems = prepareMenuItems(menuRows, "navbar", locale);

  // Drzewo do trzech poziomów: pozycje paska → nagłówki → linki. Ręczne
  // grupowanie po group_slug odeszło razem z tabelą grup (migracja 68).
  const menuNodes = menuProjection(categories);

  return (
    <header className="bg-[var(--bg)] border-b border-[var(--border)] backdrop-blur-sm">
      {/* RZĄD 1: logo + wyszukiwarka + ikony. Nawigacja siedzi w rzędzie niżej
          (NavStrip), bo dzieląc ten rząd dostawała tylko resztkę miejsca w
          środku i piąta pozycja spadała pod pierwszą.

          min-h-24 poniżej lg jest nośne: tam drugiego rzędu NIE MA, a MobileMenu
          liczy swoją max-height od zaszytych 8.5rem (36 px TopBar + 100 px
          header), więc obniżenie tego rzędu na telefonie rozjechałoby menu.
          Od lg rząd schodzi do 4.5rem, żeby drugi rząd nie podwyższył headera
          bardziej niż o wysokość samego paska.

          relative zostaje — po tym elemencie pozycjonuje się rozwijane
          MobileMenu (absolute top-full left-0 right-0).

          Od lg SIATKA, nie flex: skrajne kolumny są sobie równe (1fr), więc
          środkowa leży dokładnie na osi kontenera — tej samej, na której
          wyśrodkowany jest pasek kategorii. Na flexie szukajka dostawała
          resztkę miejsca między logo a ikonami, czyli jej środek jeździł za
          RÓŻNICĄ ich szerokości: gość widział ją 57 px w prawo od osi
          kategorii, zalogowany admin (przycisk PANEL + awatar) 10 px w lewo —
          rozrzut 67 px zależny od stanu logowania.

          Środkowa kolumna 20rem na lg i 28rem od xl — nie jedno 28rem na oba.
          Przy 1024 px i szerokim bloku ikon (admin: PANEL + awatar) 448 px
          szukajki nie mieściło się w rzędzie, więc siatka ściskała kolumnę logo
          i „MOLLIEN.PL" szło pod truncate, a oś uciekała o 34 px. */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-24 lg:min-h-[4.5rem] py-2 flex items-center justify-between gap-2 sm:gap-6 relative lg:grid lg:grid-cols-[1fr_minmax(0,20rem)_1fr] xl:grid-cols-[1fr_minmax(0,28rem)_1fr]">
        {/* Logo */}
        <LocalizedLink
          href="/"
          className="flex items-center gap-2 sm:gap-3 shrink-0 min-w-0"
          aria-label={`${COMPANY.brandName} — ${t.nav.homeAria}`}
        >
          {/* Znak od lg mniejszy niż dotąd (80 → 56 px): to on trzymał header na
              100 px, a przy dwóch rzędach dawałby ~120 px stałego sticky.
              Mobile i tablet bez zmian. */}
          <Image
            src="/logo-mark.svg"
            alt=""
            width={80}
            height={80}
            className="w-12 h-12 sm:w-16 sm:h-16 lg:w-14 lg:h-14 mt-[3px] shrink-0"
            priority
          />
          <span className="hidden sm:inline font-display text-2xl lg:text-3xl font-bold tracking-tight text-[var(--color-navy)] dark:text-[var(--color-gold)] truncate">
            {COMPANY.displayName}
          </span>
        </LocalizedLink>

        {/* Wyszukiwarka zajmuje środkową kolumnę siatki — po wyprowadzeniu
            nawigacji jest tu miejsce już od lg, nie dopiero od xl, więc na
            1024–1280 px nie ma pustej dziury między logo a ikonami. Bez flex-1:
            szerokość wyznacza kolumna, nie rozpychanie się we flexie. */}
        <div className="hidden lg:flex justify-center min-w-0">
          <Suspense fallback={<div className="w-full max-w-md h-10" />}>
            <SearchBox variant="inline" />
          </Suspense>
        </div>

        {/* Ikony — w siatce dociśnięte do prawej krawędzi swojej kolumny,
            żeby szerokość bloku (inna dla gościa i dla admina) nie ruszała
            środkowej kolumny. */}
        <div className="flex items-center gap-2 shrink-0 lg:justify-self-end">
          <div className="lg:hidden">
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
            nodes={menuNodes}
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

      {/* RZĄD 2 (tylko lg+): pasek kategorii i podstron na pełną szerokość
          kontenera — 1232 px zamiast ~475 px, czyli miejsce na ~12 pozycji.
          Poniżej lg NavStrip nic nie renderuje (hidden lg:block), więc na
          telefonie header zostaje jednorzędowy jak dotąd. */}
      <NavStrip
        nodes={menuNodes}
        pageLinks={navbarItems}
        labels={{ allInSection: t.nav.allInSection }}
      />
    </header>
  );
}
