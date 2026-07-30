import type { Metadata } from "next";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizePath } from "@/app/_lib/i18n";
import RequestResetForm from "./RequestResetForm";

export async function generateMetadata(): Promise<Metadata> {
  const de = (await getLocale()) === "de";
  return {
    title: de ? "Passwort vergessen" : "Zapomniałem hasła",
  };
}

export default async function ZapomnialemHaslaPage() {
  const de = (await getLocale()) === "de";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Zalogowany user nie potrzebuje resetu — przekieruj na konto
  if (user) redirect(localizePath("/konto", de ? "de" : "pl"));

  const c = de
    ? {
        kicker: "Konto",
        title: "Passwort vergessen",
        intro:
          "Geben Sie die E-Mail-Adresse an, mit der Sie Ihr Konto registriert haben. Wir senden Ihnen einen Link, mit dem Sie ein neues Passwort festlegen können.",
        remember: "Erinnern Sie sich wieder an Ihr Passwort?",
        login: "Anmelden",
      }
    : {
        kicker: "Konto",
        title: "Zapomniałem hasła",
        intro:
          "Podaj email, na który zarejestrowałeś konto. Wyślemy Ci link, który pozwoli ustawić nowe hasło.",
        remember: "Pamiętasz już hasło?",
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
        <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">
          {c.intro}
        </p>
      </div>

      <RequestResetForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        {c.remember}{" "}
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
