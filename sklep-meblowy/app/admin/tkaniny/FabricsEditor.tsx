"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { createFabric, updateFabric, deleteFabric, type ActionResult } from "./actions";
import type { Fabric } from "@/app/_lib/types";

export default function FabricsEditor({ initialFabrics }: { initialFabrics: Fabric[] }) {
  const [fabrics, setFabrics] = useState<Fabric[]>(initialFabrics);
  const [prevInitial, setPrevInitial] = useState(initialFabrics);
  if (initialFabrics !== prevInitial) {
    setPrevInitial(initialFabrics);
    setFabrics(initialFabrics);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const router = useRouter();

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
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Tkaniny</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Katalog tkanin używanych jako warianty produktów. Dodaj tkaniny raz, a
            potem przy produkcie wybierz z listy które mają być dostępne — warianty
            wygenerują się automatycznie. Nazwa DE jest opcjonalna (puste → na /de
            pokaże się nazwa PL).
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
          + Nowa tkanina
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creating && (
        <Card>
          <FabricForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (fd) => {
              const res = await createFabric(fd);
              handleResult(res, () => {
                setCreating(false);
                router.refresh();
              });
            }}
          />
        </Card>
      )}

      {fabrics.length === 0 && !creating ? (
        <EmptyState message="Brak tkanin. Dodaj pierwszą żeby zacząć." />
      ) : (
        <div className="flex flex-col gap-3">
          {fabrics.map((f) => (
            <div
              key={f.id}
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden"
            >
              <div className="flex items-center gap-3 p-4 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold text-[var(--fg)]">
                    {f.name}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    DE: {f.name_de ?? "—"} · kolejność: {f.sort_order}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => setEditingId(editingId === f.id ? null : f.id)}
                    className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    {editingId === f.id ? "Zwiń" : "Edytuj"}
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Usunąć tkaninę "${f.name}"? Produkty które już ją mają zachowają wartość.`)) return;
                      const fd = new FormData();
                      fd.set("id", f.id);
                      deleteFabric(fd).then((res) =>
                        handleResult(res, () => setFabrics((prev) => prev.filter((x) => x.id !== f.id)))
                      );
                    }}
                    className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors"
                  >
                    Usuń
                  </button>
                </div>
              </div>
              {editingId === f.id && (
                <div className="border-t border-[var(--border)] p-5 bg-[var(--bg)]">
                  <FabricForm
                    mode="update"
                    initial={f}
                    onCancel={() => setEditingId(null)}
                    onSubmit={async (fd) => {
                      const res = await updateFabric(fd);
                      handleResult(res, () => {
                        setEditingId(null);
                        router.refresh();
                      });
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FabricForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Fabric;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="flex flex-col gap-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Nazwa (PL)" required className="md:col-span-2">
          <input
            name="name"
            defaultValue={initial?.name ?? ""}
            required
            minLength={1}
            maxLength={200}
            placeholder="np. Sawana 21"
            className={inputCls}
          />
        </Field>
        <Field label="Kolejność" hint="Niższa = wyżej na liście.">
          <input
            name="sort_order"
            type="number"
            step="1"
            defaultValue={initial?.sort_order ?? 0}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Nazwa (DE)" hint="Puste → na /de pokaże się nazwa PL.">
        <input
          name="name_de"
          defaultValue={initial?.name_de ?? ""}
          maxLength={200}
          placeholder="z. B. Savanne 21"
          className={inputCls}
        />
      </Field>
      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : mode === "create" ? "Dodaj tkaninę" : "Zapisz zmiany"}
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
