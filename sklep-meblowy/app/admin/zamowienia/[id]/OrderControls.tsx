"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { ADMIN_STATUS_LABELS } from "@/app/_lib/order-status";
import {
  updateOrderStatus,
  updateOrderFulfillment,
  updateOrderNote,
  deleteOrder,
  type ActionResult,
} from "../actions";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { OrderStatus } from "@/app/_lib/types";

type Props = {
  orderId: string;
  orderNumber: number;
  allowedStatuses: OrderStatus[];
  carrier: string | null;
  trackingNumber: string | null;
  deliveryCost: number | null;
  deliveryPaid: boolean;
  adminNote: string | null;
};

export default function OrderControls(props: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const [selected, setSelected] = useState<OrderStatus | "">("");
  const confirm = useConfirm();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handle(res: ActionResult) {
    if (res.ok) {
      showToast({ type: "success", message: res.message ?? "Zapisano" });
      router.refresh();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Status */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Status zamówienia</h3>
        {props.allowedStatuses.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">
            Stan końcowy — brak dalszych zmian statusu.
          </p>
        ) : (
          <div className="flex flex-col sm:flex-row gap-2">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value as OrderStatus | "")}
              className={`${inputCls} sm:w-64`}
            >
              <option value="">— wybierz nowy status —</option>
              {props.allowedStatuses.map((s) => (
                <option key={s} value={s}>
                  {ADMIN_STATUS_LABELS[s].label}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={!selected || isPending}
              onClick={() => {
                if (!selected) return;
                startTransition(async () => {
                  handle(await updateOrderStatus(props.orderId, selected));
                  setSelected("");
                });
              }}
              className="shrink-0 px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
            >
              Zmień status
            </button>
          </div>
        )}
      </Card>

      {/* Dostawa */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Dostawa</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("orderId", props.orderId);
            startTransition(async () => handle(await updateOrderFulfillment(fd)));
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Przewoźnik">
            <input name="carrier" defaultValue={props.carrier ?? ""} className={inputCls} placeholder="np. DPD, własny transport" />
          </Field>
          <Field label="Numer śledzenia">
            <input name="tracking_number" defaultValue={props.trackingNumber ?? ""} className={inputCls} />
          </Field>
          <Field label="Koszt dostawy (zł)">
            <input
              name="delivery_cost"
              type="number"
              step="0.01"
              min="0"
              defaultValue={props.deliveryCost ?? ""}
              className={inputCls}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-[var(--fg)]">
            <input type="checkbox" name="delivery_paid" value="1" defaultChecked={props.deliveryPaid} />
            Dostawa opłacona
          </label>
          <button
            type="submit"
            disabled={isPending}
            className="self-start px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            Zapisz dostawę
          </button>
        </form>
      </Card>

      {/* Notatka */}
      <Card>
        <h3 className="font-display text-lg font-bold text-[var(--fg)] mb-4">Notatka wewnętrzna</h3>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            fd.set("orderId", props.orderId);
            startTransition(async () => handle(await updateOrderNote(fd)));
          }}
          className="flex flex-col gap-3"
        >
          <textarea
            name="admin_note"
            defaultValue={props.adminNote ?? ""}
            rows={4}
            className={inputCls}
            placeholder="Widoczne tylko dla admina"
          />
          <button
            type="submit"
            disabled={isPending}
            className="self-start px-5 py-2 bg-[var(--color-navy)] text-white font-sans text-sm uppercase tracking-widest rounded-lg hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            Zapisz notatkę
          </button>
        </form>
      </Card>

      {/* Strefa niebezpieczna — trwałe usunięcie */}
      <Card>
        <h3 className="font-display text-lg font-bold text-red-600 dark:text-red-400 mb-2">
          Usuń zamówienie
        </h3>
        <p className="text-sm text-[var(--muted)] mb-4">
          Trwale usuwa zamówienie wraz z pozycjami. Operacji nie da się cofnąć —
          zamówienie zniknie z historii i raportów. Do zwykłego odwołania użyj
          statusu „Anulowane”.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={async () => {
            const ok = await confirm({
              message:
                `Usunąć trwale zamówienie #${props.orderNumber}?\n\n` +
                "Tej operacji nie da się cofnąć — zniknie z historii wraz z pozycjami.",
              danger: true,
            });
            if (!ok) return;
            startTransition(async () => {
              const res = await deleteOrder(props.orderId);
              if (res.ok) {
                router.push("/admin/zamowienia");
              } else {
                showToast({ type: "error", message: res.error });
              }
            });
          }}
          className="self-start px-5 py-2 text-sm font-sans uppercase tracking-widest text-red-600 dark:text-red-400 border border-red-300 dark:border-red-800 rounded-lg hover:bg-red-600 hover:text-white hover:border-red-600 transition-colors disabled:opacity-50"
        >
          {isPending ? "Usuwam…" : "Usuń zamówienie"}
        </button>
      </Card>
    </div>
  );
}
