"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import Image from "next/image";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  createCollection,
  saveCollection,
  deleteCollection,
  setCollectionProducts,
  reorderCollections,
  toggleCollectionOnHome,
  type ActionResult,
} from "./actions";
import { useConfirm } from "@/app/_context/ConfirmContext";
import { searchMatches } from "@/app/_lib/search-normalize";
// Czyste helpery — z collection-tiles, NIE z collections.ts: ten drugi ma
// `import "server-only"` i ciągnie next/cache, więc import stąd ("use client")
// wysypałby build.
import { foldAfterIndex, HOME_COLLECTIONS_VISIBLE } from "@/app/_lib/collection-tiles";
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
  const [, startTransition] = useTransition();
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

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = collections.findIndex((c) => c.id === active.id);
    const newIndex = collections.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(collections, oldIndex, newIndex).map((c, i) => ({
      ...c,
      sort_order: i,
    }));

    // Cofnięcie wraca do OSTATNIEGO DOBREGO stanu, nie do initialCollections —
    // inaczej nieudany zapis wymazuje wcześniejsze udane przestawienia
    // (wniosek z audytu, ten sam komentarz jest w TilesEditor).
    const prev = collections;
    setCollections(reordered);
    startTransition(async () => {
      const res = await reorderCollections(
        reordered.map((c) => ({ id: c.id, sort_order: c.sort_order }))
      );
      if (!res.ok) {
        setCollections(prev);
        showToast({ type: "error", message: res.error });
      }
    });
  }

  // Kreska liczy tylko kolekcje, które realnie trafią na home (widoczne
  // i mające aktywne produkty) — inaczej pokazywałaby granicę w złym miejscu.
  // foldAfterIndex iteruje podaną tablicę w podanej kolejności, więc dostaje
  // DOKŁADNIE tę, którą renderujemy (posortowaną byHomeOrder w page.tsx
  // i aktualizowaną przeciąganiem). null = nie ma czego zwijać.
  const foldIndex = foldAfterIndex(
    collections,
    new Map(Object.entries(productCounts))
  );

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
            sekcję &bdquo;Pełna kolekcja&rdquo; z resztą serii. Przeciągnij żeby zmienić
            kolejność — na stronie głównej widać pierwsze {HOME_COLLECTIONS_VISIBLE}{" "}
            kolekcji, reszta dopiero po kliknięciu przycisku.
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
        <DndContext
          id="collections-dnd"
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={onDragEnd}
        >
          <SortableContext
            items={collections.map((c) => c.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="flex flex-col gap-3">
              {collections.map((c, index) => (
                <Fragment key={c.id}>
                  <Row
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
                    onToggleHome={async () => {
                      const prev = collections;
                      setCollections(
                        collections.map((x) =>
                          x.id === c.id ? { ...x, show_on_home: !x.show_on_home } : x
                        )
                      );
                      const fd = new FormData();
                      fd.set("id", c.id);
                      fd.set("show", c.show_on_home ? "0" : "1");
                      const res = await toggleCollectionOnHome(fd);
                      if (!res.ok) {
                        setCollections(prev);
                        showToast({ type: "error", message: res.error });
                      }
                    }}
                  />
                  {foldIndex === index && (
                    <div className="flex items-center gap-3 py-1" aria-hidden="true">
                      <div className="h-px flex-1 bg-[var(--border)]" />
                      <span className="text-[11px] font-sans uppercase tracking-widest text-[var(--muted)]">
                        poniżej dopiero po rozwinięciu
                      </span>
                      <div className="h-px flex-1 bg-[var(--border)]" />
                    </div>
                  )}
                </Fragment>
              ))}
            </div>
          </SortableContext>
        </DndContext>
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
  onToggleHome,
}: {
  collection: Collection;
  productCount: number;
  allProducts: Product[];
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (fd: FormData, productIds: string[]) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleHome: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: collection.id });
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [pendingHome, startHomeTransition] = useTransition();
  const confirm = useConfirm();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      // Wyszarzenie = ta kolekcja nie trafi na stronę główną (ukryta ptaszkiem
      // albo bez ani jednego aktywnego produktu) — ten sam warunek co
      // appearsOnHome, tyle że po stronie widoku.
      className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden ${!collection.show_on_home || productCount === 0 ? "opacity-60" : ""}`}
    >
      <div className="flex items-center gap-3 p-4 flex-wrap">
        <button
          {...attributes}
          {...listeners}
          aria-label="Przeciągnij żeby zmienić kolejność"
          className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] cursor-grab active:cursor-grabbing"
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="6" r="1" fill="currentColor" />
            <circle cx="9" cy="12" r="1" fill="currentColor" />
            <circle cx="9" cy="18" r="1" fill="currentColor" />
            <circle cx="15" cy="6" r="1" fill="currentColor" />
            <circle cx="15" cy="12" r="1" fill="currentColor" />
            <circle cx="15" cy="18" r="1" fill="currentColor" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          <p className="font-display text-base font-semibold text-[var(--fg)]">
            {collection.label}
          </p>
          <p className="text-xs text-[var(--muted)] mt-0.5">
            <code className="font-mono">{collection.slug}</code> · {productCount}{" "}
            {productCount === 1 ? "produkt" : productCount < 5 ? "produkty" : "produktów"}
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs text-[var(--fg)] cursor-pointer shrink-0">
          <input
            type="checkbox"
            checked={collection.show_on_home}
            disabled={pendingHome}
            onChange={() => startHomeTransition(() => void onToggleHome())}
            className="h-4 w-4 accent-[var(--color-gold)]"
          />
          na stronie głównej
        </label>
        {productCount === 0 && (
          <span className="shrink-0 text-[11px] text-[var(--muted)]">
            brak aktywnych produktów — nie pokaże się
          </span>
        )}
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
    ? allProducts.filter((p) => searchMatches(p.name, search))
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

