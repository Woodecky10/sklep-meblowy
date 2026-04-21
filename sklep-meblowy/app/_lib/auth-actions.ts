"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "./supabase/server";
import { linkGuestOrders } from "./link-guest-orders";

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
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!validateEmail(email)) return { error: "Nieprawidłowy email" };
  if (password.length < 6) return { error: "Hasło musi mieć min. 6 znaków" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    if (error.message.toLowerCase().includes("email not confirmed")) {
      return { error: "Email niezweryfikowany — sprawdź skrzynkę" };
    }
    return { error: "Nieprawidłowy email lub hasło" };
  }

  // Po zalogowaniu — podepnij ewentualne nowe zamówienia gościa o tym samym emailu
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user?.email) {
    await linkGuestOrders(user.id, user.email);
  }

  revalidatePath("/", "layout");
  redirect("/konto");
}

export async function signUp(_state: AuthState, formData: FormData): Promise<AuthState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!validateEmail(email)) return { error: "Nieprawidłowy email" };
  if (password.length < 6) return { error: "Hasło musi mieć min. 6 znaków" };
  if (fullName.length < 2) return { error: "Podaj imię i nazwisko" };

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
      return { error: "Ten email jest już zarejestrowany" };
    }
    return { error: error.message };
  }

  return { info: "Sprawdź skrzynkę — wysłaliśmy link potwierdzający rejestrację." };
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
