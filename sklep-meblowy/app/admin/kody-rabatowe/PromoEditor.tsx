"use client";

import { useState, useTransition } from "react";
import {
  createPromoCode,
  updatePromoCode,
  deletePromoCode,
  togglePromoActive,
  type ActionResult,
} from "./actions";
import type { PromoCode } from "@/app/_lib/promo";

type Toast = { type: "success" | "error"; message: string } | null;

export default function PromoEditor({ initialCodes }: { initialCodes: PromoCode[] }) {
  const [codes, setCodes] = useState<PromoCode[]>(initialCodes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handleResult(res: ActionResult, onSuccess?: () => void) {
    if (res.ok) {
      showToast({ type: "success", message: res.message ?? "Zapisano" });
      onSuccess?.();
    } else {
      showToast({ type: "error", message: res.error });
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Kody rabatowe</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Twórz kody rabatowe dla klientów. Klient wpisuje kod w koszyku — zniżka
            stosuje się do wartości produktów (przed dostawą).
          </p>
        </div>
        <button
          onClick={() => {
            setCreating(true);
            setEditingId(null);
          }}
          disabled={creating}
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          + Nowy kod
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creating && (
        <Card>
          <PromoForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (fd) => {
              const res = await createPromoCode(fd);
              handleResult(res, () => {
                setCreating(false);
                window.location.reload();
              });
            }}
          />
        </Card>
      )}

      {codes.length === 0 && !creating ? (
        <EmptyState message="Brak kodów. Dodaj pierwszy żeby zacząć." />
      ) : (
        <div className="flex flex-col gap-3">
          {codes.map((c) => (
            <Row
              key={c.id}
              code={c}
              expanded={editingId === c.id}
              onToggleExpand={() => setEditingId(editingId === c.id ? null : c.id)}
              onUpdate={async (fd) => {
                const res = await updatePromoCode(fd);
                handleResult(res, () => {
                  setEditingId(null);
                  window.location.reload();
                });
              }}
              onDelete={async () => {
                const fd = new FormData();
                fd.set("id", c.id);
                const res = await deletePromoCode(fd);
                handleResult(res, () => {
                  setCodes(codes.filter((x) => x.id !== c.id));
                });
              }}
              onToggleActive={async () => {
                const fd = new FormData();
                fd.set("id", c.id);
                fd.set("active", c.active ? "0" : "1");
                const res = await togglePromoActive(fd);
                handleResult(res, () => {
                  setCodes(codes.map((x) => (x.id === c.id ? { ...x, active: !x.active } : x)));
                });
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Row — pojedynczy kod
// ============================================================

function Row({
  code,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onToggleActive,
}: {
  code: PromoCode;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (fd: FormData) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [pendingToggle, startToggleTransition] = useTransition();

  const valueLabel =
    code.discount_type === "percent"
      ? `-${code.discount_value}%`
      : `-${code.discount_value.toFixed(2)} zł`;

  const usesLabel =
    code.max_uses !== null
      ? `${code.used_count}/${code.max_uses}`
      : `${code.used_count}`;

  const validity = formatValidity(code.valid_from, code.valid_to);

  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4 flex-wrap">
        <p className="font-mono text-base font-bold text-[var(--fg)]">{code.code}</p>
        <span className="px-2 py-0.5 bg-[var(--color-gold)] text-[var(--color-navy)] text-[10px] font-sans font-bold uppercase tracking-widest rounded-full">
          {valueLabel}
        </span>
        {!code.active && (
          <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-800 text-[var(--muted)] text-[10px] font-sans uppercase tracking-widest rounded-full">
            ukryty
          </span>
        )}
        {validity && (
          <span className="text-xs text-[var(--muted)]">{validity}</span>
        )}
        {code.min_order_value !== null && (
          <span className="text-xs text-[var(--muted)]">
            min. {code.min_order_value.toFixed(2)} zł
          </span>
        )}
        <span className="text-xs text-[var(--muted)] ml-auto">
          Użycia: <strong className="text-[var(--fg)]">{usesLabel}</strong>
        </span>

        <div className="flex items-center gap-2 ml-2">
          <button
            onClick={() => startToggleTransition(() => onToggleActive())}
            disabled={pendingToggle}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {code.active ? "Ukryj" : "Pokaż"}
          </button>
          <button
            onClick={onToggleExpand}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {expanded ? "Zwiń" : "Edytuj"}
          </button>
          <button
            onClick={() => {
              if (!window.confirm(`Usunąć kod "${code.code}"? Historyczne zamówienia zachowają audyt zniżki.`)) return;
              startDeleteTransition(() => onDelete());
            }}
            disabled={pendingDelete}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            Usuń
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--border)] p-5 bg-[var(--bg)]">
          <PromoForm mode="update" initial={code} onCancel={onToggleExpand} onSubmit={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Form
// ============================================================

function PromoForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: PromoCode;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [discountType, setDiscountType] = useState<"percent" | "fixed">(
    initial?.discount_type ?? "percent"
  );

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="grid grid-cols-1 md:grid-cols-2 gap-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <Field label="Kod" required hint="Litery A-Z, cyfry, '-' i '_'. Automatycznie zamieniany na duże." className="md:col-span-2">
        <input
          name="code"
          defaultValue={initial?.code ?? ""}
          required
          disabled={mode === "update"}
          maxLength={50}
          placeholder="np. MOLLIEN10"
          className={`${inputCls} font-mono uppercase`}
          style={mode === "update" ? { opacity: 0.6, cursor: "not-allowed" } : undefined}
        />
      </Field>
      {mode === "update" && (
        <p className="md:col-span-2 text-xs text-[var(--muted)] -mt-2">
          Kod jest niezmienny po utworzeniu (zachowuje zgodność z kodami rozdanymi klientom).
          Żeby zmienić — utwórz nowy i usuń stary.
        </p>
      )}

      <Field label="Typ zniżki" required>
        <select
          name="discount_type"
          value={discountType}
          onChange={(e) => setDiscountType(e.target.value as "percent" | "fixed")}
          className={inputCls}
        >
          <option value="percent">Procent (% od wartości koszyka)</option>
          <option value="fixed">Kwota stała (zł)</option>
        </select>
      </Field>

      <Field
        label={discountType === "percent" ? "Wartość (% — 1-100)" : "Wartość (zł)"}
        required
      >
        <input
          name="discount_value"
          type="number"
          step={discountType === "percent" ? "1" : "0.01"}
          min="0.01"
          max={discountType === "percent" ? "100" : undefined}
          defaultValue={initial?.discount_value ?? ""}
          required
          className={inputCls}
        />
      </Field>

      <Field label="Min. wartość koszyka (zł)" hint="Opcjonalne. Zostaw puste = bez minimum.">
        <input
          name="min_order_value"
          type="number"
          step="0.01"
          min="0"
          defaultValue={initial?.min_order_value ?? ""}
          placeholder="np. 500"
          className={inputCls}
        />
      </Field>

      <Field label="Limit użyć" hint="Opcjonalne. Po wyczerpaniu kod przestaje działać.">
        <input
          name="max_uses"
          type="number"
          min="1"
          step="1"
          defaultValue={initial?.max_uses ?? ""}
          placeholder="np. 100"
          className={inputCls}
        />
      </Field>

      <Field label="Ważny od" hint="Opcjonalne.">
        <input
          name="valid_from"
          type="datetime-local"
          defaultValue={toDateTimeLocal(initial?.valid_from)}
          className={inputCls}
        />
      </Field>

      <Field label="Ważny do" hint="Opcjonalne.">
        <input
          name="valid_to"
          type="datetime-local"
          defaultValue={toDateTimeLocal(initial?.valid_to)}
          className={inputCls}
        />
      </Field>

      <label className="md:col-span-2 flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
        <input
          type="checkbox"
          name="active"
          value="1"
          defaultChecked={initial?.active ?? true}
          className="h-4 w-4 accent-[var(--color-gold)]"
        />
        <span>Kod aktywny (klienci mogą go używać)</span>
      </label>

      <div className="md:col-span-2 flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : mode === "create" ? "Utwórz kod" : "Zapisz zmiany"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-5 py-2.5 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Helpers / małe komponenty
// ============================================================

const inputCls =
  "w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]";

function Field({
  label,
  hint,
  required,
  className,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-1.5 ${className ?? ""}`}>
      <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        {label}
        {required && <span className="text-red-500 ml-1">*</span>}
      </span>
      {children}
      {hint && <span className="text-xs text-[var(--muted)] leading-snug">{hint}</span>}
    </label>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
      {children}
    </div>
  );
}

function ToastView({ toast, onClose }: { toast: NonNullable<Toast>; onClose: () => void }) {
  return (
    <div
      role="status"
      className={`fixed top-24 right-6 z-50 max-w-sm px-5 py-4 rounded-2xl shadow-2xl border ${
        toast.type === "success"
          ? "bg-emerald-50 dark:bg-emerald-950 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
          : "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-900 text-red-800 dark:text-red-200"
      }`}
    >
      <div className="flex items-start gap-3">
        <p className="text-sm flex-1">{toast.message}</p>
        <button onClick={onClose} aria-label="Zamknij" className="shrink-0 opacity-70 hover:opacity-100">
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-16 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
      <p className="font-display text-lg">{message}</p>
    </div>
  );
}

function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatValidity(from: string | null, to: string | null): string | null {
  if (!from && !to) return null;
  const now = Date.now();
  const fromMs = from ? new Date(from).getTime() : null;
  const toMs = to ? new Date(to).getTime() : null;

  if (fromMs && now < fromMs) {
    return `Od ${new Date(fromMs).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}`;
  }
  if (toMs && now > toMs) {
    return `Wygasł ${new Date(toMs).toLocaleString("pl-PL", { dateStyle: "short" })}`;
  }
  if (toMs) {
    return `Do ${new Date(toMs).toLocaleString("pl-PL", { dateStyle: "short" })}`;
  }
  return null;
}
