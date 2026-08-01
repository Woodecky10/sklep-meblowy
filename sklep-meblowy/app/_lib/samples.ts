// I/O zamówień próbek tkanin (migracja 67). Czysta logika — wycena, podział na
// gratis/płatne, klucz darmowej puli — siedzi w sample-pricing.ts i NIE jest tu
// duplikowana: ten plik wyłącznie rozmawia z bazą.
//
// ⚠️ Wszystkie zapytania idą przez createAdminClient (service role), i to jest
// wymóg, nie wygoda: `sample_quota` oraz `sample_order_items` mają RLS włączone
// BEZ POLITYK (default-deny), a jedyna polityka na `sample_orders` przepuszcza
// wyłącznie własne zamówienia użytkownika. Klient sesyjny (nawet admina)
// zobaczyłby tu pustkę — bez błędu, po cichu.
import "server-only";

import { createAdminClient } from "./supabase/server";
import {
  SAMPLE_FREE_LIMIT,
  SAMPLE_UNIT_PRICE,
  dedupeSelections,
  normalizeEmailKey,
  sampleOrderTotal,
  splitFreePaid,
  type SampleSelection,
} from "./sample-pricing";
import type {
  Address,
  SampleOrder,
  SampleOrderItem,
  SampleOrderStatus,
} from "./types";

type AdminClient = Awaited<ReturnType<typeof createAdminClient>>;

export type SampleOrderWithItems = SampleOrder & { items: SampleOrderItem[] };

export type CreateSampleOrderInput = {
  userId: string;
  // ⚠️ E-MAIL Z SESJI, nigdy z formularza. normalizeEmailKey nie jest
  // walidatorem: dla „jan+a@b@gmail.com" zwraca „jan@gmail.com", czyli klucz
  // CUDZEJ skrzynki. Gdyby wartość szła z edytowalnego pola, wystarczyłoby
  // kilka zamówień, żeby spalić dowolnej osobie darmową pulę na rok.
  email: string;
  name: string;
  phone: string | null;
  // Partial<Address>, nie Record<string, string> — ten sam kształt, w jakim
  // adres wraca z bazy (SampleOrder.shipping_address) i w jakim leży
  // w profiles.address / orders.shipping_address.
  address: Partial<Address>;
  selections: SampleSelection[];
};

// Zwrot miejsc do darmowej puli. Nigdy nie rzuca: wołamy to na ścieżkach
// kompensacji, gdzie mamy już inny (ważniejszy) błąd do przekazania wyżej,
// a przykrycie go błędem kompensacji zgubiłoby przyczynę.
async function releaseFreeQuota(
  supabase: AdminClient,
  emailKey: string,
  qty: number
): Promise<void> {
  if (qty <= 0) return;
  try {
    // normalizeEmailKey przed KAŻDYM wywołaniem RPC — funkcja jest idempotentna,
    // więc powtórzenie na już znormalizowanym kluczu nic nie psuje, a chroni
    // przed zwrotem miejsc do wiersza, którego nie ma (klucz surowy ≠ klucz puli).
    const { error } = await supabase.rpc("release_free_samples", {
      p_email_key: normalizeEmailKey(emailKey),
      p_qty: qty,
    });
    if (error) {
      console.error(
        `[probki] zwrot ${qty} darmowych sztuk do puli nieudany (${emailKey}):`,
        error.message
      );
    }
  } catch (err) {
    console.error(`[probki] zwrot darmowych sztuk rzucil wyjatkiem (${emailKey}):`, err);
  }
}

// Ile darmowych sztuk zostało — do pokazania PRZED wyborem. To odczyt
// poglądowy: rozstrzyga dopiero claim_free_samples przy składaniu zamówienia.
export async function getSampleQuotaLeft(emailKey: string): Promise<number> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_quota")
    .select("used_count, window_start")
    // Normalizacja także tutaj (idempotentna): odczyt musi trafić w DOKŁADNIE
    // ten sam wiersz, który przestawi później claim_free_samples. Inaczej
    // klient zobaczyłby „3 gratisy", a przy składaniu dostał 0.
    .eq("email_key", normalizeEmailKey(emailKey))
    .maybeSingle();

  if (error) {
    console.error("[probki] odczyt puli nieudany:", error.message);
    return 0; // Bezpiecznie w dół: lepiej pokazać mniej gratisów niż obiecać za dużo.
  }
  if (!data) return SAMPLE_FREE_LIMIT;

  const row = data as { used_count: number; window_start: string };
  const windowStart = new Date(row.window_start).getTime();
  // 365 dni to przybliżenie `interval '12 months'` z RPC — na granicy okna
  // (raz na rok, przy roku przestępnym o dobę) obie liczby mogą się różnić.
  // Świadomie: sędzią jest baza, ta wartość tylko informuje.
  const yearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
  if (windowStart < yearAgo) return SAMPLE_FREE_LIMIT;

  return Math.max(0, SAMPLE_FREE_LIMIT - row.used_count);
}

