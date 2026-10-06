// Nazwa pozycji zamówienia do wyświetlenia. Moduł CZYSTY (bez server-only
// i bez bazy) — czytają go i strony serwerowe, i komponenty klientowe,
// i szablony maili.
//
// Od migracji 82 pozycja ma nazwę z DWÓCH możliwych źródeł:
// - `product.name` — pozycja z katalogu (join po `product_id`),
// - `custom_name` — pozycja spoza katalogu, wpisana ręcznie w panelu
//   (zamówienia zewnętrzne, zgłoszenie pracownicy 2026-09-09).

export type NamedOrderItem = {
  // `not null default ''` w bazie, więc pozycja z katalogu ma tu PUSTY STRING.
  // Opcjonalne w typie, bo `select("*")` na bazie bez tej kolumny (okno między
  // wdrożeniem kodu a ręczną aplikacją migracji 82) po prostu jej nie zwraca.
  custom_name?: string | null;
  product?: { name: string } | null;
};

export type OrderItemInput = {
  // null = pozycja spoza katalogu (migracja 82).
  product_id: string | null;
  quantity: number;
  price: number;
  variant_values?: Record<string, string> | null;
  notes?: string | null;
  bundle_id?: string | null;
  bundle_label?: string | null;
  custom_name?: string | null;
};

export type OrderItemRow = {
  order_id: string;
  product_id: string | null;
  quantity: number;
  price: number;
  variant_values: Record<string, string> | null;
  notes: string | null;
  bundle_id: string | null;
  bundle_label: string | null;
  // Brak klucza (we WSZYSTKICH wierszach naraz) tylko gdy żadna pozycja nie
  // jest spoza katalogu — patrz toOrderItemRows.
  custom_name?: string;
};

// Wiersze order_items o IDENTYCZNYM zestawie kluczy. postgrest-js przy
// insercie tablicy ustawia ?columns= na sumę kluczy wszystkich wierszy
// i brakujące wysyła jako NULL (defaultToNull) — DEFAULT kolumny NIE
// zadziała. custom_name jest NOT NULL (migracja 82), więc pozycja
// z katalogu musi mieć jawne "".
// Wyjątek: gdy ŻADNA pozycja nie ma custom_name (zwykłe zamówienie), klucza
// nie ma we wszystkich wierszach — baza bez migracji 82 odrzuciłaby nieznaną
// kolumnę (PGRST204) i zablokowała zwykłe zamówienia.
export function toOrderItemRows(items: OrderItemInput[], orderId: string): OrderItemRow[] {
  const withCustom = items.some((it) => !!it.custom_name);
  return items.map((it) => ({
    order_id: orderId,
    product_id: it.product_id ?? null,
    quantity: it.quantity,
    price: it.price,
    variant_values: it.variant_values ?? null,
    notes: it.notes ?? null,
    bundle_id: it.bundle_id ?? null,
    bundle_label: it.bundle_label ?? null,
    ...(withCustom ? { custom_name: it.custom_name ?? "" } : {}),
  }));
}

export function orderItemDisplayName(item: NamedOrderItem, fallback: string): string {
  // custom_name PIERWSZE: wiersz ma dokładnie jedno z dwóch źródeł nazwy, a gdy
  // ktoś kiedyś wpisze oba, ręczna nazwa jest tą, którą widziała pracownica.
  // `trim()` nie jest kosmetyką — pusty string to DOMYŚLNA wartość kolumny dla
  // KAŻDEJ pozycji z katalogu, więc branie go dosłownie skasowałoby nazwy
  // produktów w całej historii zamówień.
  const custom = item.custom_name?.trim();
  if (custom) return custom;
  const name = item.product?.name?.trim();
  if (name) return name;
  return fallback;
}
