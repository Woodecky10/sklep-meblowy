import Link from "next/link";
import { Suspense } from "react";
import ThemeToggle from "./ThemeToggle";
import CartIcon from "./CartIcon";
import MobileMenu from "./MobileMenu";
import UserMenu from "./UserMenu";
import SearchBox from "./SearchBox";
import { createClient } from "@/app/_lib/supabase/server";

const categories = [
  { href: "/sklep?kategoria=kanapy", label: "Kanapy" },
  { href: "/sklep?kategoria=lozka", label: "Łóżka" },
  { href: "/sklep?kategoria=fotele", label: "Fotele" },
  { href: "/sklep?kategoria=pufy", label: "Pufy" },
];

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
          {categories.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="font-sans text-xs uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
            >
              {c.label}
            </Link>
          ))}
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
