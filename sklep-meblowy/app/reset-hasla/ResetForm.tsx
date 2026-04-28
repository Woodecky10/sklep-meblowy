"use client";

import { useActionState } from "react";
import { updatePassword, type AuthState } from "@/app/_lib/auth-actions";

export default function ResetForm() {
  const [state, action, pending] = useActionState<AuthState, FormData>(
    updatePassword,
    null
  );

  return (
    <form action={action} className="flex flex-col gap-4">
      <label className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Nowe hasło
        </span>
        <input
          name="password"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          autoFocus
          className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
        />
      </label>

      <label className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Powtórz hasło
        </span>
        <input
          name="confirm"
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="px-4 py-3 bg-transparent border border-[var(--border)] rounded-xl text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
        />
      </label>

      <p className="text-xs text-[var(--muted)]">
        Min. 6 znaków. Po zmianie zostaniesz przekierowany do panelu.
      </p>

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
        {pending ? "Zapisuję..." : "Zapisz nowe hasło"}
      </button>
    </form>
  );
}
