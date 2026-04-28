import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import ResetForm from "./ResetForm";

export const metadata = { title: "Ustaw nowe hasło — Mollien" };

export default async function ResetHaslaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Strona ma sens tylko gdy user kliknął w link recovery —
  // /auth/confirm w międzyczasie utworzył sesję. Bez sesji odsyłamy
  // do formularza wysłania linku.
  if (!user) redirect("/zapomnialem-hasla");

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <div className="mb-10 text-center">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Konto
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Ustaw nowe hasło
        </h1>
        <p className="text-sm text-[var(--muted)] mt-3 leading-relaxed">
          Wprowadź nowe hasło dla konta <strong>{user.email}</strong>.
        </p>
      </div>

      <ResetForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        Wolisz wrócić?{" "}
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
