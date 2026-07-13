"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Field, inputCls } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";
import {
  TRUST_ICONS,
  TRUST_ICON_KEYS,
  TRUST_ICON_LABELS,
  type TrustIconKey,
} from "@/app/_components/ui/trust-icons";
import type { TrustItemRow } from "@/app/_lib/trust-items";
import type { ActionResult } from "@/app/_lib/types";
import { pl } from "@/app/_lib/dictionaries/pl";
import {
  createTrustItem,
  updateTrustItem,
  deleteTrustItem,
  toggleTrustItemActive,
  reorderTrustItems,
} from "./actions";

// Teksty osadzone w ikonach — panel admina jest PL-only.
const ICON_TEXTS = pl.trustBar;

export default function TrustItemsEditor({
  initialItems,
  onResult,
}: {
  initialItems: TrustItemRow[];
  onResult: (r: ActionResult) => void;
}) {
  const [items, setItems] = useState(initialItems);
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (initialItems !== prevInitial) {
    setPrevInitial(initialItems);
    setItems(initialItems);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [, startTransition] = useTransition();
  const confirm = useConfirm();
  const router = useRouter();

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = items;
    setItems(next);
    startTransition(async () => {
      const res = await reorderTrustItems(next.map((i) => i.id));
      if (!res.ok) setItems(prev);
      onResult(res);
    });
  }

  function toggle(item: TrustItemRow) {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("active", item.active ? "0" : "1");
    startTransition(async () => {
      const res = await toggleTrustItemActive(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  async function remove(item: TrustItemRow) {
    const ok = await confirm({
      title: "Usunąć pozycję?",
      message: `Pozycja "${item.label}" zniknie z paska zaufania na całej stronie.`,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      const res = await deleteTrustItem(fd);
      onResult(res);
      if (res.ok) router.refresh();
    });
  }

  return (
    <div className="mt-6 pt-6 border-t border-[var(--border)] flex flex-col gap-4">
      <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
        Pozycje paska zaufania
      </p>

      {items.map((item, i) => (
        <div key={item.id} className="border border-[var(--border)] rounded-xl p-4">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-1">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Wyżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Niżej" className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
              </button>
            </div>

            {/* Miniatura ikony (rejestr rysuje 104px — skalujemy przez CSS) */}
            <span className="w-12 h-12 flex items-center justify-center text-[var(--fg)] [&_svg]:w-10 [&_svg]:h-10 shrink-0">
              {TRUST_ICONS[item.icon as TrustIconKey]?.(ICON_TEXTS)}
            </span>

            <div className="flex-1 min-w-0">
              <p className={`text-sm font-semibold ${item.active ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                {item.label}
              </p>
              {item.subline && <p className="text-xs text-[var(--muted)]">{item.subline}</p>}
            </div>

            <button type="button" onClick={() => toggle(item)} role="switch" aria-checked={item.active} aria-label={`Widoczność pozycji ${item.label}`} className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${item.active ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}>
              <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${item.active ? "left-[22px]" : "left-0.5"}`} />
            </button>
            <button type="button" onClick={() => setEditingId(editingId === item.id ? null : item.id)} className="text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline shrink-0">
              Edytuj
            </button>
            <button type="button" onClick={() => remove(item)} className="text-xs font-sans uppercase tracking-widest text-red-600 hover:underline shrink-0">
              Usuń
            </button>
          </div>

          {editingId === item.id && (
            <TrustItemForm
              mode="edit"
              item={item}
              onResult={(r) => {
                onResult(r);
                if (r.ok) {
                  setEditingId(null);
                  router.refresh();
                }
              }}
            />
          )}
        </div>
      ))}

      {creating ? (
        <div className="border border-dashed border-[var(--border)] rounded-xl p-4">
          <TrustItemForm
            mode="create"
            onResult={(r) => {
              onResult(r);
              if (r.ok) {
                setCreating(false);
                router.refresh();
              }
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setCreating(true)} className="self-start text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline">
          + Dodaj pozycję
        </button>
      )}
    </div>
  );
}

// Formularz pozycji: picker ikony (siatka), etykieta+dopiska PL/DE.
function TrustItemForm({
  mode,
  item,
  onResult,
}: {
  mode: "create" | "edit";
  item?: TrustItemRow;
  onResult: (r: ActionResult) => void;
}) {
  const [icon, setIcon] = useState<TrustIconKey>(
    (item?.icon as TrustIconKey) ?? "star"
  );
  const [saving, startSave] = useTransition();

  function submit(formData: FormData) {
    formData.set("icon", icon);
    if (mode === "edit" && item) formData.set("id", item.id);
    formData.set("active", mode === "edit" ? (item!.active ? "1" : "0") : "1");
    startSave(async () => {
      onResult(mode === "create" ? await createTrustItem(formData) : await updateTrustItem(formData));
    });
  }

  return (
    <form action={submit} className="mt-4 pt-4 border-t border-[var(--border)] flex flex-col gap-4" data-guard-section>
      <Field label="Ikona" required>
        <div className="grid grid-cols-5 gap-2">
          {TRUST_ICON_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setIcon(k)}
              title={TRUST_ICON_LABELS[k]}
              aria-pressed={icon === k}
              className={`flex flex-col items-center gap-1 p-2 rounded-xl border text-[var(--fg)] [&_svg]:w-10 [&_svg]:h-10 ${
                icon === k ? "border-[var(--color-gold)] bg-[var(--bg)]" : "border-[var(--border)]"
              }`}
            >
              {TRUST_ICONS[k](ICON_TEXTS)}
              <span className="text-[10px] text-[var(--muted)] leading-tight text-center">{TRUST_ICON_LABELS[k]}</span>
            </button>
          ))}
        </div>
      </Field>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Etykieta" required>
          <input name="label" defaultValue={item?.label ?? ""} required className={inputCls} />
        </Field>
        <Field label="Etykieta DE">
          <input name="label_de" defaultValue={item?.label_de ?? ""} className={inputCls} />
        </Field>
        <Field label="Dopiska (mała szara linijka)" hint="np. „na terenie całej Polski” — można zostawić puste">
          <input name="subline" defaultValue={item?.subline ?? ""} className={inputCls} />
        </Field>
        <Field label="Dopiska DE">
          <input name="subline_de" defaultValue={item?.subline_de ?? ""} className={inputCls} />
        </Field>
      </div>
      <button type="submit" disabled={saving} data-guard-save className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50">
        {saving ? "Zapisuję..." : mode === "create" ? "Dodaj pozycję" : "Zapisz pozycję"}
      </button>
    </form>
  );
}
