import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import RegisterForm from "./RegisterForm";

export const metadata = { title: "Rejestracja — MeblePremium" };

export default async function RegisterPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) redirect("/konto");

  return (
    <div className="max-w-md mx-auto px-6 py-20">
      <div className="mb-10 text-center">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Konto
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Zarejestruj się
        </h1>
      </div>

      <RegisterForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        Masz już konto?{" "}
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
