"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import Image from "next/image";
import {
  createCollection,
  saveCollection,
  deleteCollection,
  setCollectionProducts,
  type ActionResult,
} from "./actions";
import { useConfirm } from "@/app/_context/ConfirmContext";
import type { Collection, Product } from "@/app/_lib/types";

export default function CollectionsEditor({
  initialCollections,
  allProducts,
  productCounts,
}: {
  initialCollections: Collection[];
  allProducts: Product[];
  productCounts: Record<string, number>;
}) {
  const [collections, setCollections] = useState<Collection[]>(initialCollections);
  // Sync stanu z propów po router.refresh() (patrz SliderEditor).
  const [prevInitial, setPrevInitial] = useState(initialCollections);
  if (initialCollections !== prevInitial) {
    setPrevInitial(initialCollections);
    setCollections(initialCollections);
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
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Kolekcje</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Grupuj produkty które pasują wizualnie do siebie (np. seria mebli &bdquo;Lisbon&rdquo;
            zawierająca narożnik + fotel + pufę). Na karcie produktu klienta zobaczy
            sekcję &bdquo;Pełna kolekcja&rdquo; z resztą serii.
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
          + Nowa kolekcja
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creating && (
        <Card>
          <CollectionForm
            mode="create"
            allProducts={allProducts}
            onCancel={() => setCreating(false)}
            onSubmit={async (fd, productIds) => {
              const res = await createCollection(fd);
              if (!res.ok) {
                showToast({ type: "error", message: res.error });
                return;
              }
              const newId = (res.data as { id?: string } | undefined)?.id;
              if (newId && productIds.length > 0) {
                const r2 = await setCollectionProducts(newId, productIds);
                if (!r2.ok) {
                  showToast({ type: "error", message: r2.error });
                  return;
                }
              }
              showToast({ type: "success", message: res.message ?? "Zapisano" });
              setCreating(false);
              router.refresh();
            }}
          />
        </Card>
      )}

      {collections.length === 0 && !creating ? (
        <EmptyState message="Brak kolekcji. Dodaj pierwszą żeby zacząć." />
      ) : (
        <div className="flex flex-col gap-3">
          {collections.map((c) => (
            <Row
              key={c.id}
              collection={c}
              productCount={productCounts[c.id] ?? 0}
              allProducts={allProducts}
              expanded={editingId === c.id}
              onToggleExpand={() => setEditingId(editingId === c.id ? null : c.id)}
              onUpdate={async (fd, productIds) => {
                // Metadane + przypisania w jednej atomowej akcji (audyt LOW #14).
                const res = await saveCollection(fd, productIds);
                if (!res.ok) {
                  showToast({ type: "error", message: res.error });
                  return;
                }
                showToast({ type: "success", message: "Kolekcja zapisana" });
                setEditingId(null);
                router.refresh();
              }}
              onDelete={async () => {
                const fd = new FormData();
                fd.set("id", c.id);
                const res = await deleteCollection(fd);
                handleResult(res, () => {
                  setCollections(collections.filter((x) => x.id !== c.id));
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
// Row
// ============================================================

function Row({
  collection,
  productCount,
  allProducts,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
}: {
  collection: Collection;
  productCount: number;
  allProducts: Product[];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (fd: FormData, productIds: string[]) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [pendingDelete, startDeleteTransition] = useTransition();
  const confirm = useConfirm();
  return (
    <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden">
      <div className="flex items-center gap-3 p-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-semibold text-[var(--fg)]">
            {collection.label}
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            <code className="font-mono">{collection.slug}</code> · {productCount}{" "}
            {productCount === 1 ? "produkt" : productCount < 5 ? "produkty" : "produktów"}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onToggleExpand}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {expanded ? "Zwiń" : "Edytuj"}
          </button>
          <button
            onClick={async () => {
              if (!(await confirm({ message: `Usunąć kolekcję "${collection.label}"? Produkty zostają, tylko stracą przypisanie.`, danger: true }))) return;
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
          <CollectionForm
            mode="update"
            initial={collection}
            allProducts={allProducts}
            onCancel={onToggleExpand}
            onSubmit={onUpdate}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Form (create/update)
// ============================================================

function CollectionForm({
  mode,
  initial,
  allProducts,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Collection;
  allProducts: Product[];
  onSubmit: (fd: FormData, productIds: string[]) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  // Produkty obecnie należące do tej kolekcji (z DB) lub puste przy create.
  const initialSelected = initial
    ? allProducts.filter((p) => p.collection_id === initial.id).map((p) => p.id)
    : [];
  const [selected, setSelected] = useState<string[]>(initialSelected);
  const [search, setSearch] = useState("");

  // Produkty już przypisane do INNEJ kolekcji — pokażemy je z badge "inna kolekcja"
  // żeby admin wiedział że zaznaczenie spowoduje "kradzież".

  function toggle(productId: string) {
    setSelected((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId]
    );
  }

  const filtered = search.trim()
    ? allProducts.filter((p) => p.name.toLowerCase().includes(search.trim().toLowerCase()))
    : allProducts;

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd, selected))}
      className="flex flex-col gap-4"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nazwa kolekcji" required>
          <input
            name="label"
            defaultValue={initial?.label ?? ""}
            required
            minLength={2}
            maxLength={200}
            placeholder="np. Kolekcja Lisbon"
            className={inputCls}
          />
        </Field>
        {mode === "create" && (
          <Field label="Slug (link)" hint="Zostaw puste żeby wygenerować z nazwy.">
            <input
              name="slug"
              maxLength={80}
              placeholder="np. lisbon"
              className={inputCls}
            />
          </Field>
        )}
      </div>

      <Field label="Nazwa kolekcji (DE)" hint="Puste → na /de pokaże się nazwa PL.">
        <input
          name="label_de"
          defaultValue={initial?.label_de ?? ""}
          maxLength={200}
          placeholder="z. B. Kollektion Lisbon"
          className={inputCls}
        />
      </Field>

      <Field label="Opis" hint="Opcjonalny opis pokazywany w sekcji.">
        <textarea
          name="description"
          defaultValue={initial?.description ?? ""}
          rows={3}
          maxLength={1000}
          className={`${inputCls} resize-y`}
        />
      </Field>

      <Field label="Opis (DE)" hint="Puste → na /de pokaże się opis PL.">
        <textarea
          name="description_de"
          defaultValue={initial?.description_de ?? ""}
          rows={3}
          maxLength={1000}
          className={`${inputCls} resize-y`}
        />
      </Field>

      <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Produkty w kolekcji ({selected.length})
          </span>
          <input
            type="text"
            placeholder="Szukaj produktu…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className={`${inputCls} max-w-xs`}
          />
        </div>
        <ul className="max-h-96 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {filtered.length === 0 && (
            <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
          )}
          {filtered.map((p) => {
            const active = selected.includes(p.id);
            const otherCollection = p.collection_id && p.collection_id !== initial?.id;
            return (
              <li key={p.id}>
                <label className={`flex items-center gap-3 p-2 cursor-pointer transition-colors ${active ? "bg-[var(--color-gold)]/10" : "hover:bg-[var(--bg)]"}`}>
                  <input
                    type="checkbox"
                    checked={active}
                    onChange={() => toggle(p.id)}
                    className="h-4 w-4 accent-[var(--color-gold)]"
                  />
                  <div className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                    {p.images?.[0] ? (
                      <Image src={p.images[0]} alt="" fill sizes="40px" className="object-cover" />
                    ) : null}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[var(--fg)] truncate">{p.name}</p>
                    <p className="text-[10px] text-[var(--muted)]">
                      {p.category} · {p.price.toLocaleString("pl-PL")} zł
                    </p>
                  </div>
                  {otherCollection && !active && (
                    <span className="text-[10px] font-sans uppercase tracking-widest text-amber-600 dark:text-amber-400">
                      w innej kolekcji
                    </span>
                  )}
                </label>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : mode === "create" ? "Utwórz kolekcję" : "Zapisz zmiany"}
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

