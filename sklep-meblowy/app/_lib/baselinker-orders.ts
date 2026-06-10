import { createAdminClient } from "./supabase/server";
import {
  addOrder,
  type BLAddOrderInput,
  type BLOrderProduct,
} from "./baselinker";
import { formatVariantLabel } from "./variants";
import type { Order, OrderItem, Product } from "./types";

// ============================================================
// Push zamówienia z Mollien → BaseLinker
// ============================================================
// Wywoływane z webhooka Stripe po markOrderPaid. Mapuje nasze order_items
// + product (z baselinker_id) na format BL addOrder. Zapisuje BL order_id
// w orders.baselinker_order_id, żebyśmy mogli synchronizować statusy.
//
// Wymaga zmiennej środowiskowej BASELINKER_DEFAULT_STATUS_ID — id statusu
// BL na który mają trafiać nowe zamówienia (np. „Nowe – opłacone").
// Listę statusów uzyskujesz z GET /api/baselinker/test → order_statuses[].

const DEFAULT_TAX_RATE = 23;
const ORDER_SOURCE_NAME = "Mollien (sklep mollien.pl)";

// Sentinel trzymany w orders.baselinker_order_id na czas trwania pushu.
// Atomowy "claim" (UPDATE ... WHERE baselinker_order_id IS NULL) eliminuje
// race dwóch równoległych wywołań (np. duplikat webhooka Stripe + ręczny
// push), który tworzył zduplikowane zamówienie w BL. Format "pending:<epoch>"
// — timestamp pozwala przejąć claim osierocony przez crash/timeout procesu
// (inaczej opłacone zamówienie byłoby trwale zablokowane bez śladu).
const BL_PUSH_PENDING_PREFIX = "pending:";
// Po tym czasie claim uznajemy za osierocony i pozwalamy na przejęcie.
// Push to jeden HTTP do BL — 10 min z ogromnym zapasem.
const BL_PUSH_CLAIM_STALE_MS = 10 * 60 * 1000;

function isPendingSentinel(value: string): boolean {
  return value.startsWith(BL_PUSH_PENDING_PREFIX);
}

function sentinelAgeMs(value: string): number | null {
  const ts = Number(value.slice(BL_PUSH_PENDING_PREFIX.length));
  return Number.isFinite(ts) ? Date.now() - ts : null;
}

// Czy zamówienie ma już PRAWDZIWE ID z BL (nie sentinel, nie null)?
// Używane też przez webhook do decyzji "czy retry ma jeszcze co robić".
export function hasCompletedBlPush(
  baselinkerOrderId: string | null | undefined
): boolean {
  return !!baselinkerOrderId && !isPendingSentinel(baselinkerOrderId);
}

// Kraj z formularza checkout to wolny tekst ("Polska"). BL oczekuje kodu
// ISO-3166 alpha-2. Akceptujemy gotowe kody 2-literowe, wszystko inne
// mapujemy na PL (sklep wysyła wyłącznie w Polsce) — oryginalna wartość
// i tak zostaje w orders.shipping_address.
export function toCountryCode(country: string | null | undefined): string {
  const c = (country ?? "").trim();
  if (/^[A-Za-z]{2}$/.test(c)) return c.toUpperCase();
  return "PL";
}

type OrderWithItems = Order & {
  items: (OrderItem & { product?: Product | null })[];
  // Pola z DB, nie eksportowane explicite w Order — dodajemy tutaj.
  baselinker_order_id?: string | null;
};

// Czyść tylko to, co czyta mapowanie — pozwala testować bez pełnego Product/OrderItem.
export type BlOrderSourceItem = {
  product?: { name?: string | null; baselinker_id?: string | null; weight?: number | null } | null;
  variant_values?: Record<string, string> | null;
  notes?: string | null;
  price: number;
  quantity: number;
};

// Pozycje zamówienia → format BL. Klient mógł dopisać uwagi (item.notes) —
// dołączamy do `attributes` obok wariantu. Gdy był rabat (promo_discount > 0),
// doklejamy ujemną pozycję „Rabat", żeby suma zamówienia w BL = kwota faktycznie
// zapłacona przez klienta (rabat stosowany na poziomie zamówienia, nie per-pozycja).
// Bez tego BL pokazywał pełną cenę → błędne faktury/zwroty (K1).
export function buildBlOrderProducts(
  items: BlOrderSourceItem[],
  promoDiscount: number
): BLOrderProduct[] {
  const products: BLOrderProduct[] = items.map((item) => {
    const p = item.product;
    const baseName = p?.name ?? "Produkt";
    const variantLabel = item.variant_values
      ? formatVariantLabel(item.variant_values)
      : "";
    const itemNotes = item.notes?.trim() ?? "";
    const variantSuffix = variantLabel ? ` — ${variantLabel}` : "";
    const attributes = [variantLabel, itemNotes ? `Uwagi: ${itemNotes}` : ""]
      .filter(Boolean)
      .join(" | ");
    return {
      product_id: p?.baselinker_id ?? undefined,
      name: baseName + variantSuffix,
      attributes: attributes || undefined,
      price_brutto: Number(item.price),
      tax_rate: DEFAULT_TAX_RATE,
      quantity: item.quantity,
      weight: p?.weight ?? undefined,
    };
  });

  if (promoDiscount > 0) {
    products.push({
      name: "Rabat",
      price_brutto: -promoDiscount,
      tax_rate: DEFAULT_TAX_RATE,
      quantity: 1,
    });
  }

  return products;
}

