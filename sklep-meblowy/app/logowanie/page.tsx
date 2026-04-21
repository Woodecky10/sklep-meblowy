import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/app/_lib/supabase/server";
import LoginForm from "./LoginForm";

export const metadata = { title: "Logowanie — MeblePremium" };

export default async function LoginPage() {
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
          Zaloguj się
        </h1>
      </div>

      <LoginForm />

      <p className="mt-8 text-center text-sm text-[var(--muted)]">
        Nie masz konta?{" "}
        <Link
          href="/rejestracja"
          className="text-[var(--color-gold)] font-semibold hover:underline"
        >
          Zarejestruj się
        </Link>
      </p>
    </div>
  );
}
