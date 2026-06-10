// ============================================================
// BaseLinker API client
// ============================================================
// Dokumentacja: https://api.baselinker.com/index.php?gateway/api
//
// Wszystkie wywołania to POST do connector.php z:
//   - header X-BLToken: {token}
//   - body form-encoded: method={name}&parameters={JSON}
// Odpowiedź zawsze JSON z polem `status`: "SUCCESS" lub "ERROR".

const BL_URL = "https://api.baselinker.com/connector.php";

type BLResponse<T = unknown> =
  | ({ status: "SUCCESS" } & T)
  | { status: "ERROR"; error_message: string; error_code: string };

export class BaseLinkerError extends Error {
  constructor(public method: string, public errorCode: string, message: string) {
    super(`BaseLinker [${method}] ${errorCode}: ${message}`);
    this.name = "BaseLinkerError";
  }
}

export class BaseLinkerHttpError extends Error {
  constructor(public status: number) {
    super(`BaseLinker HTTP ${status}`);
    this.name = "BaseLinkerHttpError";
  }
}

// Kody błędów BL uznawane za PRZEJŚCIOWE. Rate-limit BL — kod do potwierdzenia
// na żywym koncie (open item); zbiór łatwy do uzupełnienia bez zmian w logice.
const TRANSIENT_BL_ERROR_CODES = new Set<string>(["ERROR_RATE_LIMIT"]);

export function isTransientBlError(err: unknown): boolean {
  if (err instanceof BaseLinkerHttpError) return err.status >= 500 || err.status === 429;
  if (err instanceof BaseLinkerError) return TRANSIENT_BL_ERROR_CODES.has(err.errorCode);
  if (err instanceof TypeError) return true; // błąd sieciowy z fetch()
  return false;
}

export function retryDelayMs(attempt: number, baseDelayMs: number): number {
  return baseDelayMs * 2 ** (attempt - 1);
}

export type BlRetryOptions = { attempts: number; baseDelayMs: number };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Pojedyncze wywołanie BL (bez retry).
async function blRequestOnce<T = unknown>(
  method: string,
  parameters: Record<string, unknown> = {}
): Promise<T> {
  const token = process.env.BASELINKER_API_TOKEN;
  if (!token) {
    throw new Error("BASELINKER_API_TOKEN nie jest ustawiony w env");
  }

  const body = new URLSearchParams({
    method,
    parameters: JSON.stringify(parameters),
  });

  const res = await fetch(BL_URL, {
    method: "POST",
    headers: {
      "X-BLToken": token,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    cache: "no-store",
  });

  if (!res.ok) {
    throw new BaseLinkerHttpError(res.status);
  }

  const data = (await res.json()) as BLResponse<T>;
  if (data.status === "ERROR") {
    throw new BaseLinkerError(method, data.error_code, data.error_message);
  }

  return data as T;
}

// retry = opt-in (tylko idempotentne odczyty). Ponawia WYŁĄCZNIE przejściowe.
export async function blRequest<T = unknown>(
  method: string,
  parameters: Record<string, unknown> = {},
  retry?: BlRetryOptions
): Promise<T> {
  const attempts = retry?.attempts ?? 1;
  const baseDelayMs = retry?.baseDelayMs ?? 500;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await blRequestOnce<T>(method, parameters);
    } catch (err) {
      lastErr = err;
      if (attempt >= attempts || !isTransientBlError(err)) throw err;
      await sleep(retryDelayMs(attempt, baseDelayMs));
    }
  }
  throw lastErr;
}

// ============================================================
// Typy odpowiedzi (tylko najczęstsze pola — BL ma ich więcej)
// ============================================================

// Kształt wg oficjalnej dokumentacji getInventories — BL zwraca
// price_groups (lista ID grup cenowych) + default_price_group (ID domyślnej),
// NIE pojedyncze price_group_id (takie pole nie istnieje w odpowiedzi API).
export type BLInventory = {
  inventory_id: number;
  name: string;
  description: string;
  languages: string[];
  default_language: string;
  price_groups: number[];
  default_price_group: number;
  warehouses: string[];
  default_warehouse: string;
  reservations: boolean;
  is_default: boolean;
};

export type BLInventoryListResponse = {
  inventories: BLInventory[];
};

export type BLCategory = {
  category_id: number;
  name: string;
  parent_id: number;
};

export type BLCategoriesResponse = {
  categories: BLCategory[];
};

// Pełne dane produktu z getInventoryProductsData. Mapowane pola — BL zwraca
// dużo więcej, podajemy te które używamy. ID produktu NIE jest polem
// odpowiedzi — to klucz w Record<string, BLInventoryProduct>.
export type BLInventoryProduct = {
  ean?: string;
  sku?: string;
  text_fields?: {
    name?: string;
    description?: string;
    description_extra1?: string;
    description_extra2?: string;
    description_extra3?: string;
    description_extra4?: string;
    // Audyt 2026-06-08: BL bywa trzyma cechy pod text_fields.features.
    features?: Record<string, string> | { name: string; value: string }[];
    [k: string]: string | Record<string, string> | { name: string; value: string }[] | undefined;
  };
  category_id?: number;
  prices?: Record<string, number>; // {price_group_id: price}
  weight?: number;
  height?: number;
  width?: number;
  length?: number;
  manufacturer_id?: number;
  images?: string[] | Record<string, string>;
  // BL zwraca features jako obiekt {nazwa: wartość} — historycznie był array
  // {name, value}[], wspieramy oba formaty w helperze getFeature.
  features?: Record<string, string> | { name: string; value: string }[];
  // BL zwraca warianty jako obiekt {variant_id: BLVariant}, nie array.
  variants?: Record<string, BLVariant>;
  stock?: Record<string, number>;
};

