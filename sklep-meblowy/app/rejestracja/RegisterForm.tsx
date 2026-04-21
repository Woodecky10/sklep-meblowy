"use client";

import { useActionState } from "react";
import { signUp, signInWithGoogle, type AuthState } from "@/app/_lib/auth-actions";

export default function RegisterForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    signUp,
    null
  );

  if (state?.info) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-8 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-950 text-green-600 mb-4">
          <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="font-display text-xl font-bold text-[var(--fg)] mb-2">
          Sprawdź skrzynkę
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
          Kontynuuj z Google
        </button>
      </form>

      <div className="relative flex items-center">
        <div className="flex-1 border-t border-[var(--border)]" />
        <span className="px-4 text-xs uppercase tracking-widest text-[var(--muted)]">
          lub email
        </span>
        <div className="flex-1 border-t border-[var(--border)]" />
      </div>

      <form action={action} className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Imię i nazwisko
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
            Email
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
            Hasło (min. 6 znaków)
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
          {pending ? "Tworzę konto..." : "Utwórz konto"}
        </button>

        <p className="text-xs text-[var(--muted)] text-center">
          Po rejestracji wyślemy email z linkiem potwierdzającym.
        </p>
      </form>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1c-.22-.66-.35-1.36-.35-2.1s.13-1.44.35-2.1V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.61z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z"
      />
    </svg>
  );
}
