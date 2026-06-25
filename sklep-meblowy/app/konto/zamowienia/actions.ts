"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient, createAdminClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import { validateImageUpload } from "@/app/_lib/image-upload";
import { validateOrderIssueInput, isOwnIssuePhotoUrl } from "@/app/_lib/order-issues";

export type CancelOrderResult =
  | { ok: true; message: string }
  | { ok: false; error: string };

// Anulowanie zamówienia przez klienta — TYLKO gdy status === 'pending'
// (jeszcze nieopłacone). Po opłaceniu zamówieniem zarządza admin w panelu
// /admin/zamowienia — anulowanie wymaga wtedy kontaktu ze sklepem.
//
// Stock i promo_codes.used_count nie są dotykane:
// - Stock nie jest dekrementowany przy tworzeniu zamówienia w tym sklepie.
// - used_count jest inkrementowany dopiero w Stripe webhook po opłaceniu —
//   więc dla pending order kupon NIE jest jeszcze policzony jako użyty.
export async function cancelOrder(orderId: string): Promise<CancelOrderResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };

  // Service-role: po utwardzeniu RLS (migracja 26) klient nie ma prawa UPDATE
  // na orders — mutacja idzie service-rolem, a ownership i dozwolone przejście
  // wymuszamy TU. Ładujemy WŁASNE zamówienie (filtr user_id z sesji), a sama
  // zmiana to CAS pending→cancelled scoped po user_id (atomowo blokuje wyścig
  // z webhookiem pending→paid i cudze zamówienia).
  const admin = await createAdminClient();
  const { data: order, error: loadErr } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();

  if (loadErr || !order) {
    return { ok: false, error: tr("Zamówienie nie istnieje lub nie należy do Ciebie", "Bestellung existiert nicht oder gehört nicht Ihnen") };
  }
  if ((order as { status: string }).status !== "pending") {
    return {
      ok: false,
      error: tr(
        "Tego zamówienia nie można już anulować z poziomu konta. Skontaktuj się z nami.",
        "Diese Bestellung kann nicht mehr storniert werden. Bitte kontaktieren Sie uns."
      ),
    };
  }

  const { data: updated, error: updateErr } = await admin
    .from("orders")
    .update({ status: "cancelled" } as never)
    .eq("id", orderId)
    .eq("user_id", user.id)
    .eq("status", "pending")
    .select("id");

  if (updateErr) {
    console.error(updateErr.message);
    return {
      ok: false,
      error: tr(
        "Nie udało się anulować zamówienia. Spróbuj ponownie.",
        "Die Bestellung konnte nicht storniert werden. Bitte versuchen Sie es erneut."
      ),
    };
  }
  if (!updated || updated.length === 0) {
    // Status zmienił się między odczytem a CAS (np. webhook pending→paid).
    return {
      ok: false,
      error: tr(
        "Tego zamówienia nie można już anulować z poziomu konta. Skontaktuj się z nami.",
        "Diese Bestellung kann nicht mehr storniert werden. Bitte kontaktieren Sie uns."
      ),
    };
  }

  revalidatePath(`/konto/zamowienia/${orderId}`);
  revalidatePath("/konto/zamowienia");

  return { ok: true, message: tr("Zamówienie zostało anulowane", "Die Bestellung wurde storniert") };
}

// ============================================================
// uploadIssuePhoto — upload zdjęcia do zgłoszenia (gated na zalogowanego usera)
// ============================================================
// Istniejący uploadProductImage wymaga requireAdmin; tu wystarczy zalogowany
// klient. Upload idzie service-rolem do bucketa "products" pod prefiksem
// order-issues/. Walidacja pliku przez wspólny validateImageUpload (bez SVG).
export type UploadIssuePhotoResult = { ok: true; url: string } | { ok: false; error: string };

export async function uploadIssuePhoto(formData: FormData): Promise<UploadIssuePhotoResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };

  const valid = validateImageUpload(formData.get("photo"));
  if (!valid.ok) return { ok: false, error: valid.error };

  const path = `order-issues/${Date.now()}-${randomUUID()}.${valid.ext}`;
  const admin = await createAdminClient();
  const { error } = await admin.storage
    .from("products")
    .upload(path, valid.file, { contentType: valid.contentType, cacheControl: "3600", upsert: false });
  if (error) return { ok: false, error: tr("Upload nieudany — spróbuj ponownie", "Upload fehlgeschlagen — bitte erneut versuchen") };

  const {
    data: { publicUrl },
  } = admin.storage.from("products").getPublicUrl(path);
  return { ok: true, url: publicUrl };
}

