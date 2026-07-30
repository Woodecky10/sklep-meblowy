import type { Metadata } from "next";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { localizePath } from "@/app/_lib/i18n";
import { getLocale } from "@/app/_lib/i18n-server";
import ResetForm from "./ResetForm";

export async function generateMetadata(): Promise<Metadata> {
  const de = (await getLocale()) === "de";
  return {
    title: de ? "Neues Passwort festlegen" : "Ustaw nowe hasło",
  };
}

export default async function ResetHaslaPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Strona ma sens tylko gdy user kliknął w link recovery —
  // /auth/confirm w międzyczasie utworzył sesję. Bez sesji odsyłamy
  // do formularza wysłania linku.
  if (!user) redirect(localizePath("/zapomnialem-hasla", locale));

  const c = de
    ? {
        kicker: "Konto",
        title: "Neues Passwort festlegen",
        login: "Anmelden",
      }
    : {
        kicker: "Konto",
        title: "Ustaw nowe hasło",
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
          {de ? (
            <>
              Geben Sie ein neues Passwort für das Konto{" "}
              <strong>{user.email}</strong> ein.
            </>
          ) : (
            <>
              Wprowadź nowe hasło dla konta <strong>{user.email}</strong>.
            </>
          )}
        </p>
      </div>

      <ResetForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        {de ? "Lieber zurück?" : "Wolisz wrócić?"}{" "}
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
