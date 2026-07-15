"use client";

// Karta „Menu" (krok D): pozycje Navbara i stopki — linki do podstron.
// Wzorce strzałek/switchy/rollbacków 1:1 z PagesList/BlocksEditor.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  addMenuItem,
  updateMenuItemLabel,
  toggleMenuItemVisible,
  deleteMenuItem,
  reorderMenuItems,
} from "./actions";
import {
  MENU_LOCATIONS,
  type MenuItemRow,
  type MenuLocation,
} from "@/app/_lib/menu";
import type { PageRow } from "@/app/_lib/pages";
import type { ActionResult } from "@/app/_lib/types";
import { Card, ToastView, Field, inputCls, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

const LOCATION_META: Record<MenuLocation, { name: string; desc: string }> = {
  navbar: {
    name: "Menu główne",
    desc: "Linki obok kategorii u góry strony (powyżej 4 pozycji reszta trafia do rozwijanego „Więcej”).",
  },
  footer: {
    name: "Stopka",
    desc: "Linki w kolumnie „Informacje” na dole strony.",
  },
};

export default function MenuCard({
  initialItems,
  pages,
}: {
  initialItems: MenuItemRow[];
  pages: PageRow[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initialItems);
  const [prevInitial, setPrevInitial] = useState(initialItems);
  if (initialItems !== prevInitial) {
    setPrevInitial(initialItems);
    setItems(initialItems);
  }
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }
  function handleResult(result: ActionResult, onSuccess?: () => void) {
    if (result.ok) {
      showToast({ type: "success", message: result.message ?? "Zapisano" });
      onSuccess?.();
      router.refresh();
    } else {
      showToast({ type: "error", message: result.error });
    }
  }

  const byLocation = (location: MenuLocation) =>
    items
      .filter((i) => i.location === location)
      .sort((a, b) => a.sort_order - b.sort_order || a.id.localeCompare(b.id));

  function move(location: MenuLocation, index: number, delta: -1 | 1) {
    const list = byLocation(location);
    const target = index + delta;
    if (target < 0 || target >= list.length) return;
    const next = [...list];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = items;
    // Optymistycznie: nadpisz sort_order lokalnie w ramach lokacji.
    const reordered = new Map(next.map((it, idx) => [it.id, idx]));
    setItems(
      items.map((it) =>
        reordered.has(it.id) ? { ...it, sort_order: reordered.get(it.id)! } : it
      )
    );
    startTransition(async () => {
      const res = await reorderMenuItems(next.map((it) => it.id));
      if (!res.ok) {
        setItems(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  function toggleVisible(item: MenuItemRow) {
    const fd = new FormData();
    fd.set("id", item.id);
    fd.set("visible", item.visible ? "0" : "1");
    const prev = items;
    setItems(
      items.map((x) => (x.id === item.id ? { ...x, visible: !x.visible } : x))
    );
    startTransition(async () => {
      const res = await toggleMenuItemVisible(fd);
      if (!res.ok) {
        setItems(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  async function remove(item: MenuItemRow) {
    const ok = await confirm({
      message: `Usunąć pozycję „${displayLabel(item)}" z menu? Sama strona zostaje.`,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", item.id);
    startTransition(async () => {
      handleResult(await deleteMenuItem(fd));
    });
  }

  function displayLabel(item: MenuItemRow): string {
    return (
      (item.label && item.label.trim()) ||
      item.page?.title ||
      "(strona usunięta)"
    );
  }

  return (
    <Card>
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="font-display text-lg font-semibold text-[var(--fg)]">Menu</h2>
          <p className="text-xs text-[var(--muted)]">
            Które podstrony mają być podlinkowane w menu u góry strony i w stopce.
            Widoczne dla klientów są tylko pozycje OPUBLIKOWANYCH stron.
          </p>
        </div>
        {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}
        {MENU_LOCATIONS.map((location) => {
          const list = byLocation(location);
          return (
            <div key={location} className="flex flex-col gap-3">
              <div>
                <h3 className="font-display text-base font-semibold text-[var(--fg)]">
                  {LOCATION_META[location].name}
                </h3>
                <p className="text-xs text-[var(--muted)]">{LOCATION_META[location].desc}</p>
              </div>

              <AddItemForm location={location} pages={pages} onResult={handleResult} />

              {list.length === 0 && (
                <p className="text-xs text-[var(--muted)] italic">Brak pozycji.</p>
              )}
              {list.map((item, i) => {
                const expanded = expandedId === item.id;
                const draft = item.page !== null && !item.page.published;
                return (
                  <div
                    key={item.id}
                    className="border border-[var(--border)] rounded-xl p-3 flex flex-col gap-3"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex flex-col gap-0.5">
                        <button
                          type="button"
                          onClick={() => move(location, i, -1)}
                          disabled={i === 0 || isPending}
                          aria-label={`Przesuń pozycję ${displayLabel(item)} wyżej`}
                          className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => move(location, i, 1)}
                          disabled={i === list.length - 1 || isPending}
                          aria-label={`Przesuń pozycję ${displayLabel(item)} niżej`}
                          className="w-6 h-6 flex items-center justify-center rounded-full border border-[var(--border)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                        >
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                        </button>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className={`text-sm font-semibold ${item.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                            {displayLabel(item)}
                          </p>
                          {!item.visible && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest bg-[var(--border)] text-[var(--muted)]">
                              Ukryta
                            </span>
                          )}
                          {draft && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                              strona-szkic
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[var(--muted)] font-mono">
                          /{item.page?.slug ?? "?"}
                        </p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={item.visible}
                        aria-label={`Widoczność pozycji ${displayLabel(item)}`}
                        onClick={() => toggleVisible(item)}
                        disabled={isPending}
                        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${item.visible ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}
                      >
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${item.visible ? "left-[22px]" : "left-0.5"}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : item.id)}
                        aria-expanded={expanded}
                        aria-label={`Edytuj etykietę pozycji ${displayLabel(item)}`}
                        className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] hover:border-[var(--color-gold)] shrink-0"
                      >
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                      </button>
                      <button
                        type="button"
                        onClick={() => remove(item)}
                        disabled={isPending}
                        className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-60"
                      >
                        Usuń
                      </button>
                    </div>
                    {expanded && (
                      <LabelForm item={item} onResult={handleResult} />
                    )}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function AddItemForm({
  location,
  pages,
  onResult,
}: {
  location: MenuLocation;
  pages: PageRow[];
  onResult: (r: ActionResult) => void;
}) {
  const [pageId, setPageId] = useState("");
  const [adding, startTransition] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!pageId) return;
    const fd = new FormData();
    fd.set("page_id", pageId);
    fd.set("location", location);
    startTransition(async () => {
      onResult(await addMenuItem(fd));
      setPageId("");
    });
  }

  return (
    <form onSubmit={submit} className="flex items-end gap-2 flex-wrap">
      <Field label="Dodaj stronę do menu" className="flex-1 min-w-[220px]">
        <select value={pageId} onChange={(e) => setPageId(e.target.value)} className={inputCls}>
          <option value="">— wybierz stronę —</option>
          {pages.map((p) => (
            <option key={p.id} value={p.id}>
              {p.title}
              {p.published ? "" : " (szkic)"}
            </option>
          ))}
        </select>
      </Field>
      <button
        type="submit"
        disabled={adding || !pageId}
        className="px-4 py-2.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-50"
      >
        {adding ? "Dodaję..." : "+ Dodaj"}
      </button>
    </form>
  );
}

// Etykieta własna (pusta = tytuł strony) — uncontrolled, wzorzec MetaForm.
function LabelForm({
  item,
  onResult,
}: {
  item: MenuItemRow;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      onResult(await updateMenuItemLabel(formData));
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-3 pt-3 border-t border-[var(--border)]">
      <input type="hidden" name="id" value={item.id} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Własna etykieta (pusta = tytuł strony)">
          <input name="label" defaultValue={item.label ?? ""} maxLength={100} className={inputCls} placeholder={item.page?.title ?? ""} />
        </Field>
        <Field label="Etykieta (DE)">
          <input name="label_de" defaultValue={item.label_de ?? ""} maxLength={100} className={inputCls} />
        </Field>
      </div>
      <button
        type="submit"
        disabled={saving}
        data-guard-save
        className="self-start px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {saving ? "Zapisuję..." : "Zapisz etykietę"}
      </button>
    </form>
  );
}
