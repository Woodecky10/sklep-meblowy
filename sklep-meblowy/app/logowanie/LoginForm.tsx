"use client";

import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import GoogleIcon from "@/app/_components/ui/GoogleIcon";
import { useActionState } from "react";
import { signIn, signInWithGoogle, type AuthState } from "@/app/_lib/auth-actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";

export default function LoginForm() {
  const de = useClientLocale() === "de";
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signIn,
    null
  );

  const c = de
    ? {
        google: "Mit Google anmelden",
        orEmail: "oder E-Mail",
        email: "E-Mail",
        password: "Passwort",
        forgot: "Passwort vergessen",
        loading: "Anmeldung läuft...",
        submit: "Anmelden",
      }
    : {
        google: "Zaloguj przez Google",
        orEmail: "lub email",
        email: "Email",
        password: "Hasło",
        forgot: "Zapomniałem hasła",
        loading: "Loguję...",
        submit: "Zaloguj się",
      };

  return (
    <div className="flex flex-col gap-6">
      <form action={signInWithGoogle}>
        <button
          type="submit"
          className="w-full py-3.5 border border-[var(--border)] rounded-full font-sans text-sm font-semibold text-[var(--fg)] hover:bg-[var(--card-bg)] transition-colors flex items-center justify-center gap-3"
        >
          <GoogleIcon />
          {c.google}
        </button>
      </form>

      <div className="relative flex items-center">
        <div className="flex-1 border-t border-[var(--border)]" />
        <span className="px-4 text-xs uppercase tracking-widest text-[var(--muted)]">
          {c.orEmail}
        </span>
        <div className="flex-1 border-t border-[var(--border)]" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            {c.email}
          </span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
          />
        </label>

        <label className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
              {c.password}
            </span>
            <LocalizedLink
              href="/zapomnialem-hasla"
              className="text-xs font-sans text-[var(--color-gold)] hover:underline"
            >
              {c.forgot}
            </LocalizedLink>
          </div>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="current-password"
            className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
          />
        </label>

        {state?.error && (
          <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-xl px-4 py-3 text-sm">
            {state.error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending}
          className="w-full py-4 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {pending ? c.loading : c.submit}
        </button>
      </form>
    </div>
  );
}
