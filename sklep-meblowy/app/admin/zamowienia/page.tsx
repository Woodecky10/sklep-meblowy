import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { getAdminOrders, getProfilesByIds } from "@/app/_lib/orders";
import { orderCustomerDisplay, orderItemsSummary } from "@/app/_lib/admin-orders";
import { adminStatusLabel } from "@/app/_lib/order-status";
import { formatOrderAmount } from "@/app/_lib/money";
import { EmptyState, inputCls } from "@/app/admin/_shared";
import Pagination from "@/app/_components/ui/Pagination";
import OrderRow from "./OrderRow";
import type { OrderStatus } from "@/app/_lib/types";

export const metadata = { title: "Zamówienia — Admin" };

type FilterValue = OrderStatus | "all" | "external";

const FILTERS: { value: FilterValue; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "external", label: "Zewnętrzne" },
  { value: "paid", label: "Opłacone" },
  { value: "processing", label: "W realizacji" },
  { value: "shipped", label: "Wysłane" },
  { value: "delivered", label: "Dostarczone" },
  { value: "cancelled", label: "Anulowane" },
  { value: "pending", label: "Oczekujące" },
];

type SearchParams = Promise<{ status?: string; q?: string; strona?: string }>;

export default async function AdminOrdersPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  await requireAdmin();
  const sp = await searchParams;
  // „external" jedzie w tym samym parametrze `status`, żeby linki filtrów i
  // paginacja nie musiały znać drugiego parametru. Dla zapytania to
  // status=all + source is not null.
  const filter = (FILTERS.some((f) => f.value === sp.status) ? sp.status : "all") as FilterValue;
  const external = filter === "external";
  const status: OrderStatus | "all" = external ? "all" : filter;
  const search = sp.q?.trim() || undefined;
  const page = Number(sp.strona ?? 1);

  const { orders, total, pages, page: currentPage } = await getAdminOrders({
    status,
    search,
    page,
    external,
  });
  const profiles = await getProfilesByIds(
    orders.map((o) => o.user_id).filter((id): id is string => !!id)
  );

  const rawParams: Record<string, string> = {};
  if (filter !== "all") rawParams.status = filter;
  if (search) rawParams.q = search;

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Zamówienia</h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          {total} {total === 1 ? "zamówienie" : "zamówień"}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        {/* Szukajka — natywny formularz GET (działa bez JS) */}
        <form action="/admin/zamowienia" data-guard-ignore className="flex gap-2 flex-1 min-w-[280px] max-w-lg">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <input
            name="q"
            defaultValue={search ?? ""}
            placeholder="Szukaj: numer, e-mail lub nazwisko"
            className={inputCls}
          />
          <button
            type="submit"
            className="shrink-0 px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors"
          >
            Szukaj
          </button>
        </form>
        <Link
          href="/admin/zamowienia/nowe"
          className="shrink-0 px-5 py-2 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          + Dodaj zamówienie
        </Link>
      </div>

      {/* Filtry statusu — linki z zachowaniem szukajki */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (f.value !== "all") params.set("status", f.value);
          if (search) params.set("q", search);
          const qs = params.toString();
          const href = `/admin/zamowienia${qs ? `?${qs}` : ""}`;
          const active = f.value === filter;
          return (
            <Link
              key={f.value}
              href={href}
              className={`px-4 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full border transition-colors ${
                active
                  ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                  : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
      </div>

      {orders.length === 0 ? (
        <EmptyState message="Brak zamówień w tym filtrze." />
      ) : (
        <div className="overflow-x-auto border border-[var(--border)] rounded-2xl bg-[var(--card-bg)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-[var(--muted)] border-b border-[var(--border)]">
                <th className="px-4 py-3">Nr</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3">Klient</th>
                <th className="px-4 py-3">Produkty</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Kwota</th>
                <th className="px-4 py-3 text-center">Dostawa</th>
                <th className="px-4 py-3 text-right">Akcja</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cust = orderCustomerDisplay(
                  o,
                  o.user_id ? profiles[o.user_id] ?? null : null
                );
                const s = adminStatusLabel(o.status, o.source);
                const products = orderItemsSummary(o.items ?? []);
                return (
                  <OrderRow
                    key={o.id}
                    id={o.id}
                    orderNumber={o.order_number}
                    dateLabel={new Date(o.created_at).toLocaleDateString("pl-PL", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                    })}
                    customerName={cust.name ?? null}
                    customerEmail={cust.email ?? null}
                    productsLabel={products.label}
                    productsFull={products.full}
                    statusLabel={s.label}
                    statusClassName={s.className}
                    amountLabel={formatOrderAmount(Number(o.total), o.currency)}
                    deliveryPaid={o.delivery_paid}
                    cod={o.payment_method === "cod"}
                    source={o.source}
                  />
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <Pagination
        page={currentPage}
        pages={pages}
        searchParams={rawParams}
        basePath="/admin/zamowienia"
      />
    </div>
  );
}