// ============================================================
// submitOrderIssue — zgłoszenie problemu z zamówieniem
// ============================================================
// Ownership jak cancelOrder: ładujemy WŁASNE zamówienie (filtr user_id z sesji).
// Insert service-rolem. Walidacja payloadu czystą validateOrderIssueInput.
export type SubmitOrderIssueResult = { ok: true; message: string } | { ok: false; error: string };

export async function submitOrderIssue(formData: FormData): Promise<SubmitOrderIssueResult> {
  const de = (await getLocale()) === "de";
  const tr = (pl: string, deTxt: string) => (de ? deTxt : pl);

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: tr("Musisz być zalogowany", "Sie müssen angemeldet sein") };

  const orderId = String(formData.get("order_id") ?? "").trim();
  if (!orderId) return { ok: false, error: tr("Nieprawidłowe zamówienie", "Ungültige Bestellung") };

  const category = String(formData.get("category") ?? "").trim();
  const message = String(formData.get("message") ?? "");
  const orderItemId = String(formData.get("order_item_id") ?? "").trim() || null;
  let photos: string[] = [];
  try {
    const raw = formData.get("photos");
    const parsed = raw ? JSON.parse(String(raw)) : [];
    if (Array.isArray(parsed)) photos = parsed.filter((p) => typeof p === "string");
  } catch {
    photos = [];
  }

  const v = validateOrderIssueInput({ category, message, photos, orderItemId });
  if (!v.ok) {
    const msg =
      v.error === "category"
        ? tr("Wybierz kategorię problemu", "Bitte wählen Sie eine Problemkategorie")
        : v.error === "message"
          ? tr("Opis jest za krótki (min 5 znaków)", "Die Beschreibung ist zu kurz (mind. 5 Zeichen)")
          : tr("Maksymalnie 5 zdjęć", "Maximal 5 Fotos");
    return { ok: false, error: msg };
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  if (!v.value.photos.every((p) => isOwnIssuePhotoUrl(p, supabaseUrl))) {
    return { ok: false, error: tr("Nieprawidłowe zdjęcie", "Ungültiges Foto") };
  }

  const admin = await createAdminClient();
  const { data: order } = await admin
    .from("orders")
    .select("id, user_id, status")
    .eq("id", orderId)
    .eq("user_id", user.id)
    .single();
  if (!order) {
    return { ok: false, error: tr("Zamówienie nie istnieje lub nie należy do Ciebie", "Bestellung existiert nicht oder gehört nicht Ihnen") };
  }
  const allowed = ["paid", "processing", "shipped", "delivered"];
  if (!allowed.includes((order as { status: string }).status)) {
    return { ok: false, error: tr("Dla tego zamówienia nie można zgłosić problemu", "Für diese Bestellung kann kein Problem gemeldet werden") };
  }

  if (v.value.orderItemId) {
    const { data: item } = await admin
      .from("order_items")
      .select("id")
      .eq("id", v.value.orderItemId)
      .eq("order_id", orderId)
      .single();
    if (!item) return { ok: false, error: tr("Nieprawidłowa pozycja zamówienia", "Ungültige Bestellposition") };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { error } = await admin.from("order_issues").insert({
    order_id: (order as { id: string }).id,
    order_item_id: v.value.orderItemId,
    category: v.value.category,
    message: v.value.message,
    photos: v.value.photos,
    customer_email: user.email ?? "",
    customer_name: (profile as { full_name: string | null } | null)?.full_name ?? null,
  } as never);
  if (error) {
    return { ok: false, error: tr("Nie udało się wysłać zgłoszenia — spróbuj później", "Die Meldung konnte nicht gesendet werden — bitte später erneut versuchen") };
  }

  revalidatePath(`/konto/zamowienia/${orderId}`);
  return {
    ok: true,
    message: tr(
      "Dziękujemy — zajmiemy się zgłoszeniem i skontaktujemy się z Tobą.",
      "Vielen Dank — wir kümmern uns um Ihre Meldung und melden uns bei Ihnen."
    ),
  };
}
