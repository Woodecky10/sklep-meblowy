"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { Order, OrderItem, OrderStatus } from "@/app/_lib/types";

const STATUS_LABELS: Record<OrderStatus, { label: string; className: string }> = {
  pending: { label: "Oczekuje", className: "text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Opłacone", className: "text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300" },
  processing: { label: "W realizacji", className: "text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  shipped: { label: "Wysłane", className: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300" },
  delivered: { label: "Dostarczone", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Anulowane", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300" },
};

const FILTER_ORDER: (OrderStatus | "all")[] = [
  "all",
  "pending",
  "paid",
  "processing",
  "shipped",
  "delivered",
  "cancelled",
];

export default function OrdersList({
  orders,
}: {
  orders: (Order & { items: OrderItem[] })[];
}) {
  const [filter, setFilter] = useState<OrderStatus | "all">("all");

  const counts = useMemo(() => {
    const result: Record<OrderStatus | "all", number> = {
      all: orders.length,
      pending: 0,
      paid: 0,
      processing: 0,
      shipped: 0,
      delivered: 0,
      cancelled: 0,
    };
    for (const o of orders) result[o.status] = (result[o.status] ?? 0) + 1;
    return result;
  }, [orders]);

  const filtered =
    filter === "all" ? orders : orders.filter((o) => o.status === filter);

  // Ukrywamy filtry które mają 0 zamówień (oprócz "all") — żeby na małym
  // koncie nie pokazywać 6 chipów z których 5 ma (0).
  const visibleFilters = FILTER_ORDER.filter(
    (s) => s === "all" || counts[s] > 0
  );

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-2">
        Twoje zamówienia
      </h2>

      {visibleFilters.length > 1 && (
        <div className="flex flex-wrap items-center gap-2">
          {visibleFilters.map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-4 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full border transition-colors ${
                filter === s
                  ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              }`}
            >
              {s === "all" ? "Wszystkie" : STATUS_LABELS[s].label}{" "}
              <span className="opacity-60">({counts[s]})</span>
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-[var(--card-bg)] border border-dashed border-[var(--border)] rounded-2xl p-10 text-center text-[var(--muted)]">
          Brak zamówień w tym filtrze.
        </div>
      ) : (
        filtered.map((order) => {
          const status = STATUS_LABELS[order.status] ?? STATUS_LABELS.pending;
          const itemsCount =
            order.items?.reduce((s, i) => s + i.quantity, 0) ?? 0;
          return (
            <Link
              key={order.id}
              href={`/konto/zamowienia/${order.id}`}
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 hover:border-[var(--color-gold)] transition-colors flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6"
            >
              <div className="flex-1 min-w-0">
                <p className="font-mono text-sm text-[var(--muted)] mb-1">
                  #{order.id.slice(0, 8).toUpperCase()}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {new Date(order.created_at).toLocaleDateString("pl-PL", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {" · "}
                  {itemsCount} {itemsCount === 1 ? "pozycja" : "pozycji"}
                </p>
              </div>

              <span
                className={`px-3 py-1 rounded-full text-xs font-sans uppercase tracking-widest ${status.className}`}
              >
                {status.label}
              </span>

              <p className="font-display text-lg font-bold text-[var(--fg)] whitespace-nowrap">
                {Number(order.total).toLocaleString("pl-PL")} zł
              </p>
            </Link>
          );
        })
      )}
    </div>
  );
}
