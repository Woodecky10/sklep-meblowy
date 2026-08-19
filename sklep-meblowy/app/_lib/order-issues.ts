// Czysta logika reklamacji (order_issues) — bez zależności server-only, testowalne.
// Server-owa warstwa danych jest w order-issues-data.ts; akcje w konto/zamowienia/actions.ts.
import { formatVariantLabel } from "./variants";

export type OrderIssueStatus = "new" | "read" | "replied" | "closed";
export type OrderIssueCategory = "damage" | "missing" | "wrong" | "delivery" | "other";

export const ORDER_ISSUE_CATEGORIES: OrderIssueCategory[] = [
  "damage",
  "missing",
  "wrong",
  "delivery",
  "other",
];

export type OrderIssue = {
  id: string;
  order_id: string;
  order_item_id: string | null;
  category: OrderIssueCategory;
  message: string;
  photos: string[];
  status: OrderIssueStatus;
  customer_name: string | null;
  customer_email: string;
  created_at: string;
  updated_at: string;
};

const CATEGORY_LABELS: Record<OrderIssueCategory, { pl: string; de: string }> = {
  damage: { pl: "Uszkodzenie / wada", de: "Beschädigung / Mangel" },
  missing: { pl: "Brak elementu", de: "Fehlendes Teil" },
  wrong: { pl: "Otrzymano zły produkt", de: "Falsches Produkt erhalten" },
  delivery: { pl: "Problem z dostawą", de: "Lieferproblem" },
  other: { pl: "Inne", de: "Sonstiges" },
};

// Etykieta kategorii wg locale; nieznana wartość przechodzi bez zmian.
export function orderIssueCategoryLabel(category: string, locale: "pl" | "de"): string {
  const c = CATEGORY_LABELS[category as OrderIssueCategory];
  return c ? c[locale] : category;
}

// Etykieta pozycji zamówienia do selecta w modalu (nazwa + ewentualny wariant).
export function orderItemLabel(
  productName: string,
  variantValues: Record<string, string> | null,
  locale: "pl" | "de"
): string {
  if (!variantValues || Object.keys(variantValues).length === 0) return productName;
  return `${productName} — ${formatVariantLabel(variantValues, locale)}`;
}

export type OrderIssueInput = {
  category: string;
  message: string;
  photos: string[];
  orderItemId: string | null;
};

export type OrderIssueValidation =
  | {
      ok: true;
      value: { category: OrderIssueCategory; message: string; photos: string[]; orderItemId: string | null };
    }
  | { ok: false; error: "category" | "message" | "photos" };

// Czy URL zdjęcia pochodzi z naszego Storage (anti-injection w zgłoszeniach).
// supabaseUrl = NEXT_PUBLIC_SUPABASE_URL (przekazywane przez wołającego server-side).
//
// Sam prefiks NIE wystarcza: segmenty `..` normalizują się dopiero przy
// PARSOWANIU adresu, czyli PO tej walidacji, więc
// `order-issues/../opinie/<plik>.jpg` przechodziło bramkę i wskazywało plik
// spoza katalogu reklamacji. Dlatego sprawdzamy RESZTĘ adresu ciasnym wzorcem:
// nazwy generujemy sami (`${Date.now()}-${randomUUID()}.${ext}`), więc niczego
// prawidłowego nie odcina. Brak `/` blokuje wyjście z katalogu, a brak `%` —
// to samo wyjście zakodowane procentowo (`%2e%2e`, `%2f`). NIE upraszczaj go
// z powrotem do samego startsWith. Ta sama poprawka jest w reviews-photos.ts.
const NAZWA_PLIKU_RE = /^[A-Za-z0-9._-]+$/;

export function isOwnIssuePhotoUrl(url: string, supabaseUrl: string): boolean {
  if (!supabaseUrl) return false;
  if (typeof url !== "string") return false;
  const prefix = `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/products/order-issues/`;
  if (!url.startsWith(prefix)) return false;
  return NAZWA_PLIKU_RE.test(url.slice(prefix.length));
}

// Czysta walidacja payloadu zgłoszenia (używana przez submitOrderIssue + testy).
export function validateOrderIssueInput(input: OrderIssueInput): OrderIssueValidation {
  if (!ORDER_ISSUE_CATEGORIES.includes(input.category as OrderIssueCategory)) {
    return { ok: false, error: "category" };
  }
  const message = (input.message ?? "").trim();
  if (message.length < 5) return { ok: false, error: "message" };
  if (!Array.isArray(input.photos) || input.photos.length > 5) return { ok: false, error: "photos" };
  if (input.photos.some((p) => typeof p !== "string" || !p)) return { ok: false, error: "photos" };
  return {
    ok: true,
    value: {
      category: input.category as OrderIssueCategory,
      message: message.slice(0, 2000),
      photos: input.photos,
      orderItemId: input.orderItemId || null,
    },
  };
}
