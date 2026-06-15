"use client";

import { useActionState } from "react";
import { requestPasswordReset, type AuthState } from "@/app/_lib/auth-actions";
import { useClientLocale } from "@/app/_lib/useClientLocale";

export default function RequestResetForm() {
  const de = useClientLocale() === "de";
  const [state, action, pending] = useActionState<AuthState, FormData>(
    requestPasswordReset,
    null
  );

  const c = de
    ? {
        email: "E-Mail",
        loading: "Senden...",
        submit: "Link zum Zurücksetzen senden",
      }
    : {
        email: "Email",
        loading: "Wysyłam...",
        submit: "Wyślij link do resetu",
      };

  // Po sukcesie pokazujemy info — formularz znika żeby user nie wysyłał n-razy
  if (state?.info) {
    return (
      <div className="bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-900 text-emerald-700 dark:text-emerald-300 rounded-xl px-5 py-4 text-sm leading-relaxed">
        {state.info}
      </div>
    );
  }

  return (
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
          autoFocus
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
  );
}
