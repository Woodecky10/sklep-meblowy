import Link from "next/link";
import { createClient } from "@/app/_lib/supabase/server";
import { getUserOrders } from "@/app/_lib/orders";
import OrdersList from "./OrdersList";

export const metadata = { title: "Zamówienia — Mollien" };

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

  return <OrdersList orders={orders} />;
}
