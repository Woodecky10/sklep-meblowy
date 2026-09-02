"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { canTransition } from "@/app/_lib/order-status";
import type { OrderStatus } from "@/app/_lib/types";
import { notifyStatusChange } from "@/app/_lib/mail/notify-order";
import { requestReviews } from "@/app/_lib/mail/review-request";
import { parseExternalOrderInput } from "@/app/_lib/external-order";

export type ActionResult =
  | { ok: true; message?: string }
  | { ok: false; error: string };

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

function sanitizeText(input: unknown, max: number): string {
  return typeof input === "string" ? input.trim().slice(0, max) : "";
}

// Koszt dostawy: pusty → null, liczba >= 0 → liczba (2 miejsca), inaczej null.
function parseCost(input: unknown): number | null {
  if (typeof input !== "string" || input.trim() === "") return null;
  const n = Number(input.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export async function updateOrderStatus(
  orderId: string,
  newStatus: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };
  if (!ALL_STATUSES.includes(newStatus as OrderStatus)) {
    return { ok: false, error: "Nieprawidłowy status" };
  }
  const to = newStatus as OrderStatus;

  const supabase = await createAdminClient();
  const { data: row, error: readErr } = await supabase
    .from("orders")
    .select("status")
    .eq("id", orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Zamówienie nie znalezione" };

  const from = (row as { status: OrderStatus }).status;
  if (!canTransition(from, to)) {
    return { ok: false, error: `Niedozwolona zmiana statusu: ${from} → ${to}` };
  }

  // CAS po odczytanym statusie — nie nadpisujemy równoległej zmiany.
  // `.select("id")` jest tu KONIECZNE: bez niego `error` jest null także gdy
  // update trafił 0 wierszy (przegrany wyścig), a wtedy wysłalibyśmy maila
  // o zmianie, której to wywołanie nie dokonało.
  const { data: updated, error } = await supabase
    .from("orders")
    .update({ status: to, status_updated_at: new Date().toISOString() } as never)
    .eq("id", orderId)
    .eq("status", from)
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!updated || updated.length === 0) {
    return { ok: false, error: "Status zmienił się w innej sesji — odśwież stronę" };
  }

  // Tylko zwycięzca CAS-a wysyła maila. Funkcja nie rzuca, więc nieudany
  // mail nie zamieni udanej zmiany statusu w błąd w panelu.
  // after(): wysylka jest POST-response i nigdy nie moze opoznic ani zepsuc
  // tej akcji — bez tego zawieszony Resend blokowalby akcje admina, aż
  // platforma by ja przerwala, a admin zobaczylby "blad" dla statusu, ktory
  // faktycznie sie zmienil. Next 16 (`after.md`): "after" moze byc uzyte w
  // Server Components, Server Functions, Route Handlers i Proxy — ten plik
  // ma "use server" na poziomie modulu, wiec to jest Server Function.
  after(() => notifyStatusChange(orderId, to, from));

  // Prośba o opinię to osobna wiadomość, nie powiadomienie o statusie —
  // dlatego stoi obok, a nie w NOTIFY_STATUSES. Też przez after(): wysyłka
  // nie może opóźnić ani zepsuć akcji admina.
  if (to === "delivered") {
    after(() => requestReviews(orderId));
  }

  revalidatePath(`/admin/zamowienia/${orderId}`);
  revalidatePath("/admin/zamowienia");
  return { ok: true, message: "Status zaktualizowany" };
}

export async function updateOrderFulfillment(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const carrier = sanitizeText(formData.get("carrier"), 120);
  const trackingNumber = sanitizeText(formData.get("tracking_number"), 120);
  const deliveryCost = parseCost(formData.get("delivery_cost"));
  const deliveryPaid = formData.get("delivery_paid") === "1";

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({
      carrier: carrier || null,
      tracking_number: trackingNumber || null,
      delivery_cost: deliveryCost,
      delivery_paid: deliveryPaid,
    } as never)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Zapisano dane dostawy" };
}

export async function updateOrderNote(
  formData: FormData
): Promise<ActionResult> {
  await requireAdmin();
  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const note = sanitizeText(formData.get("admin_note"), 2000);

  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("orders")
    .update({ admin_note: note || null } as never)
    .eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Notatka zapisana" };
}

// Trwale usuwa zamówienie. order_items i order_issues znikają kaskadowo
// (FK ON DELETE CASCADE). Operacja nieodwracalna — UI wymaga potwierdzenia.
export async function deleteOrder(orderId: string): Promise<ActionResult> {
  await requireAdmin();
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const supabase = await createAdminClient();
  const { error } = await supabase.from("orders").delete().eq("id", orderId);
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/zamowienia");
  return { ok: true, message: "Zamówienie usunięte" };
}

export type CreateExternalOrderResult =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

// Ręczne dodanie zamówienia spoza sklepu (Allegro, OLX, …) — spec 2026-09-02.
// Walidacja i suma w czystym parseExternalOrderInput; tu tylko zapis.
// Zamówienie startuje jako `paid` (zapłacone na marketplace) z
// status_updated_at = null, więc wpada do licznika „nowe zamówienia" jak zakup
// ze sklepu i gaśnie przy „W realizacji" — a ta zmiana wysyła klientowi mail
// „Dziękujemy za zamówienie" (notifyStatusChange). Tu maila NIE wysyłamy.
export async function createExternalOrder(
  formData: FormData
): Promise<CreateExternalOrderResult> {
  await requireAdmin();
  const parsed = parseExternalOrderInput({
    source: formData.get("source"),
    source_name: formData.get("source_name"),
    email: formData.get("email"),
    fullname: formData.get("fullname"),
    phone: formData.get("phone"),
    street: formData.get("street"),
    postal_code: formData.get("postal_code"),
    city: formData.get("city"),
    items: formData.get("items"),
  });
  if (!parsed.ok) return parsed;
  const input = parsed.value;

  const supabase = await createAdminClient();

  // Produkty muszą istnieć: FK i tak by odrzucił, ale komunikat ma być po
  // polsku, a nie z Postgresa — i zanim zajmiemy numer zamówienia.
  const ids = [...new Set(input.items.map((i) => i.product_id))];
  const { data: found, error: prodErr } = await supabase
    .from("products")
    .select("id")
    .in("id", ids);
  if (prodErr) return { ok: false, error: prodErr.message };
  if ((found ?? []).length !== ids.length) {
    return { ok: false, error: "Któryś z produktów już nie istnieje — odśwież stronę" };
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: null,
      guest_email: input.email,
      source: input.source,
      status: "paid",
      total: input.total,
      shipping_address: input.address as unknown as Record<string, unknown>,
      // 'online' bez nowej wartości CHECK — rozróżnienie daje `source`.
      payment_method: "online",
      payment_provider: null,
      payment_ref: null,
      currency: "pln",
      fx_rate: null,
      promo_code_id: null,
      promo_discount: 0,
      bundle_discount: 0,
    } as never)
    .select("id")
    .single();
  if (orderErr || !order) {
    return { ok: false, error: orderErr?.message ?? "Nie udało się zapisać zamówienia" };
  }
  const orderId = (order as { id: string }).id;

  const { error: itemsErr } = await supabase.from("order_items").insert(
    input.items.map((it) => ({
      order_id: orderId,
      product_id: it.product_id,
      quantity: it.quantity,
      price: it.price,
      notes: it.notes,
      variant_values: null,
    })) as never[]
  );
  if (itemsErr) {
    // Zamówienie bez pozycji to śmieć z zajętym numerem — sprzątamy, żeby admin
    // mógł poprawić dane i zapisać od nowa bez dziury w numeracji na liście.
    await supabase.from("orders").delete().eq("id", orderId);
    return { ok: false, error: itemsErr.message };
  }

  revalidatePath("/admin/zamowienia");
  return { ok: true, orderId };
}
