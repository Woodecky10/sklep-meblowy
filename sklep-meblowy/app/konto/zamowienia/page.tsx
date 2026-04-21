import Link from "next/link";
import { createClient } from "@/app/_lib/supabase/server";
import { getUserOrders } from "@/app/_lib/orders";

export const metadata = { title: "Zamówienia — MeblePremium" };

const statusLabels: Record<string, { label: string; className: string }> = {
  pending: { label: "Oczekuje", className: "text-amber-700 bg-amber-100 dark:bg-amber-950 dark:text-amber-300" },
  paid: { label: "Opłacone", className: "text-green-700 bg-green-100 dark:bg-green-950 dark:text-green-300" },
  processing: { label: "W realizacji", className: "text-blue-700 bg-blue-100 dark:bg-blue-950 dark:text-blue-300" },
  shipped: { label: "Wysłane", className: "text-indigo-700 bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300" },
  delivered: { label: "Dostarczone", className: "text-emerald-700 bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300" },
  cancelled: { label: "Anulowane", className: "text-red-700 bg-red-100 dark:bg-red-950 dark:text-red-300" },
};

export default async function OrdersPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orders = await getUserOrders(user!.id);

  if (orders.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-12 text-center">
        <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-3">
          Brak zamówień
        </h2>
        <p className="text-[var(--muted)] mb-6">
          Nie masz jeszcze żadnych zamówień.
        </p>
        <Link
          href="/sklep"
          className="inline-flex px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Zacznij zakupy
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-2">
        Twoje zamówienia
      </h2>

      {orders.map((order) => {
        const status = statusLabels[order.status] ?? statusLabels.pending;
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
      })}
    </div>
  );
}
