import Link from "next/link";
import { createClient } from "@/app/_lib/supabase/server";
import UserMenuDropdown from "./UserMenuDropdown";

export default async function UserMenu() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return (
      <Link
        href="/logowanie"
        aria-label="Zaloguj się"
        className="hidden sm:inline-flex w-9 h-9 items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:text-[var(--color-gold)] hover:border-[var(--color-gold)] transition-colors"
      >
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      </Link>
    );
  }

  const label =
    (user.user_metadata?.full_name as string | undefined) ??
    user.email ??
    "Konto";
  const initial = label.charAt(0).toUpperCase();

  return <UserMenuDropdown label={label} initial={initial} />;
}
