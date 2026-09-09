"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { canTransition } from "@/app/_lib/order-status";
import type { OrderStatus } from "@/app/_lib/types";
import { notifyStatusChange, sendExternalOrderAcceptedMail } from "@/app/_lib/mail/notify-order";
import { requestReviews } from "@/app/_lib/mail/review-request";
import { parseExternalOrderInput } from "@/app/_lib/external-order";
import { ACCEPTED_MAIL_MAX_LENGTH } from "@/app/_lib/order-accepted-mail";

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

// Ręczne dodanie zamówienia spoza sklepu (Allegro, OLX, …) — spec 2026-09-02
// + aktualizacja 2026-09-09 (zgłoszenie pracownicy obsługującej panel).
// Walidacja i suma w czystym parseExternalOrderInput; tu tylko zapis.
//
// STATUS zależy od sposobu płatności i jest DOKŁADNIE tą samą regułą, co
// w sklepowym checkoucie (app/_lib/orders.ts, createOrder):
// - „Opłacone w źródle" (online) → `paid`, bo pieniądze wziął marketplace;
// - „Płatność przy odbiorze" (cod) → `processing`, bo pobranie NIE MA etapu
//   płatności i nigdy nie udaje opłaconego.
// W obu wypadkach `status_updated_at = null`, więc zamówienie wpada do licznika
// „nowe zamówienia" (getNewOrdersCount liczy `paid` ORAZ `processing`
// z pustym `status_updated_at`) i gaśnie przy pierwszej zmianie statusu —
// identycznie jak zakup ze sklepu, odpowiednio online i za pobraniem.
//
// MAIL „Dziękujemy za zamówienie" NIE WYCHODZI STĄD i nie wychodzi już z żadnej
// zmiany statusu (decyzja właściciela 2026-09-09 po zgłoszeniu pracownicy).
// Zapis zamówienia kończy się przejściem na jego kartę, gdzie sekcja
// „Wiadomość do klienta" pokazuje gotową propozycję treści do sprawdzenia,
// poprawienia i wysłania przyciskiem — patrz sendExternalOrderMail niżej.
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
    payment: formData.get("payment"),
  });
  if (!parsed.ok) return parsed;
  const input = parsed.value;
  const cod = input.payment_method === "cod";

  const supabase = await createAdminClient();

  // Produkty muszą istnieć: FK i tak by odrzucił, ale komunikat ma być po
  // polsku, a nie z Postgresa — i zanim zajmiemy numer zamówienia. Pozycje
  // SPOZA KATALOGU (product_id null) świadomie pomijamy: nie ma czego szukać
  // w `products`, a `in("id", [])` zwróciłoby pustą listę i wywróciło warunek.
  const ids = [
    ...new Set(input.items.map((i) => i.product_id).filter((id): id is string => !!id)),
  ];
  if (ids.length > 0) {
    const { data: found, error: prodErr } = await supabase
      .from("products")
      .select("id")
      .in("id", ids);
    if (prodErr) return { ok: false, error: prodErr.message };
    if ((found ?? []).length !== ids.length) {
      return { ok: false, error: "Któryś z produktów już nie istnieje — odśwież stronę" };
    }
  }

  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .insert({
      user_id: null,
      guest_email: input.email,
      source: input.source,
      status: cod ? "processing" : "paid",
      total: input.total,
      shipping_address: input.address as unknown as Record<string, unknown>,
      // 'online' bez nowej wartości CHECK — rozróżnienie daje `source`.
      // 'cod' to ta sama wartość co w sklepie, więc plakietka „Pobranie"
      // na liście i karcie zamówienia zapala się sama.
      payment_method: input.payment_method,
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
      // Pole dokładamy TYLKO pozycji spoza katalogu. Kolumna ma DEFAULT '',
      // więc dla pozycji z katalogu nic to nie zmienia — a na bazie bez
      // migracji 82 PostgREST odrzuciłby nieznaną kolumnę (PGRST204) i
      // zablokował także zwykłe zamówienia zewnętrzne.
      ...(it.custom_name ? { custom_name: it.custom_name } : {}),
    })) as never[]
  );
  if (itemsErr) {
    // Zamówienie bez pozycji to śmieć — sprzątamy, żeby na liście nie został
    // pusty wiersz. Numer (z sekwencji) i tak przepada — to sprzątanie nie
    // zapobiega dziurze w numeracji, tylko usuwa pusty wiersz.
    const { error: cleanupErr } = await supabase.from("orders").delete().eq("id", orderId);
    if (cleanupErr) {
      // Sprzątanie też padło, więc puste zamówienie ZOSTAJE w bazie. Admin musi
      // o tym wiedzieć — inaczej zobaczy na liście pozycję znikąd i nie będzie
      // miał jak powiązać jej z tym błędem.
      console.error(
        "[zamowienia] sprzatanie po nieudanym zapisie pozycji nieudane:",
        cleanupErr.message
      );
      return {
        ok: false,
        error: `${itemsErr.message}. Uwaga: nie udało się usunąć pustego zamówienia — sprawdź listę zamówień.`,
      };
    }
    return { ok: false, error: itemsErr.message };
  }

  revalidatePath("/admin/zamowienia");
  return { ok: true, orderId };
}