export type BLVariant = {
  name: string;
  ean?: string;
  asin?: string;
  sku?: string;
  stock?: Record<string, number>; // {warehouse_id: qty}
  prices?: Record<string, number>; // {price_group_id: price}
};

// Wiersz z getInventoryProductsList — okrojony względem pełnych danych:
// tylko id/ean/sku/name/prices/stock (name na TOP-LEVEL, nie w text_fields;
// id jest LICZBĄ). Pełne text_fields/images/variants/features daje dopiero
// getInventoryProductsData.
export type BLProductListItem = {
  id: number;
  ean?: string;
  sku?: string;
  name?: string;
  prices?: Record<string, number>; // {price_group_id: price}
  stock?: Record<string, number>; // {warehouse_id: qty}
};

export type BLInventoryProductsListResponse = {
  products: Record<string, BLProductListItem>; // klucz = id produktu
};

export type BLInventoryProductsDataResponse = {
  products: Record<string, BLInventoryProduct>; // klucz = id produktu
};

// ============================================================
// Helpery — najczęstsze metody
// ============================================================

export async function getInventories(retry?: BlRetryOptions): Promise<BLInventory[]> {
  const res = await blRequest<BLInventoryListResponse>("getInventories", {}, retry);
  return res.inventories ?? [];
}

export async function getInventoryCategories(
  inventoryId: number
): Promise<BLCategory[]> {
  const res = await blRequest<BLCategoriesResponse>("getInventoryCategories", {
    inventory_id: inventoryId,
  });
  return res.categories ?? [];
}

// Lista produktów z magazynu — paginowana (page index 1+)
export async function getInventoryProductsList(
  inventoryId: number,
  page = 1,
  retry?: BlRetryOptions
): Promise<BLInventoryProductsListResponse> {
  return blRequest<BLInventoryProductsListResponse>(
    "getInventoryProductsList",
    { inventory_id: inventoryId, page },
    retry
  );
}

// Pełne dane produktów — bierzemy listę ID (max 1000 naraz)
export async function getInventoryProductsData(
  inventoryId: number,
  productIds: string[],
  retry?: BlRetryOptions
): Promise<BLInventoryProductsDataResponse> {
  return blRequest<BLInventoryProductsDataResponse>(
    "getInventoryProductsData",
    { inventory_id: inventoryId, products: productIds },
    retry
  );
}

// ============================================================
// Zamówienia
// ============================================================

export type BLOrderStatus = {
  id: number;
  name: string;
  name_for_customer: string;
  color: string;
};

export async function getOrderStatusList(): Promise<BLOrderStatus[]> {
  const res = await blRequest<{ statuses: BLOrderStatus[] }>("getOrderStatusList");
  return res.statuses ?? [];
}

// Pojedyncza pozycja w zamówieniu BL
export type BLOrderProduct = {
  storage?: string; // "db" lub "bl_xxx" (id magazynu BL)
  storage_id?: string | number;
  product_id?: string | number; // BL product id (jeśli mamy mapping)
  variant_id?: number;
  name: string;
  sku?: string;
  ean?: string;
  attributes?: string; // np. "Kolor: Beżowy, Strona: Lewa"
  price_brutto: number;
  tax_rate: number; // %
  quantity: number;
  weight?: number;
};

export type BLAddOrderInput = {
  order_status_id: number;
  date_add?: number; // unix timestamp
  currency?: string; // "PLN"
  payment_method?: string;
  payment_method_cod?: 0 | 1;
  paid?: 0 | 1;
  user_login?: string;
  phone?: string;
  email: string;
  user_comments?: string;
  admin_comments?: string;
  // Adres dostawy
  delivery_method?: string;
  delivery_price?: number;
  delivery_fullname?: string;
  delivery_company?: string;
  delivery_address?: string;
  delivery_postcode?: string;
  delivery_city?: string;
  delivery_state?: string;
  delivery_country_code?: string; // "PL"
  // Adres do faktury
  invoice_fullname?: string;
  invoice_company?: string;
  invoice_nip?: string;
  invoice_address?: string;
  invoice_postcode?: string;
  invoice_city?: string;
  invoice_state?: string;
  invoice_country_code?: string;
  want_invoice?: 0 | 1;
  // Pochodzenie zamówienia
  extra_field_1?: string;
  extra_field_2?: string;
  custom_source_id?: number;
  // Produkty
  products: BLOrderProduct[];
};

export async function addOrder(
  input: BLAddOrderInput
): Promise<{ order_id: number }> {
  const res = await blRequest<{ order_id: number }>(
    "addOrder",
    input as unknown as Record<string, unknown>
  );
  return res;
}