export async function createSampleOrder(input: CreateSampleOrderInput) {
  const supabase = await createAdminClient();
  const selections = dedupeSelections(input.selections);
  if (selections.length === 0) throw new Error("Nie wybrano żadnej próbki");

  const emailKey = normalizeEmailKey(input.email);

  // REZERWACJA PRZY SKŁADANIU, nie po zapłacie. Inaczej klient złożyłby trzy
  // zamówienia naraz i w każdym dostał trzy gratisy.
  // p_user_id jest informacyjny (sample_quota.user_id służy właścicielce do
  // powiązania licznika z kontem przy reklamacji) — bez niego kolumna zostałaby
  // pusta na zawsze. Wołamy TRZYargumentowo, bo tylko taka sygnatura istnieje
  // na produkcji.
  const { data: granted, error: claimError } = await supabase.rpc("claim_free_samples", {
    p_email_key: emailKey,
    p_qty: selections.length,
    p_user_id: input.userId,
  });
  // Błąd RPC (w tym `raise exception` z funkcji) MUSI wysadzić zamówienie.
  // Zamiana go na „zero gratisów" oznaczałaby, że klient płaci 45 zł za trzy
  // próbki, które miały być darmowe — i nie zostaje po tym żaden ślad.
  if (claimError) throw new Error(`Nie udało się sprawdzić puli: ${claimError.message}`);

  const { free, paid } = splitFreePaid(selections.length, Number(granted ?? 0));
  const amountTotal = sampleOrderTotal(paid);

  // ⚠️ OD TEGO MIEJSCA PULA JEST JUŻ POMNIEJSZONA. claim_free_samples commituje
  // we WŁASNEJ transakcji, niezależnej od poniższych insertów — cokolwiek tu
  // padnie (błąd bazy, wyjątek, timeout), zabiera klientowi gratisy bez
  // zamówienia, które właścicielka mogłaby anulować. Dlatego każda ścieżka
  // wyjścia przez błąd kompensuje przez release_free_samples.
  try {
    const { data: order, error: orderError } = await supabase
      .from("sample_orders")
      .insert({
        user_id: input.userId,
        customer_name: input.name,
        customer_email: input.email,
        customer_phone: input.phone,
        shipping_address: input.address,
        status: "new",
        // Dwie niezależne osie stanu: „nic do zapłaty" to nie to samo, co
        // „czeka na płatność".
        payment_status: amountTotal > 0 ? "pending" : "none",
        amount_total: amountTotal,
        free_count: free,
        paid_count: paid,
        // Klucz znormalizowany — po nim anulowanie zwróci pulę do właściwego wiersza.
        email_key: emailKey,
      } as never)
      .select("id")
      .single();

    if (orderError || !order) {
      throw new Error(
        `Nie udało się zapisać zamówienia: ${orderError?.message ?? "brak danych"}`
      );
    }

    const orderId = (order as { id: string }).id;
    // Kolejność z dedupeSelections wyznacza, które sztuki są gratis — pierwsze
    // `free` pozycji. Klient nie wskazuje, która próbka ma być darmowa.
    const items = selections.map((s, index) => ({
      sample_order_id: orderId,
      fabric_id: s.fabricId,
      color: s.color,
      fabric_name: s.fabricName,
      is_free: index < free,
      unit_price: index < free ? 0 : SAMPLE_UNIT_PRICE,
    }));

    const { error: itemsError } = await supabase
      .from("sample_order_items")
      .insert(items as never);
    if (itemsError) {
      // Zamówienie bez pozycji jest bezużyteczne (właścicielka nie wie, co
      // wysłać) — kasujemy je, żeby nie zostało w panelu jako puste.
      await supabase.from("sample_orders").delete().eq("id", orderId);
      throw new Error(`Nie udało się zapisać pozycji: ${itemsError.message}`);
    }

    return { orderId, amountTotal, freeCount: free, paidCount: paid };
  } catch (err) {
    // Kompensacja: tyle sztuk, ile FAKTYCZNIE przyznała baza (`free`), i ten sam
    // znormalizowany klucz. Po niej przekazujemy oryginalny błąd dalej.
    await releaseFreeQuota(supabase, emailKey, free);
    throw err;
  }
}

