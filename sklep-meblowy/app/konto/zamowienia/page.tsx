import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { createClient } from "@/app/_lib/supabase/server";
import { getLocale } from "@/app/_lib/i18n-server";
import { getUserOrders } from "@/app/_lib/orders";
import OrdersList from "./OrdersList";

export async function generateMetadata() {
  const locale = await getLocale();
  const de = locale === "de";
  return { title: de ? "Bestellungen" : "Zamówienia" };
}

export default async function OrdersPage() {
  const locale = await getLocale();
  const de = locale === "de";
  const c = de
    ? {
        empty: "Keine Bestellungen",
        emptyDesc: "Sie haben noch keine Bestellungen.",
        startShopping: "Einkauf starten",
      }
    : {
        empty: "Brak zamówień",
        emptyDesc: "Nie masz jeszcze żadnych zamówień.",
        startShopping: "Zacznij zakupy",
      };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const orders = await getUserOrders(user!.id);

  if (orders.length === 0) {
    return (
      <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-12 text-center">
        <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-3">
          {c.empty}
        </h2>
        <p className="text-[var(--muted)] mb-6">
          {c.emptyDesc}
        </p>
        <LocalizedLink
          href="/sklep"
          className="inline-flex px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          {c.startShopping}
        </LocalizedLink>
      </div>
    );
  }

  return <OrdersList orders={orders} />;
}
