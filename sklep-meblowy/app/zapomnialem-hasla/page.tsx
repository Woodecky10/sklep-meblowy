import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import RequestResetForm from "./RequestResetForm";

export const metadata = { title: "Zapomniałem hasła — Mollien" };

export default async function ZapomnialemHaslaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Zalogowany user nie potrzebuje resetu — przekieruj na konto
  if (user) redirect("/konto");

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <div className="mb-10 text-center">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Konto
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Zapomniałem hasła
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">
          Podaj email, na który zarejestrowałeś konto. Wyślemy Ci link, który
          pozwoli ustawić nowe hasło.
        </p>
      </div>

      <RequestResetForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        Pamiętasz już hasło?{" "}
        <Link
          href="/logowanie"
          className="text-[var(--color-gold)] font-semibold hover:underline"
        >
          Zaloguj się
        </Link>
      </p>
    </div>
  );
}
