import type { OrderStatus } from "./types";

// Oś postępu realizacji. `cancelled` jest poza osią — to boczny stan końcowy.
const PROGRESS_AXIS: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
];

const TERMINAL: OrderStatus[] = ["delivered", "cancelled"];

// Dozwolone RĘCZNE przejście statusu w panelu admina.
// - tylko do przodu po osi (skoki dozwolone, np. paid→delivered),
// - cancelled z każdego stanu poza delivered/cancelled,
// - nigdy powrót do pending, nigdy zmiana na ten sam status,
// - stany końcowe (delivered, cancelled) są zamknięte.
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (from === to) return false;
  if (TERMINAL.includes(from)) return false;
  if (to === "cancelled") return true;
  if (to === "pending") return false;
  const fi = PROGRESS_AXIS.indexOf(from);
  const ti = PROGRESS_AXIS.indexOf(to);
  if (fi < 0 || ti < 0) return false;
  return ti > fi;
}

const ALL_STATUSES: OrderStatus[] = [
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

// Lista statusów, na które admin może przejść z bieżącego (dla <select>).
export function nextStatuses(from: OrderStatus): OrderStatus[] {
  return ALL_STATUSES.filter((to) => canTransition(from, to));
}

// Etykiety + kolory dla panelu (PL). Klasy spójne z widokiem klienta.
export const ADMIN_STATUS_LABELS: Record<
  OrderStatus,
  { label: string; className: string }
> = {
  pending: { label: "Oczekuje na płatność", className: "text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Opłacone", className: "text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300" },
  processing: { label: "W realizacji", className: "text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  shipped: { label: "Wysłane", className: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300" },
  delivered: { label: "Dostarczone", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Anulowane", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300" },
};

// Etykieta statusu z uwzględnieniem źródła zamówienia. Zamówienie zewnętrzne
// (Allegro itp.) wpisane ręcznie startuje jako `paid`, ale pieniądze wziął
// marketplace, nie P24 — „Opłacone" bez dopisku sugerowałoby wpłatę, której
// w panelu Przelewy24 nie ma. Pozostałe statusy znaczą to samo dla obu.
export function adminStatusLabel(
  status: OrderStatus,
  source: string | null
): { label: string; className: string } {
  const base = ADMIN_STATUS_LABELS[status];
  if (status === "paid" && source !== null) return { ...base, label: "Opłacone (zewn.)" };
  return base;
}
