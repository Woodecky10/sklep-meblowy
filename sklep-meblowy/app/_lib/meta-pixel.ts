// Meta Pixel (Facebook/Instagram) — identyfikator i budowanie parametrów zdarzeń.
// Moduł CZYSTY (bez server-only): importuje go komponent kliencki, proxy i test.
//
// Bliźniak app/_lib/analytics.ts, ta sama zasada: identyfikator siedzi w
// NEXT_PUBLIC_META_PIXEL_ID, nie w kodzie, bo przepięcie sklepu na inny pixel
// (np. przy zmianie agencji) ma być zmianą jednej zmiennej w hostingu, nie
// commitem. UWAGA: NEXT_PUBLIC_* jest wstrzykiwane na etapie builda — zmiana
// wartości w panelu Vercela wymaga Redeploy.
//
// ⚠️ Pixel to narzędzie REMARKETINGOWE, nie analityczne. W banerze cookies wisi
// na zgodzie "marketing" (patrz MetaPixel.tsx), nigdy na "analytics".

// Identyfikatory pixela to 15–16 cyfr. Zakres celowo wąski: ma odrzucić
// identyfikator GA wklejony do złej zmiennej, a nie „cokolwiek cyfrowego".
const META_PIXEL_ID_RE = /^\d{15,16}$/;

export function isValidMetaPixelId(id: string): boolean {
  return META_PIXEL_ID_RE.test(id);
}

const RAW_PIXEL_ID = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";

// Pusty string = pixel wyłączony (brak zmiennej albo literówka w wartości).
// Świadomie nie rzucamy: brak pixela nie może wywalić sklepu, a nieodfiltrowana
// literówka oznaczałaby ładowanie fbevents.js z bezsensownym id.
export const META_PIXEL_ID = isValidMetaPixelId(RAW_PIXEL_ID) ? RAW_PIXEL_ID : "";

// Kwoty w groszach po stronie Meta nie istnieją — wszystko idzie w jednostkach
// głównych waluty. Zaokrąglenie broni przed 33.329999999999995 w JSON-ie.
export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

// W bazie waluta leży małymi literami ("pln"), Meta oczekuje ISO-4217 ("PLN").
export function toPixelCurrency(currency: string): string {
  return currency.toUpperCase();
}

export type PixelLineItem = {
  productId: string;
  quantity: number;
  price: number;
};

export type PixelContents = {
  content_type: "product";
  content_ids: string[];
  contents: { id: string; quantity: number; item_price: number }[];
  num_items: number;
};

// Wspólny zestaw parametrów zawartości dla ViewContent/AddToCart/
// InitiateCheckout/Purchase.
//
// ⚠️ Jako identyfikatora używamy UUID produktu — DOKŁADNIE tego, który leci jako
// `g:id` w feedzie dla Google Merchant Center (app/_lib/product-feed.ts). Gdy
// powstanie katalog produktowy w Meta pod reklamy dynamiczne, identyfikatory
// będą pasować bez migracji. Zmiana schematu tutaj bez zmiany tam po cichu
// rozjedzie oba katalogi.
export function buildContents(items: PixelLineItem[]): PixelContents {
  // Sofa w dwóch tkaninach to dwa wiersze order_items, ale jeden produkt w
  // katalogu — scalamy po id, bo powtórzone content_ids psują dopasowanie do
  // katalogu, a powtórzone contents zawyżają liczbę sztuk w raporcie.
  const merged = new Map<string, { quantity: number; price: number }>();

  for (const item of items) {
    // product_id ma FK ON DELETE SET NULL: po skasowaniu produktu z katalogu
    // stara pozycja zostaje bez id. Lepiej wysłać zakup bez tej pozycji niż z
    // `undefined` w content_ids.
    if (!item.productId) continue;
    const current = merged.get(item.productId);
    if (current) current.quantity += item.quantity;
    else merged.set(item.productId, { quantity: item.quantity, price: item.price });
  }

  const contents = [...merged.entries()].map(([id, { quantity, price }]) => ({
    id,
    quantity,
    item_price: roundMoney(price),
  }));

  return {
    content_type: "product",
    content_ids: contents.map((c) => c.id),
    contents,
    num_items: contents.reduce((sum, c) => sum + c.quantity, 0),
  };
}

// Waluta zdarzeń przedzakupowych (ViewContent/AddToCart/InitiateCheckout).
//
// Ceny w bazie i w koszyku są ZAWSZE w PLN — EUR powstaje dopiero przy
// wyświetlaniu i przy rejestracji płatności (app/_lib/money.ts). Purchase jest
// inny: tam bierzemy walutę zapisaną w zamówieniu, bo ta jest już przeliczona.
export const CATALOG_CURRENCY = "PLN";

export type CartEventPayload = PixelContents & {
  value: number;
  currency: string;
};

// Parametry dla zdarzeń koszykowych. `value` można nadpisać — InitiateCheckout
// ma pokazywać kwotę PO rabacie, a nie sumę cen katalogowych.
export function buildCartEventPayload(
  items: PixelLineItem[],
  value?: number
): CartEventPayload {
  const contents = buildContents(items);
  // ⚠️ `value ?? suma`, NIE `value || suma`: koszyk w całości pokryty rabatem
  // ma wysłać 0, a nie po cichu pełną cenę katalogową.
  const resolved =
    value ?? contents.contents.reduce((sum, c) => sum + c.item_price * c.quantity, 0);

  return { ...contents, value: roundMoney(resolved), currency: CATALOG_CURRENCY };
}

// Czy zamówienie w tym stanie ma pójść do Meta jako zakup.
//
// ⚠️ NIE używać tu `status !== "pending"` (tak wygląda warunek nagłówka na
// stronie podziękowania) — ten warunek przepuszcza „cancelled", więc anulowane
// zamówienie liczyłoby się jako sprzedaż w Menedżerze reklam.
//
// Online: dopiero potwierdzona notyfikacja z P24 przestawia status z „pending",
// więc czekamy — inaczej każda porzucona i nieudana płatność zawyżałaby wynik
// kampanii. Pobranie: zamówienie jest przyjęte do realizacji z chwilą złożenia,
// pieniądze przyjdą od kuriera, więc liczy się od razu mimo statusu „pending".
export function shouldTrackPurchase(
  status: "pending" | "paid" | "processing" | "shipped" | "delivered" | "cancelled",
  paymentMethod: "online" | "cod"
): boolean {
  if (status === "cancelled") return false;
  if (paymentMethod === "cod") return true;
  return status !== "pending";
}

export type PurchasePayload = PixelContents & {
  value: number;
  currency: string;
};

// ⚠️ `value` to kwota zamówienia z bazy, NIE suma pozycji. Suma pozycji nie zna
// rabatów ani dostawy, więc ROAS liczony z niej byłby zawyżony przy każdym
// kuponie i zestawie.
export function buildPurchasePayload(order: {
  total: number;
  currency: string;
  items: PixelLineItem[];
}): PurchasePayload {
  return {
    ...buildContents(order.items),
    value: roundMoney(order.total),
    currency: toPixelCurrency(order.currency),
  };
}
