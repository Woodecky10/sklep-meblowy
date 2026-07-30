import type { Metadata } from "next";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { localizePath } from "@/app/_lib/i18n";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import RegisterForm from "./RegisterForm";

export async function generateMetadata(): Promise<Metadata> {
  const de = (await getLocale()) === "de";
  return {
    title: de ? "Registrierung" : "Rejestracja",
  };
}

export default async function RegisterPage() {
  const de = (await getLocale()) === "de";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect(localizePath("/konto", de ? "de" : "pl"));

  const c = de
    ? {
        kicker: "Konto",
        title: "Registrieren",
        hasAccount: "Schon ein Konto?",
        login: "Anmelden",
      }
    : {
        kicker: "Konto",
        title: "Zarejestruj się",
        hasAccount: "Masz już konto?",
        login: "Zaloguj się",
      };

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <div className="mb-10 text-center">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {c.kicker}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          {c.title}
        </h1>
      </div>

      <RegisterForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        {c.hasAccount}{" "}
        <LocalizedLink
          href="/logowanie"
          className="text-[var(--color-gold)] font-semibold hover:underline"
        >
          {c.login}
        </LocalizedLink>
      </p>
    </div>
  );
}