// Trwały ślad błędu/powodu pominięcia pushu — orders.baselinker_push_error
// (migracja 25). Best-effort: awaria zapisu śladu nie może zabić pushu.
async function recordPushError(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  orderId: string,
  message: string
): Promise<void> {
  const { error } = await supabase
    .from("orders")
    .update({ baselinker_push_error: message } as never)
    .eq("id", orderId);
  if (error) {
    console.error(
      `[BL] zapis baselinker_push_error nieudany (${orderId}):`,
      error.message
    );
  }
}

export async function pushOrderToBaseLinker(orderId: string): Promise<{
  baselinker_order_id: number | null;
  reason?: string;
}> {
  const supabase = await createAdminClient();

  // Pominięcie pushu z powodem — zapisujemy ślad w orders, żeby admin
  // widział co wymaga ręcznego pushu (/api/baselinker/push-order).
  const skip = async (reason: string) => {
    await recordPushError(supabase, orderId, reason);
    return { baselinker_order_id: null, reason };
  };

  // Pobierz pełne zamówienie z items i produktami
  const { data: order, error: orderErr } = await supabase
    .from("orders")
    .select("*, items:order_items(*, product:products(*))")
    .eq("id", orderId)
    .single();

  if (orderErr || !order) {
    return {
      baselinker_order_id: null,
      reason: `nie znaleziono zamówienia ${orderId}`,
    };
  }

  const o = order as unknown as OrderWithItems;

  // Idempotencja PRZED walidacją env — broken env nie może nadpisywać
  // baselinker_push_error na zamówieniach już zsynchronizowanych z BL.
  // Osierocony sentinel (crash/timeout między claimem a release) wykrywamy
  // po timestampie i pozwalamy przejąć niżej.
  let staleSentinel: string | null = null;
  if (o.baselinker_order_id) {
    if (isPendingSentinel(o.baselinker_order_id)) {
      const age = sentinelAgeMs(o.baselinker_order_id);
      if (age !== null && age < BL_PUSH_CLAIM_STALE_MS) {
        return {
          baselinker_order_id: null,
          reason:
            "push w toku (równoległe wywołanie) — sprawdź ponownie za chwilę",
        };
      }
      staleSentinel = o.baselinker_order_id;
    } else {
      return {
        baselinker_order_id: Number(o.baselinker_order_id),
        reason: "już wcześniej zsynchronizowane",
      };
    }
  }

  const statusIdRaw = process.env.BASELINKER_DEFAULT_STATUS_ID;
  if (!statusIdRaw) {
    return skip("BASELINKER_DEFAULT_STATUS_ID nie ustawiony");
  }
  const statusId = Number(statusIdRaw);
  if (!Number.isFinite(statusId) || statusId <= 0) {
    return skip("BASELINKER_DEFAULT_STATUS_ID jest nieprawidłowy");
  }

  // Email klienta — guest_email albo z auth.users dla zalogowanego.
  // Błąd odczytu auth (przejściowa awaria) NIE jest tym samym co trwały brak
  // emaila — rzucamy, żeby push można było ponowić, zamiast cicho pominąć.
  let email = o.guest_email ?? "";
  if (!email && o.user_id) {
    const { data: userData, error: userErr } =
      await supabase.auth.admin.getUserById(o.user_id);
    if (userErr) {
      const msg = `auth.getUserById nieudane: ${userErr.message}`;
      await recordPushError(supabase, orderId, msg);
      throw new Error(msg);
    }
    email = userData?.user?.email ?? "";
  }
  if (!email) {
    return skip("brak emaila klienta — nie mogę utworzyć zamówienia w BL");
  }

  const address = o.shipping_address ?? {};
  const fullname =
    (address.fullname ?? "").trim() ||
    "Klient (dane do uzupełnienia)";

  // Pozycje + ujemna linia „Rabat" gdy był promo_discount (K1).
  const products = buildBlOrderProducts(o.items, Number(o.promo_discount ?? 0));

  const input: BLAddOrderInput = {
    order_status_id: statusId,
    date_add: Math.floor(new Date(o.created_at).getTime() / 1000),
    currency: "PLN",
    payment_method: "Stripe",
    payment_method_cod: 0,
    paid: 1,
    email,
    phone: address.phone,
    delivery_method: "Kurier",
    // Dostawa NIE jest wliczana do `total` (checkout: koszt mebli ustala admin
    // po zamówieniu i dolicza w BL osobno) → tu zawsze 0.
    delivery_price: 0,
    delivery_fullname: fullname,
    delivery_address: address.street,
    delivery_postcode: address.postal_code,
    delivery_city: address.city,
    delivery_country_code: toCountryCode(address.country),
    extra_field_1: ORDER_SOURCE_NAME,
    extra_field_2: o.stripe_payment_intent ?? undefined,
    products,
  };

  // Atomowy claim — tylko jedno wywołanie przechodzi dalej. Świeże zamówienie:
  // CAS po IS NULL; osierocony sentinel: CAS po jego dokładnej wartości
  // (równoległe przejęcia rozstrzyga DB — wygrywa jedno).
  const ourSentinel = `${BL_PUSH_PENDING_PREFIX}${Date.now()}`;
  const claimQuery = supabase
    .from("orders")
    .update({ baselinker_order_id: ourSentinel } as never)
    .eq("id", orderId);
  const { data: claimedRows, error: claimErr } = await (staleSentinel
    ? claimQuery.eq("baselinker_order_id", staleSentinel)
    : claimQuery.is("baselinker_order_id", null)
  ).select("id");

  if (claimErr) {
    const msg = `claim pushu nieudany: ${claimErr.message}`;
    await recordPushError(supabase, orderId, msg);
    throw new Error(msg);
  }
  if (!claimedRows || claimedRows.length === 0) {
    return {
      baselinker_order_id: null,
      reason: "push w toku albo już wykonany (równoległe wywołanie)",
    };
  }

  if (staleSentinel) {
    // Przejęliśmy claim po crashu poprzedniego pushu — tamten addOrder MÓGŁ
    // przejść po stronie BL zanim proces zginął. Zostaw ślad do ręcznej
    // weryfikacji duplikatu w panelu BL.
    console.warn(
      `[BL] przejęto osierocony claim pushu dla ${orderId} (${staleSentinel}) — zweryfikuj w BL, czy zamówienie nie zostało już utworzone`
    );
    await recordPushError(
      supabase,
      orderId,
      "przejęto osierocony claim pushu — zweryfikuj w BL, czy zamówienie nie ma duplikatu"
    );
  }

  try {
    const result = await addOrder(input);

    // Zapisz BL order_id (zwalniając sentinel) + wyczyść ślad błędu.
    const { error: saveErr } = await supabase
      .from("orders")
      .update({
        baselinker_order_id: String(result.order_id),
        baselinker_push_error: null,
      } as never)
      .eq("id", orderId);

    if (saveErr) {
      // Zamówienie JEST w BL, ale nie zapisaliśmy ID. Sentinel zostaje —
      // retry NIE może utworzyć duplikatu. Ślad z BL id pozwala adminowi
      // uzupełnić ręcznie.
      const msg = `addOrder OK (BL order_id=${result.order_id}), ale zapis ID w orders nieudany: ${saveErr.message}`;
      console.error(`[BL] ${msg}`);
      await recordPushError(supabase, orderId, msg);
      return { baselinker_order_id: result.order_id, reason: msg };
    }

    return { baselinker_order_id: result.order_id };
  } catch (err) {
    // Push nie wyszedł — zwolnij claim (tylko jeśli to nasz sentinel),
    // zapisz ślad i rzuć dalej. Uwaga: jeśli addOrder przeszedł po stronie
    // BL a odpowiedź zginęła w sieci, retry może utworzyć duplikat — BL nie
    // wspiera klucza idempotencji; ślad błędu pozwala to zweryfikować.
    const msg = err instanceof Error ? err.message : String(err);
    const { error: releaseErr } = await supabase
      .from("orders")
      .update({
        baselinker_order_id: null,
        baselinker_push_error: msg,
      } as never)
      .eq("id", orderId)
      .eq("baselinker_order_id", ourSentinel);
    if (releaseErr) {
      // Nieudane zwolnienie = claim zostaje do przedawnienia (10 min) i
      // zostanie przejęty przy kolejnej próbie — ale zostaw głośny ślad.
      console.error(
        `[BL] zwolnienie claimu nieudane (${orderId}): ${releaseErr.message} — claim wygaśnie po ${BL_PUSH_CLAIM_STALE_MS / 60000} min`
      );
    }
    throw err;
  }
}
