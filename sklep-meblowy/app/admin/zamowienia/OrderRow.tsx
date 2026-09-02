"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";

// Wiersz listy zamówień. Cały wiersz klikalny (router.push), plus wyraźny link
// „Zarządzaj →" w ostatniej kolumnie i klasyczny link numeru — oba jako <Link>
// (dostępne z klawiatury). Strona serwerowa przekazuje gotowe prymitywy.
export default function OrderRow({
  id,
  orderNumber,
  dateLabel,
  customerName,
  customerEmail,
  productsLabel,
  productsFull,
  statusLabel,
  statusClassName,
  amountLabel,
  deliveryPaid,
  cod,
  source,
}: {
  id: string;
  orderNumber: number;
  dateLabel: string;
  customerName: string | null;
  customerEmail: string | null;
  productsLabel: string;
  productsFull: string;
  statusLabel: string;
  statusClassName: string;
  amountLabel: string;
  deliveryPaid: boolean;
  cod: boolean;
  source: string | null;
}) {
  const router = useRouter();
  const href = `/admin/zamowienia/${id}`;

  return (
    <tr
      onClick={() => router.push(href)}
      className="border-b border-[var(--border)] last:border-0 hover:bg-[var(--bg)] transition-colors cursor-pointer"
    >
      <td className="px-4 py-3">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="font-mono font-semibold text-[var(--color-gold)] hover:underline"
        >
          #{orderNumber}
        </Link>
      </td>
      <td className="px-4 py-3 text-[var(--muted)] whitespace-nowrap">{dateLabel}</td>
      <td className="px-4 py-3">
        <span className="text-[var(--fg)]">{customerName ?? "—"}</span>
        {customerEmail && (
          <span className="block text-xs text-[var(--muted)]">{customerEmail}</span>
        )}
      </td>
      <td className="px-4 py-3 max-w-[240px]">
        <span className="block truncate text-[var(--fg)]" title={productsFull}>
          {productsLabel}
        </span>
      </td>
      <td className="px-4 py-3">
        <span
          className={`px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest ${statusClassName}`}
        >
          {statusLabel}
        </span>
        {cod && (
          <span
            className="ml-1.5 px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest text-yellow-800 bg-yellow-100 dark:bg-yellow-950 dark:text-yellow-300"
            title="Płatność przy odbiorze — kurier pobiera gotówkę"
          >
            Pobranie
          </span>
        )}
        {source && (
          <span
            className="ml-1.5 px-2.5 py-1 rounded-full text-xs font-sans uppercase tracking-widest text-sky-800 bg-sky-100 dark:bg-sky-950 dark:text-sky-300"
            title={`Zamówienie spoza sklepu: ${source}`}
          >
            {source}
          </span>
        )}
      </td>
      <td className="px-4 py-3 text-right font-semibold text-[var(--fg)] whitespace-nowrap">
        {amountLabel}
      </td>
      <td className="px-4 py-3 text-center">
        {deliveryPaid ? (
          <span className="text-emerald-600" title="Dostawa opłacona">
            ✓
          </span>
        ) : (
          <span className="text-[var(--muted)]">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right whitespace-nowrap">
        <Link
          href={href}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] border border-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          Zarządzaj →
        </Link>
      </td>
    </tr>
  );
}
