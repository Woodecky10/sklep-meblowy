import type { Metadata } from "next";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { localizePath } from "@/app/_lib/i18n";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { isAdmin } from "@/app/_lib/admin";
import { getLocale } from "@/app/_lib/i18n-server";
import LoginForm from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const de = (await getLocale()) === "de";
  return { title: de ? "Anmeldung — MeblePremium" : "Logowanie — MeblePremium" };
}

export default async function LoginPage() {
  const de = (await getLocale()) === "de";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect(isAdmin(user) ? "/admin" : localizePath("/konto", de ? "de" : "pl"));

  const c = de
    ? {
        kicker: "Konto",
        title: "Anmelden",
        noAccount: "Noch kein Konto?",
        register: "Registrieren",
      }
    : {
        kicker: "Konto",
        title: "Zaloguj się",
        noAccount: "Nie masz konta?",
        register: "Zarejestruj się",
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

      <LoginForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        {c.noAccount}{" "}
        <LocalizedLink
          href="/rejestracja"
          className="text-[var(--color-gold)] font-semibold hover:underline"
        >
          {c.register}
        </LocalizedLink>
      </p>
    </div>
  );
}
