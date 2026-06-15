"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";
import { linkGuestOrders } from "./link-guest-orders";
import { isAdmin } from "./admin";
import { getLocale } from "@/app/_lib/i18n-server";

export type AuthState = { error?: string; info?: string } | null;

function getOrigin(headerList: Headers) {
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

function validateEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export async function signIn(_state: AuthState, formData: FormData): Promise<AuthState> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!validateEmail(email)) return { error: tr("Nieprawidłowy email", "Ungültige E-Mail") };
  if (password.length < 6) return { error: tr("Hasło musi mieć min. 6 znaków", "Das Passwort muss mindestens 6 Zeichen haben") };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: tr("Email niezweryfikowany — sprawdź skrzynkę", "E-Mail nicht bestätigt — bitte prüfen Sie Ihr Postfach") };
    }
    return { error: tr("Nieprawidłowy email lub hasło", "Ungültige E-Mail oder Passwort") };
  }

  // Po zalogowaniu — podepnij ewentualne nowe zamówienia gościa o tym samym emailu
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await linkGuestOrders(user.id, user.email);
  }

  revalidatePath("/", "layout");
  redirect(isAdmin(user) ? "/admin" : "/konto");
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!validateEmail(email)) return { error: tr("Nieprawidłowy email", "Ungültige E-Mail") };
  if (password.length < 6) return { error: tr("Hasło musi mieć min. 6 znaków", "Das Passwort muss mindestens 6 Zeichen haben") };
  if (fullName.length < 2) return { error: tr("Podaj imię i nazwisko", "Bitte geben Sie Vor- und Nachname an") };

  const headerList = await headers();
  const origin = getOrigin(headerList);

  const supabase = await createClient();
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName },
      emailRedirectTo: `${origin}/auth/confirm?next=/konto`,
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already") || error.message.toLowerCase().includes("registered")) {
      return { error: tr("Ten email jest już zarejestrowany", "Diese E-Mail ist bereits registriert") };
    }
    return { error: error.message };
  }

  return { info: tr("Sprawdź skrzynkę — wysłaliśmy link potwierdzający rejestrację.", "Bitte prüfen Sie Ihr Postfach — wir haben Ihnen einen Bestätigungslink gesendet.") };
}

export async function signInWithGoogle() {
  const headerList = await headers();
  const origin = getOrigin(headerList);

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: `${origin}/auth/callback?next=/konto`,
    },
  });

  if (error || !data.url) {
    redirect("/logowanie?error=oauth");
  }

  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

// ============================================================
// Reset hasła
// ============================================================
// Flow: user wpisuje email na /zapomnialem-hasla → wysyłamy link recovery →
// user klika link → /auth/confirm weryfikuje token i przekierowuje na
// /reset-hasla → user ustawia nowe hasło → updateUser({ password }).

export async function requestPasswordReset(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!validateEmail(email)) return { error: tr("Nieprawidłowy email", "Ungültige E-Mail") };

  const headerList = await headers();
  const origin = getOrigin(headerList);

  const supabase = await createClient();
  // Z kontekstu bezpieczeństwa NIE ujawniamy czy email istnieje w bazie —
  // zawsze zwracamy ten sam komunikat (info), niezależnie od wyniku.
  await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/auth/confirm?next=/reset-hasla`,
  });

  return {
    info: tr(
      "Jeśli ten email jest zarejestrowany, wysłaliśmy na niego link do resetu hasła. Sprawdź skrzynkę.",
      "Falls diese E-Mail registriert ist, haben wir einen Link zum Zurücksetzen des Passworts gesendet. Bitte prüfen Sie Ihr Postfach."
    ),
  };
}

export async function updatePassword(
  _state: AuthState,
  formData: FormData
): Promise<AuthState> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  if (password.length < 6) return { error: tr("Hasło musi mieć min. 6 znaków", "Das Passwort muss mindestens 6 Zeichen haben") };
  if (password !== confirm) return { error: tr("Hasła nie są identyczne", "Die Passwörter stimmen nicht überein") };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Sesja recovery jest aktywna tylko po kliknięciu w link z maila
  // (auth/confirm ją tworzy). Bez sesji updateUser zawiedzie.
  if (!user) {
    return {
      error: tr(
        "Sesja resetu wygasła lub jest nieprawidłowa. Wyślij sobie nowy link z /zapomnialem-hasla.",
        "Die Reset-Sitzung ist abgelaufen oder ungültig. Bitte fordern Sie unter /zapomnialem-hasla einen neuen Link an."
      ),
    };
  }

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect(isAdmin(user) ? "/admin" : "/konto");
}