// Ręczna wysyłka maila „Dziękujemy za zamówienie" do klienta z Allegro/OLX —
// od 2026-09-09 JEDYNA droga, którą ta wiadomość opuszcza sklep.
//
// Zgłoszenie pracownicy obsługującej panel: maila nie widziała (szedł
// automatem), nie mogła dopasować treści (czas realizacji wpisany na sztywno
// w szablonie) i — jej słowami — „nawet nie wiem, czy ją wysyłałam".
//
// Trzy rzeczy, którymi ta akcja świadomie różni się od sąsiadów w tym pliku:
// 1. WYSYŁA SYNCHRONICZNIE, nie przez after(). after() jest dla maili, które
//    tylko TOWARZYSZĄ innej czynności (zmiana statusu) i nie mogą jej zepsuć.
//    Tutaj mail JEST czynnością — nie ma czego chronić przed jego opóźnieniem.
// 2. BŁĄD WYSYŁKI WRACA do panelu zamiast wylądować w logach. Pracownica klika
//    świadomie i musi wiedzieć, czy klient dostał wiadomość.
// 3. Po udanej wysyłce zapisuje ślad: KIEDY poszła i CO dokładnie zawierała
//    (migracja 83) — to jest odpowiedź na „nie wiem, czy wysyłałam".
export async function sendExternalOrderMail(
  orderId: string,
  body: string
): Promise<ActionResult> {
  await requireAdmin();
  if (!orderId) return { ok: false, error: "Brak id zamówienia" };

  const text = typeof body === "string" ? body.trim() : "";
  if (!text) return { ok: false, error: "Wpisz treść wiadomości" };
  if (text.length > ACCEPTED_MAIL_MAX_LENGTH) {
    return {
      ok: false,
      error: `Wiadomość jest za długa — najwyżej ${ACCEPTED_MAIL_MAX_LENGTH} znaków`,
    };
  }

  const supabase = await createAdminClient();
  // `select("*")`, nie lista kolumn: gdyby ktoś zmergował kod przed migracją 83,
  // wymieniona wprost `accepted_mail_body` byłaby błędem PostgREST już na
  // ODCZYCIE — a chcemy, żeby do tego czasu padał najwyżej zapis po wysyłce.
  const { data: row, error: readErr } = await supabase
    .from("orders")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Zamówienie nie znalezione" };

  const order = row as {
    source?: string | null;
    guest_email: string | null;
    user_id: string | null;
  };
  // Zamówienie ZE SKLEPU dostało już potwierdzenie zakupu z checkoutu — ta
  // wiadomość dotyczy wyłącznie zamówień wpisanych ręcznie. Bramka jest też
  // zabezpieczeniem: panel pokazuje sekcję tylko dla zamówień ze źródłem, więc
  // wywołanie bez niego znaczy, że coś poszło nie tak.
  if (!order.source) {
    return {
      ok: false,
      error: "Ta wiadomość dotyczy tylko zamówień spoza sklepu (Allegro, OLX itp.)",
    };
  }

  const sent = await sendExternalOrderAcceptedMail(order, text);
  if (!sent.ok) return { ok: false, error: sent.error };

  const { error: saveErr } = await supabase
    .from("orders")
    .update({
      accepted_mail_sent_at: new Date().toISOString(),
      accepted_mail_body: text,
    } as never)
    .eq("id", orderId);
  if (saveErr) {
    // Mail JUŻ poszedł do klienta — komunikat nie może brzmieć jak „nie
    // wysłano", bo pracownica kliknęłaby drugi raz i klient dostałby wiadomość
    // podwójnie. (Najbardziej prawdopodobna przyczyna: kod na produkcji przed
    // aplikacją migracji 83, czyli PGRST204 na nieznanej kolumnie.)
    console.error("[zamowienia] zapis sladu wysylki maila nieudany:", saveErr.message);
    return {
      ok: false,
      error: `Wiadomość ZOSTAŁA wysłana do klienta, ale nie udało się zapisać jej w zamówieniu (${saveErr.message}). Nie wysyłaj ponownie.`,
    };
  }

  revalidatePath(`/admin/zamowienia/${orderId}`);
  return { ok: true, message: "Wiadomość wysłana do klienta" };
}
