"use client";

import { useActionState } from "react";
import { signUp, signInWithGoogle, type AuthState } from "@/app/_lib/auth-actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import GoogleIcon from "@/app/_components/ui/GoogleIcon";

export default function RegisterForm() {
  const de = useClientLocale() === "de";
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signUp,
    null
  );

  const c = de
    ? {
        checkInbox: "Prüfen Sie Ihren Posteingang",
        google: "Mit Google fortfahren",
        orEmail: "oder E-Mail",
        fullName: "Vor- und Nachname",
        email: "E-Mail",
        password: "Passwort (mind. 6 Zeichen)",
        loading: "Konto wird erstellt...",
        submit: "Konto erstellen",
        confirmNote:
          "Nach der Registrierung senden wir Ihnen eine E-Mail mit einem Bestätigungslink.",
      }
    : {
        checkInbox: "Sprawdź skrzynkę",
        google: "Kontynuuj z Google",
        orEmail: "lub email",
        fullName: "Imię i nazwisko",
        email: "Email",
        password: "Hasło (min. 6 znaków)",
        loading: "Tworzę konto...",
        submit: "Utwórz konto",
        confirmNote: "Po rejestracji wyślemy email z linkiem potwierdzającym.",
      };

  if (state?.info) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 text-green-600 mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-2">
          {c.checkInbox}
        </h2>
        <p className="text-sm text-[var(--muted)]">{state.info}</p>
      </div>
    );
  }

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
            {c.fullName}
          </span>
          <input
            name="full_name"
            type="text"
            required
            minLength={2}
            autoComplete="name"
            className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
          />
        </label>

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
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            {c.password}
          </span>
          <input
            name="password"
            type="password"
            required
            minLength={6}
            autoComplete="new-password"
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

        <p className="text-xs text-[var(--muted)] text-center">
          {c.confirmNote}
        </p>
      </form>
    </div>
  );
}
