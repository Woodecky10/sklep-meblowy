import LocalizedLink from "../ui/LocalizedLink";
import { createClient } from "@/app/_lib/supabase/server";
import { isAdmin } from "@/app/_lib/admin";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import UserMenuDropdown from "./UserMenuDropdown";

export default async function UserMenu() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const t = getDictionary(await getLocale());

  if (!user) {
    return (
      <LocalizedLink
        href="/logowanie"
        aria-label={t.nav.login}
        className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)] transition-colors"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </LocalizedLink>
    );
  }

  const label =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    t.nav.account;
  const initial = label.charAt(0).toUpperCase();
  const userIsAdmin = isAdmin(user);

  return (
    <>
      {/* Widoczny przycisk powrotu do panelu admina — tylko dla admina */}
      {userIsAdmin && (
        <LocalizedLink
          href="/admin"
          className="hidden sm:inline-flex items-center gap-2 px-3 h-9 rounded-full bg-[var(--color-gold)] text-[var(--color-navy)] text-xs font-sans font-semibold uppercase tracking-widest hover:bg-[var(--color-gold-light)] transition-colors"
          aria-label={t.nav.adminPanel}
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <rect x="14" y="3" width="7" height="7" rx="1" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <rect x="14" y="14" width="7" height="7" rx="1" />
          </svg>
          <span className="hidden md:inline">Panel</span>
        </LocalizedLink>
      )}
      <UserMenuDropdown label={label} initial={initial} isAdminUser={userIsAdmin} />
    </>
  );
}