export async function getSampleOrders(): Promise<SampleOrderWithItems[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_orders")
    .select("*, items:sample_order_items(*)")
    .order("created_at", { ascending: false });

  if (error) {
    // Nie połykamy po cichu: pusta lista w panelu wygląda jak "brak zamówień",
    // czyli kłamie dokładnie wtedy, gdy coś jest zepsute.
    console.error("[probki] odczyt zamowien nieudany:", error.message);
    return [];
  }
  return (data ?? []) as SampleOrderWithItems[];
}

export async function getSampleOrderById(id: string): Promise<SampleOrderWithItems | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_orders")
    .select("*, items:sample_order_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) {
    console.error("[probki] odczyt zamowienia nieudany:", error.message);
    return null;
  }
  return (data as SampleOrderWithItems | null) ?? null;
}

// Licznik przy pozycji w nawigacji = "ile czeka na spakowanie". Nieopłacone
// świadomie NIE liczą się: właścicielka nie ma się nimi zajmować, dopóki
// klient nie zapłaci, a badge ma znaczyć pracę do zrobienia.
export async function getNewSampleOrdersCount(): Promise<number> {
  const supabase = await createAdminClient();
  const { count, error } = await supabase
    .from("sample_orders")
    .select("id", { count: "exact", head: true })
    .eq("status", "new")
    .neq("payment_status", "pending");
  if (error) {
    // Badge nie może wywalić layoutu panelu (renderuje się na każdej podstronie).
    console.error("[probki] licznik nieudany:", error.message);
    return 0;
  }
  return count ?? 0;
}

export async function setSampleOrderStatus(
  id: string,
  status: SampleOrderStatus,
  tracking?: string
): Promise<void> {
  const supabase = await createAdminClient();
  const patch: Record<string, unknown> = { status };
  if (status === "sent") {
    patch.sent_at = new Date().toISOString();
    if (tracking !== undefined) patch.tracking = tracking;
  }
  const { error } = await supabase.from("sample_orders").update(patch as never).eq("id", id);
  if (error) throw new Error(error.message);
}

export async function cancelSampleOrder(id: string): Promise<void> {
  const supabase = await createAdminClient();

  // WARUNKOWY FLIP, nie „przeczytaj → zaktualizuj → zwolnij". release_free_samples
  // NIE jest idempotentne: dwa kliknięcia „Anuluj" (albo dwa otwarte panele)
  // oddałyby klientowi sześć gratisów zamiast trzech. Pulę zwalniamy TYLKO
  // wtedy, gdy to wywołanie faktycznie przestawiło status.
  const { data, error } = await supabase
    .from("sample_orders")
    .update({ status: "cancelled" } as never)
    .eq("id", id)
    .neq("status", "cancelled")
    .select("email_key, free_count");
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as { email_key: string; free_count: number }[];
  if (rows.length === 0) {
    // Zero wierszy ma dwie przyczyny — trzeba je rozróżnić, bo „już anulowane"
    // to sukces, a „nie ma takiego zamówienia" to błąd wart pokazania.
    const { data: existing } = await supabase
      .from("sample_orders")
      .select("id")
      .eq("id", id)
      .maybeSingle();
    if (!existing) throw new Error("Zamówienie nie istnieje");
    return;
  }

  // Zwrot darmowych miejsc — bez tego porzucone zamówienie blokuje pulę na rok.
  await releaseFreeQuota(supabase, rows[0].email_key, rows[0].free_count);
}

// Idempotentne rozliczenie: powtórzona notyfikacja P24 nie może zapłacić dwa razy.
// Zwraca true tylko przy PIERWSZYM przejściu w stan opłacony — na tej podstawie
// wysyłamy maila (Task 7).
export async function markSampleOrderPaid(id: string, paymentRef: string): Promise<boolean> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("sample_orders")
    .update({ payment_status: "paid", payment_ref: paymentRef } as never)
    .eq("id", id)
    .neq("payment_status", "paid")
    .select("id");

  if (error) throw new Error(error.message);
  return (data ?? []).length > 0;
}
