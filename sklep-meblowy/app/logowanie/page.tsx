import type { Metadata } from "next";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { localizePath } from "@/app/_lib/i18n";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import { isAdmin } from "@/app/_lib/admin";
import { safeNextPath } from "@/app/_lib/safe-redirect";
import { getLocale } from "@/app/_lib/i18n-server";
import LoginForm from "./LoginForm";

export async function generateMetadata(): Promise<Metadata> {
  const de = (await getLocale()) === "de";
  return { title: de ? "Anmeldung" : "Logowanie" };
}

export default async function LoginPage({
  searchParams,
}: {
  // Next 16: searchParams to Promise.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const de = (await getLocale()) === "de";
  const rawNext = (await searchParams)?.next;
  // `next` pozwala wrócić tam, skąd klient przyszedł (np. /probki?tkanina=...).
  // Bez tego zalogowany trafiający tu z bramki próbek lądował na /konto i tracił
  // wybraną tkaninę — czyli dokładnie w miejscu, w którym gubi się leady.
  // safeNextPath przepuszcza WYŁĄCZNIE ścieżki lokalne: "//zly.host", "/\host"
  // i "https://…" są odrzucane (ochrona przed open redirect).
  const next = safeNextPath(Array.isArray(rawNext) ? rawNext[0] : rawNext);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    redirect(next ?? (isAdmin(user) ? "/admin" : localizePath("/konto", de ? "de" : "pl")));
  }

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

  // Klient odesłany z zamawiania próbek ma zobaczyć POWÓD, nie goły formularz —
  // logowanie jest tu warunkiem darmowej puli, a nie kaprysem sklepu.
  // Tekst PL-only: /probki jest PL-only (DE zamrożone flagą DE_ENABLED).
  const fromSamples = next === "/probki" || (next?.startsWith("/probki?") ?? false);

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

      {fromSamples && (
        <div className="mb-8 rounded-2xl border border-[var(--color-gold)] bg-[var(--card-bg)] px-5 py-4 text-sm leading-relaxed text-[var(--fg)]">
          <strong>Zamawianie próbek wymaga zalogowania.</strong> Dzięki temu pilnujemy,
          żeby pierwsze 3 próbki były gratis dla każdego klienta. Po zalogowaniu wrócisz
          do wybranej tkaniny.
        </div>
      )}

      <LoginForm next={next} />

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
