"use client";

import { useState, useTransition } from "react";
import Image from "next/image";
import Link from "next/link";
import { setOrderIssueStatus, deleteOrderIssue } from "./actions";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { AdminOrderIssue } from "@/app/_lib/order-issues-data";
import type { OrderIssueStatus } from "@/app/_lib/order-issues";
import { orderIssueCategoryLabel } from "@/app/_lib/order-issues";

const STATUS_LABELS: Record<OrderIssueStatus, string> = {
  new: "Nowe",
  read: "Przeczytane",
  replied: "Odpowiedziane",
  closed: "Zamknięte",
};
const STATUS_COLORS: Record<OrderIssueStatus, string> = {
  new: "bg-[var(--color-gold)] text-[var(--color-navy)]",
  read: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  replied: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  closed: "bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400",
};

type Toast = { type: "success" | "error"; message: string } | null;

export default function ReklamacjeList({ initialIssues }: { initialIssues: AdminOrderIssue[] }) {
  const [issues, setIssues] = useState<AdminOrderIssue[]>(initialIssues);
  const [filter, setFilter] = useState<OrderIssueStatus | "all">("all");
  const [toast, setToast] = useState<Toast>(null);

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 3000);
  }

  const filtered = filter === "all" ? issues : issues.filter((i) => i.status === filter);
  const counts: Record<OrderIssueStatus | "all", number> = {
    all: issues.length,
    new: issues.filter((i) => i.status === "new").length,
    read: issues.filter((i) => i.status === "read").length,
    replied: issues.filter((i) => i.status === "replied").length,
    closed: issues.filter((i) => i.status === "closed").length,
  };

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">Mollien</p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Reklamacje</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Zgłoszenia problemów z zamówieniami wysłane przez klientów z poziomu konta. Zmień
          status po obsłudze, żeby śledzić co załatwione.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          data-toast-type={toast.type}
          className={`fixed top-24 right-6 z-50 max-w-sm px-5 py-3 rounded-xl shadow-2xl text-sm ${
            toast.type === "success" ? "bg-emerald-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.message}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(["all", "new", "read", "replied", "closed"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-4 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full border transition-colors ${
              filter === s
                ? "bg-[var(--color-navy)] text-white border-[var(--color-navy)]"
                : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            }`}
          >
            {s === "all" ? "Wszystkie" : STATUS_LABELS[s]} <span className="opacity-60">({counts[s]})</span>
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
          <p className="font-display text-lg">Brak reklamacji w tym filtrze</p>
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {filtered.map((issue) => (
            <Row
              key={issue.id}
              issue={issue}
              onChangeStatus={async (status) => {
                const fd = new FormData();
                fd.set("id", issue.id);
                fd.set("status", status);
                const res = await setOrderIssueStatus(fd);
                if (res.ok) {
                  showToast({ type: "success", message: res.message ?? "Zapisano" });
                  setIssues((prev) => prev.map((x) => (x.id === issue.id ? { ...x, status } : x)));
                } else showToast({ type: "error", message: res.error });
              }}
              onDelete={async () => {
                const fd = new FormData();
                fd.set("id", issue.id);
                const res = await deleteOrderIssue(fd);
                if (res.ok) {
                  showToast({ type: "success", message: res.message ?? "Usunięto" });
                  setIssues((prev) => prev.filter((x) => x.id !== issue.id));
                } else showToast({ type: "error", message: res.error });
              }}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function Row({
  issue,
  onChangeStatus,
  onDelete,
}: {
  issue: AdminOrderIssue;
  onChangeStatus: (s: OrderIssueStatus) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [pendingDelete, startDeleteTransition] = useTransition();
  const confirm = useConfirm();
  const date = new Date(issue.created_at).toLocaleString("pl-PL", { dateStyle: "medium", timeStyle: "short" });

  return (
    <li className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest rounded-full ${STATUS_COLORS[issue.status]}`}>
              {STATUS_LABELS[issue.status]}
            </span>
            <span className="px-2 py-0.5 text-[10px] font-sans font-bold uppercase tracking-widest rounded-full bg-[var(--bg)] border border-[var(--border)] text-[var(--fg)]">
              {orderIssueCategoryLabel(issue.category, "pl")}
            </span>
            <span className="text-xs text-[var(--muted)]">{date}</span>
          </div>
          <p className="font-display text-base font-semibold text-[var(--fg)]">
            <Link href={`/admin/zamowienia/${issue.order_id}`} className="hover:text-[var(--color-gold)]">
              Zamówienie {issue.order_number ? `#${issue.order_number}` : issue.order_id.slice(0, 8).toUpperCase()}
            </Link>
            {issue.item_name && <span className="text-[var(--muted)] font-normal"> · {issue.item_name}</span>}
            {!issue.item_name && <span className="text-[var(--muted)] font-normal"> · całe zamówienie</span>}
          </p>
          <p className="text-sm text-[var(--muted)] mt-0.5">
            Od: <strong className="text-[var(--fg)]">{issue.customer_name || "(brak imienia)"}</strong> ·{" "}
            <a href={`mailto:${issue.customer_email}`} className="text-[var(--color-gold)] hover:underline">
              {issue.customer_email}
            </a>
          </p>
        </div>
      </div>

      <p className="text-sm text-[var(--fg)] whitespace-pre-wrap leading-relaxed bg-[var(--bg)] border border-[var(--border)] rounded-xl p-3">
        {issue.message}
      </p>

      {issue.photos.length > 0 && (
        <ul className="grid grid-cols-5 gap-2">
          {issue.photos.map((url, i) => (
            <li key={url} className="relative aspect-square rounded-lg overflow-hidden border border-[var(--border)]">
              <a href={url} target="_blank" rel="noopener noreferrer">
                <Image src={url} alt={`Zdjęcie ${i + 1}`} fill sizes="120px" className="object-cover" />
              </a>
            </li>
          ))}
        </ul>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        <select
          value={issue.status}
          onChange={(e) => startTransition(() => onChangeStatus(e.target.value as OrderIssueStatus))}
          disabled={pending}
          className="px-3 py-1.5 text-xs font-sans bg-[var(--bg)] border border-[var(--border)] rounded-full text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] cursor-pointer disabled:opacity-50"
        >
          <option value="new">Nowe</option>
          <option value="read">Przeczytane</option>
          <option value="replied">Odpowiedziane</option>
          <option value="closed">Zamknięte</option>
        </select>
        <a
          href={`mailto:${issue.customer_email}?subject=${encodeURIComponent("Re: reklamacja zamówienia")}`}
          className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          Odpowiedz emailem
        </a>
        <button
          onClick={async () => {
            if (!(await confirm({ message: "Usunąć to zgłoszenie? Tej operacji nie da się cofnąć.", danger: true }))) return;
            startDeleteTransition(() => onDelete());
          }}
          disabled={pendingDelete}
          className="ml-auto px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
        >
          Usuń
        </button>
      </div>
    </li>
  );
}
