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

// Generyczne wywołanie metody BL.
export async function blRequest<T = unknown>(
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
    throw new Error(`BaseLinker HTTP ${res.status}`);
  }

  const data = (await res.json()) as BLResponse<T>;
  if (data.status === "ERROR") {
    throw new BaseLinkerError(method, data.error_code, data.error_message);
  }

  return data as T;
}

// ============================================================
// Typy odpowiedzi (tylko najczęstsze pola — BL ma ich więcej)
// ============================================================

export type BLInventory = {
  inventory_id: number;
  name: string;
  description: string;
  languages: string[];
  default_language: string;
  price_group_id: number;
  warehouses: string[];
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

export type BLInventoryProduct = {
  // Mapowane pola — BL zwraca dużo więcej, podajemy te które używamy
  id: string; // BL product id
  ean?: string;
  sku?: string;
  text_fields?: {
    name?: string;
    description?: string;
    description_extra1?: string;
    description_extra2?: string;
    description_extra3?: string;
    description_extra4?: string;
    [k: string]: string | undefined;
  };
  category_id?: number;
  prices?: Record<string, number>; // {price_group_id: price}
  weight?: number;
  height?: number;
  width?: number;
  length?: number;
  manufacturer_id?: number;
  images?: string[];
  features?: { name: string; value: string }[];
  variants?: unknown[];
  stock?: Record<string, number>;
};

export type BLInventoryProductsListResponse = {
  products: Record<string, BLInventoryProduct>; // klucz = id
};

// ============================================================
// Helpery — najczęstsze metody
// ============================================================

export async function getInventories(): Promise<BLInventory[]> {
  const res = await blRequest<BLInventoryListResponse>("getInventories");
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
  page = 1
): Promise<BLInventoryProductsListResponse> {
  return blRequest<BLInventoryProductsListResponse>(
    "getInventoryProductsList",
    { inventory_id: inventoryId, page }
  );
}

// Pełne dane produktów — bierzemy listę ID (max 1000 naraz)
export async function getInventoryProductsData(
  inventoryId: number,
  productIds: string[]
): Promise<BLInventoryProductsListResponse> {
  return blRequest<BLInventoryProductsListResponse>(
    "getInventoryProductsData",
    { inventory_id: inventoryId, products: productIds }
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
