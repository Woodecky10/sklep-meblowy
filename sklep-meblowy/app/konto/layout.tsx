import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { signOut } from "@/app/_lib/auth-actions";

export default async function AccountLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/logowanie");

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Twoje konto
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Witaj{user.user_metadata?.full_name ? `, ${user.user_metadata.full_name}` : ""}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-10">
        <aside className="lg:col-span-1">
          <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible">
            <SideLink href="/konto">Profil</SideLink>
            <SideLink href="/konto/zamowienia">Zamówienia</SideLink>
            <form action={signOut} className="lg:mt-4">
              <button
                type="submit"
                className="w-full text-left px-4 py-3 rounded-xl font-sans text-sm uppercase tracking-widest text-[var(--muted)] hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950 transition-colors whitespace-nowrap"
              >
                Wyloguj
              </button>
            </form>
          </nav>
        </aside>

        <main className="lg:col-span-3">{children}</main>
      </div>
    </div>
  );
}

function SideLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="block px-4 py-3 rounded-xl font-sans text-sm uppercase tracking-widest text-[var(--fg)] hover:bg-[var(--card-bg)] hover:text-[var(--color-gold)] transition-colors whitespace-nowrap"
    >
      {children}
    </Link>
  );
}
