"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { createFabric, updateFabric, deleteFabric, type ActionResult } from "./actions";
import { uploadProductImage } from "@/app/admin/produkty/actions";
import { compressIfNeeded } from "@/app/_lib/image-compress";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { Fabric } from "@/app/_lib/types";

export default function FabricsEditor({ initialFabrics }: { initialFabrics: Fabric[] }) {
  const confirm = useConfirm();
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

  const categories = [
    ...new Set(
      fabrics.map((f) => f.category?.trim()).filter((c): c is string => !!c)
    ),
  ].sort((a, b) => a.localeCompare(b, "pl"));

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
            categories={categories}
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
                    DE: {f.name_de ?? "—"} · kolejność: {f.sort_order} ·{" "}
                    {f.colors?.length ? `${f.colors.length} kolor${f.colors.length < 5 ? "y" : "ów"}` : "bez kolorów"}
                    {f.category && ` · ${f.category}`}
                    {f.price > 0 && ` · +${f.price.toFixed(2)} zł`}
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
                    onClick={async () => {
                      if (!(await confirm({ message: `Usunąć tkaninę "${f.name}"? Produkty które już ją mają zachowają wartość.`, danger: true }))) return;
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
                    categories={categories}
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
  categories,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Fabric;
  categories: string[];
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<{ code: string; image: string }[]>(() =>
    (initial?.colors ?? []).map((c) => ({ code: c, image: initial?.color_images?.[c] ?? "" }))
  );
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const catListId = `fabric-categories-${initial?.id ?? "new"}`;

  function addRow() {
    setRows((r) => [...r, { code: "", image: "" }]);
  }
  function removeRow(i: number) {
    setRows((r) => r.filter((_, idx) => idx !== i));
  }
  function setCode(i: number, code: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, code } : row)));
  }
  function setRowImage(i: number, image: string) {
    setRows((r) => r.map((row, idx) => (idx === i ? { ...row, image } : row)));
  }
  async function uploadImageForRow(i: number, file: File) {
    setUploadingIdx(i);
    try {
      const toSend = await compressIfNeeded(file);
      const fd = new FormData();
      fd.set("image", toSend, toSend.name);
      const res = await uploadProductImage(fd);
      const url = res.ok ? (res.data as { url: string } | undefined)?.url : undefined;
      if (url) setRowImage(i, url);
    } finally {
      setUploadingIdx(null);
    }
  }

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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Dopłata (zł)" hint="Doliczana do ceny, gdy wybrana ta tkanina. 0 = bez dopłaty.">
          <input
            name="price"
            type="number"
            step="0.01"
            min="0"
            defaultValue={initial?.price ?? 0}
            className={inputCls}
          />
        </Field>
        <Field label="Kategoria / typ" hint="Do grupowania przy wyborze (np. welur, sztruks). Puste = bez kategorii." className="md:col-span-2">
          <input
            name="category"
            list={catListId}
            defaultValue={initial?.category ?? ""}
            maxLength={100}
            placeholder="np. welur"
            className={inputCls}
          />
          <datalist id={catListId}>
            {categories.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </Field>
      </div>

      {/* Kolory (numery) + zdjęcia próbek widoczne dla klienta */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Kolory / numery
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Każdy numer koloru + zdjęcie próbki (na sklepie klient wybiera kolor po
          zdjęciu). Puste = tkanina bez kolorów.
        </p>
        <input
          type="hidden"
          name="colors_json"
          readOnly
          value={JSON.stringify(rows.filter((r) => r.code.trim()))}
        />
        {rows.length === 0 && (
          <span className="text-xs text-[var(--muted)] italic">Brak kolorów — dodaj pierwszy.</span>
        )}
        <div className="flex flex-col gap-2">
          {rows.map((row, i) => (
            <div
              key={i}
              className="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2"
            >
              <span className="relative w-12 h-12 shrink-0 rounded-full overflow-hidden border border-[var(--border)] bg-[var(--card-bg)]">
                {row.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={row.image} alt={row.code} className="w-full h-full object-cover" />
                ) : (
                  <span className="w-full h-full flex items-center justify-center text-[10px] text-[var(--muted)]">
                    brak
                  </span>
                )}
              </span>
              <input
                value={row.code}
                onChange={(e) => setCode(i, e.target.value)}
                placeholder="numer, np. 16"
                maxLength={60}
                className={`${inputCls} flex-1`}
              />
              <label className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors cursor-pointer">
                {uploadingIdx === i ? "Wgrywam…" : row.image ? "Zmień" : "Zdjęcie"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploadingIdx !== null}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    e.target.value = "";
                    if (f) uploadImageForRow(i, f);
                  }}
                />
              </label>
              <button
                type="button"
                onClick={() => removeRow(i)}
                aria-label="Usuń kolor"
                className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={addRow}
          className="self-start px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
        >
          + Dodaj kolor
        </button>
      </div>
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
