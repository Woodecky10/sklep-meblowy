"use client";

import { useState } from "react";
import { type SyncLogRow } from "./actions";
import type {
  SyncInventoryResult,
  SyncSkippedProduct,
  SyncedProduct,
} from "@/app/_lib/baselinker-sync";

export default function BaseLinkerSyncPanel({
  initialLogs,
  pendingTranslations,
}: {
  initialLogs: SyncLogRow[];
  pendingTranslations: number;
}) {
  const logs = initialLogs;
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          BaseLinker (archiwum)
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl leading-relaxed">
          Synchronizacja produktów z BaseLinkera została wyłączona — produkty
          dodaje się teraz bezpośrednio w sklepie (Admin → Produkty → Nowy
          produkt). Poniżej zostaje archiwalna historia dawnych synchronizacji.
        </p>
      </div>

      {/* Tłumaczenia DE — licznik zaległych (tłumaczenie ręczne w edytorze produktu) */}
      <Card>
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--fg)] mb-1">
            Tłumaczenia niemieckie (DE)
          </h2>
          <p className="text-sm text-[var(--muted)] leading-relaxed max-w-xl">
            Nowe i zmienione produkty wymagają ręcznego tłumaczenia DE — wpisz je
            w edytorze produktu, sekcja {"„Tłumaczenie niemieckie (DE)”"}.
          </p>
          <p className="text-sm text-[var(--fg)] mt-3">
            Czeka na tłumaczenie:{" "}
            <strong
              className={
                pendingTranslations > 0
                  ? "text-amber-700 dark:text-amber-300"
                  : "text-emerald-700 dark:text-emerald-300"
              }
            >
              {pendingTranslations}{" "}
              {pendingTranslations === 1 ? "produkt" : "produktów"}
            </strong>
          </p>
        </div>
      </Card>

      {/* Archiwalna historia synchronizacji */}
      <div>
        <h2 className="font-display text-2xl font-semibold text-[var(--fg)] mb-4">
          Historia synchronizacji (archiwum)
        </h2>

        {logs.length === 0 ? (
          <EmptyState message="Brak synchronizacji w historii." />
        ) : (
          <div className="flex flex-col gap-2">
            {logs.map((log) => (
              <LogRow
                key={log.id}
                log={log}
                expanded={expandedLogId === log.id}
                onToggle={() =>
                  setExpandedLogId(expandedLogId === log.id ? null : log.id)
                }
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function InventoryResult({ inv }: { inv: SyncInventoryResult }) {
  const [showAllSkipped, setShowAllSkipped] = useState(false);

  // Stare logi w DB nie miały inserted_products/updated_products. Bezpieczny
  // fallback to pusta lista — pokażemy tylko liczbę bez nazw.
  const insertedProducts = inv.inserted_products ?? [];
  const updatedProducts = inv.updated_products ?? [];

  return (
    <div className="border border-[var(--border)] rounded-xl p-4">
      <p className="font-sans text-sm font-semibold text-[var(--fg)] mb-2">
        Magazyn: {inv.inventory_name}
      </p>
      <p className="text-xs text-[var(--muted)] mb-3">
        {inv.total_in_bl} produktów · {inv.inserted} nowych · {inv.updated} zaktualizowanych
        {inv.skipped.length > 0 && ` · ${inv.skipped.length} pominiętych`}
      </p>

      {insertedProducts.length > 0 && (
        <ProductList
          label="Nowe produkty"
          products={insertedProducts}
          variant="success"
        />
      )}

      {updatedProducts.length > 0 && (
        <ProductList
          label="Zaktualizowane produkty"
          products={updatedProducts}
          variant="info"
        />
      )}

      {inv.skipped.length > 0 && (
        <div className="mt-3 space-y-3">
          {(() => {
            const technical = inv.skipped.filter((s) => s.kind === "technical");
            const owner = inv.skipped.filter((s) => s.kind !== "technical");
            return (
              <>
                {owner.length > 0 && (
                  <div>
                    <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
                      Do poprawienia w BaseLinkerze ({owner.length}):
                    </p>
                    <div className="flex flex-col gap-2">
                      {(showAllSkipped ? owner : owner.slice(0, 5)).map((s) => (
                        <SkippedRow key={s.id} skipped={s} />
                      ))}
                    </div>
                  </div>
                )}
                {technical.length > 0 && (
                  <div>
                    <p className="text-xs font-sans uppercase tracking-widest text-red-700 dark:text-red-400 mb-2">
                      Błąd techniczny — zgłoś Mikołajowi ({technical.length}):
                    </p>
                    <div className="flex flex-col gap-2">
                      {technical.map((s) => (
                        <SkippedRow key={s.id} skipped={s} />
                      ))}
                    </div>
                  </div>
                )}
                {owner.length > 5 && (
                  <button
                    onClick={() => setShowAllSkipped(!showAllSkipped)}
                    className="text-xs text-[var(--color-gold)] hover:underline"
                  >
                    {showAllSkipped
                      ? "Pokaż mniej"
                      : `Pokaż wszystkie (${owner.length - 5} więcej)`}
                  </button>
                )}
              </>
            );
          })()}
        </div>
      )}

    </div>
  );
}

// Lista nazw zsynchronizowanych produktów (dodane/zaktualizowane).
// Domyślnie pokazuje pierwsze 5, z opcją "Pokaż wszystkie".
function ProductList({
  label,
  products,
  variant,
}: {
  label: string;
  products: SyncedProduct[];
  variant: "success" | "info";
}) {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? products : products.slice(0, 5);
  const badgeColors = {
    success: "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200",
    info: "bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-200",
  };
  return (
    <div className="mt-3">
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
        {label} ({products.length}):
      </p>
      <div className="flex flex-col gap-1.5">
        {visible.map((p) => (
          <div
            key={p.id}
            className="flex items-start gap-3 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg"
          >
            <span
              className={`px-2 py-0.5 text-[10px] font-sans rounded shrink-0 mt-0.5 ${badgeColors[variant]}`}
            >
              BL: {p.id}
            </span>
            <p className="text-sm text-[var(--fg)] truncate flex-1 min-w-0">
              {p.name}
            </p>
          </div>
        ))}
      </div>
      {products.length > 5 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-[var(--color-gold)] hover:underline"
        >
          {showAll
            ? "Pokaż mniej"
            : `Pokaż wszystkie (${products.length - 5} więcej)`}
        </button>
      )}
    </div>
  );
}

function SkippedRow({ skipped }: { skipped: SyncSkippedProduct }) {
  return (
    <div className="flex items-start gap-3 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg">
      <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-[10px] font-sans rounded shrink-0 mt-0.5">
        BL: {skipped.id}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-[var(--fg)] truncate">{skipped.name}</p>
        <p className="text-xs text-[var(--muted)] leading-snug">{skipped.reason}</p>
      </div>
    </div>
  );
}

type SyncReportData = {
  deactivated?: { id: string; name: string }[];
  reactivated?: { id: string; name: string }[];
  hide_skipped_reason?: string | null;
  unmapped_categories?: {
    bl_category_id: number;
    sample_product_name: string;
    count: number;
  }[];
};

function SyncReport({ report }: { report: SyncReportData }) {
  const deactivated = report.deactivated ?? [];
  const reactivated = report.reactivated ?? [];
  const unmapped = report.unmapped_categories ?? [];
  const hideSkipped = report.hide_skipped_reason ?? null;

  if (
    deactivated.length === 0 &&
    reactivated.length === 0 &&
    unmapped.length === 0 &&
    !hideSkipped
  ) {
    return null;
  }

  return (
    <div className="space-y-3">
      {unmapped.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl">
          <p className="font-sans text-sm font-semibold text-amber-900 dark:text-amber-200">
            ⚠️ {unmapped.reduce((s, c) => s + c.count, 0)} produkt(ów) nie trafiło do
            sklepu — brak mapowania kategorii BaseLinker
          </p>
          <ul className="mt-2 flex flex-col gap-1 text-xs text-amber-900 dark:text-amber-200">
            {unmapped.map((c) => (
              <li key={c.bl_category_id}>
                Kategoria BL <span className="font-mono">{c.bl_category_id}</span> ·{" "}
                {c.count} szt. · np. &bdquo;{c.sample_product_name}&rdquo;
              </li>
            ))}
          </ul>
          <a
            href="/admin/kategorie"
            className="mt-2 inline-block text-xs font-sans uppercase tracking-widest text-amber-900 dark:text-amber-200 underline"
          >
            Dodaj mapowanie → /admin/kategorie
          </a>
        </div>
      )}

      {hideSkipped && (
        <div className="p-3 bg-red-50 dark:bg-red-950/40 border border-red-300 dark:border-red-800 rounded-xl text-xs text-red-800 dark:text-red-300">
          Auto-ukrywanie wstrzymane: {hideSkipped}
        </div>
      )}

      {deactivated.length > 0 && (
        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Ukryto (znikły z BL) ({deactivated.length}):
          </p>
          <div className="flex flex-col gap-1.5">
            {deactivated.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg"
              >
                <span className="px-2 py-0.5 text-[10px] font-sans rounded shrink-0 mt-0.5 bg-stone-200 dark:bg-stone-800 text-stone-700 dark:text-stone-300">
                  BL: {p.id}
                </span>
                <p className="text-sm text-[var(--fg)] truncate flex-1 min-w-0">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {reactivated.length > 0 && (
        <div>
          <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Przywrócono (wróciły do BL) ({reactivated.length}):
          </p>
          <div className="flex flex-col gap-1.5">
            {reactivated.map((p) => (
              <div
                key={p.id}
                className="flex items-start gap-3 p-2 bg-[var(--bg)] border border-[var(--border)] rounded-lg"
              >
                <span className="px-2 py-0.5 text-[10px] font-sans rounded shrink-0 mt-0.5 bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-200">
                  BL: {p.id}
                </span>
                <p className="text-sm text-[var(--fg)] truncate flex-1 min-w-0">{p.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================
// Historia: wiersz logu z rozwijanym detalami
// ============================================================

function LogRow({
  log,
  expanded,
  onToggle,
}: {
  log: SyncLogRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const date = new Date(log.triggered_at);
  const formatted = date.toLocaleString("pl-PL", {
    dateStyle: "short",
    timeStyle: "medium",
  });

  // Z DB results to JSON; przy expand parsujemy.
  const results =
    log.results && typeof log.results === "object"
      ? (log.results as SyncInventoryResult[])
      : [];

  const report =
    log.report && typeof log.report === "object"
      ? (log.report as SyncReportData)
      : null;

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-3 p-4 text-left hover:bg-[var(--bg)] transition-colors"
      >
        <StatusBadge status={log.status} />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-sans font-medium text-[var(--fg)]">
            {formatted}
            {log.duration_ms !== null && (
              <span className="text-[var(--muted)] font-normal ml-2">
                ({(log.duration_ms / 1000).toFixed(1)}s)
              </span>
            )}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {log.total_in_bl} produktów ·{" "}
            <span className="text-emerald-700 dark:text-emerald-300">
              {log.inserted} nowych
            </span>{" "}
            ·{" "}
            <span className="text-blue-700 dark:text-blue-300">
              {log.updated} zaktualizowanych
            </span>
            {log.skipped_count > 0 && (
              <>
                {" "}
                ·{" "}
                <span className="text-amber-700 dark:text-amber-300">
                  {log.skipped_count} pominiętych
                </span>
              </>
            )}
            {log.triggered_by_email && (
              <span className="ml-2">· {log.triggered_by_email}</span>
            )}
          </p>
        </div>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`text-[var(--muted)] shrink-0 transition-transform ${expanded ? "rotate-180" : ""}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {expanded && (
        <div className="border-t border-[var(--border)] p-4 bg-[var(--bg)] space-y-3">
          {log.error_message && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-lg px-4 py-3 text-sm">
              <strong>Błąd:</strong> {log.error_message}
            </div>
          )}
          {results.length === 0 && !log.error_message && (
            <p className="text-sm text-[var(--muted)] italic">Brak szczegółowych danych.</p>
          )}
          {report && <SyncReport report={report} />}
          {results.map((inv) => (
            <InventoryResult key={inv.inventory_id} inv={inv} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Pomocnicze
// ============================================================

function StatusBadge({ status }: { status: SyncLogRow["status"] }) {
  const config = {
    success: {
      label: "OK",
      cls: "bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300",
    },
    partial: {
      label: "Częściowo",
      cls: "bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300",
    },
    error: {
      label: "Błąd",
      cls: "bg-red-100 dark:bg-red-950 text-red-700 dark:text-red-300",
    },
  }[status];
  return (
    <span
      className={`px-2.5 py-1 text-[10px] font-sans uppercase tracking-widest rounded-full shrink-0 ${config.cls}`}
    >
      {config.label}
    </span>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
      <p className="font-display text-base">{message}</p>
    </div>
  );
}

