"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "./supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";

export type WishlistActionResult =
  | { ok: true; added: boolean }
  | { ok: false; error: "unauthenticated" | "db_error"; message: string };

// Toggle: jeśli produkt jest na liście → usuń, w przeciwnym razie dodaj.
// Idempotentne — kolejne wywołania nie psują stanu.
export async function toggleWishlist(
  productId: string
): Promise<WishlistActionResult> {
  const de = (await getLocale()) === "de";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      error: "unauthenticated",
      message: de
        ? "Bitte melden Sie sich an, um zu den Favoriten hinzuzufügen"
        : "Zaloguj się żeby dodać do ulubionych",
    };
  }

  // Sprawdzamy aktualny stan
  const { data: existing } = await supabase
    .from("wishlists")
    .select("user_id")
    .eq("user_id", user.id)
    .eq("product_id", productId)
    .maybeSingle();

  if (existing) {
    const { error } = await supabase
      .from("wishlists")
      .delete()
      .eq("user_id", user.id)
      .eq("product_id", productId);
    if (error) {
      return { ok: false, error: "db_error", message: error.message };
    }
    revalidatePath("/ulubione");
    revalidatePath("/", "layout");
    return { ok: true, added: false };
  } else {
    const { error } = await supabase
      .from("wishlists")
      .insert({ user_id: user.id, product_id: productId } as never);
    if (error) {
      return { ok: false, error: "db_error", message: error.message };
    }
    revalidatePath("/ulubione");
    revalidatePath("/", "layout");
    return { ok: true, added: true };
  }
}
