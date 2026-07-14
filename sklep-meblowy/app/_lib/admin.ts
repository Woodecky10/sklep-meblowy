import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createClient } from "./supabase/server";

// Admin role custom claim — ustawiany w Supabase przez SQL
// (raw_app_meta_data.role = 'admin'). Patrz docs/admin-setup.sql.
//
// app_metadata pochodzi z `raw_app_meta_data` w auth.users i jest
// **niemodifikowalne** przez usera (vs user_metadata). Bezpieczne źródło roli.

export function isAdmin(user: User | null): boolean {
  if (!user) return false;
  const role = (user.app_metadata as { role?: string } | undefined)?.role;
  return role === "admin";
}

// Server-side guard — wywołać w Server Component layoutu/strony admina.
// Jeśli niezalogowany → redirect na logowanie z next=/admin
// Jeśli zalogowany ale nie admin → redirect na /
export async function requireAdmin(): Promise<User> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/logowanie?next=/admin");
  }

  if (!isAdmin(user)) {
    redirect("/");
  }

  return user;
}

// Nie-przekierowujący wariant do stron publicznych: podgląd szkicu podstrony
// (published=false renderuje się TYLKO adminowi, klient dostaje notFound()).
export async function getIsAdmin(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return isAdmin(user);
}
