import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { getAdminOrders, getProfilesByIds } from "@/app/_lib/orders";
import { orderCustomerDisplay } from "@/app/_lib/admin-orders";
import { ADMIN_STATUS_LABELS } from "@/app/_lib/order-status";
import { formatPrice } from "@/app/_lib/format";
import { EmptyState, inputCls } from "@/app/admin/_shared";
import Pagination from "@/app/_components/ui/Pagination";
import type { OrderStatus } from "@/app/_lib/types";

export const metadata = { title: "Zamówienia — Admin" };

const FILTERS: { value: OrderStatus | "all"; label: string }[] = [
  { value: "all", label: "Wszystkie" },
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
  const status = (FILTERS.some((f) => f.value === sp.status) ? sp.status : "all") as
    | OrderStatus
    | "all";
  const search = sp.q?.trim() || undefined;
  const page = Number(sp.strona ?? 1);

  const { orders, total, pages, page: currentPage } = await getAdminOrders({
    status,
    search,
    page,
  });
  const profiles = await getProfilesByIds(
    orders.map((o) => o.user_id).filter((id): id is string => !!id)
  );

  const rawParams: Record<string, string> = {};
  if (status !== "all") rawParams.status = status;
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

      {/* Szukajka — natywny formularz GET (działa bez JS) */}
      <form action="/admin/zamowienia" className="flex gap-2 max-w-lg">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
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

      {/* Filtry statusu — linki z zachowaniem szukajki */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const params = new URLSearchParams();
          if (f.value !== "all") params.set("status", f.value);
          if (search) params.set("q", search);
          const qs = params.toString();
          const href = `/admin/zamowienia${qs ? `?${qs}` : ""}`;
          const active = f.value === status;
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
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Kwota</th>
                <th className="px-4 py-3 text-center">Dostawa</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const cust = orderCustomerDisplay(
                  o,
                  o.user_id ? profiles[o.user_id] ?? null : null
                );
                const s = ADMIN_STATUS_LABELS[o.status];
                return (
                  <tr
                    key={o.id}
                    className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/admin/zamowienia/${o.id}`}
                        className="font-mono font-semibold text-[var(--color-gold)] hover:underline"
                      >
                        #{o.order_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">
                      {new Date(o.created_at).toLocaleDateString("pl-PL", {
                        day: "2-digit",
                        month: "2-digit",
                        year: "numeric",
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-[var(--fg)]">{cust.name ?? "—"}</span>
                      {cust.email && (
                        <span className="block text-xs text-[var(--muted)]">{cust.email}</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest ${s.className}`}
                      >
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-[var(--fg)] whitespace-nowrap">
                      {formatPrice(Number(o.total), "pl")}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {o.delivery_paid ? (
                        <span className="text-emerald-600" title="Dostawa opłacona">✓</span>
                      ) : (
                        <span className="text-[var(--muted)]">—</span>
                      )}
                    </td>
                  </tr>
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
