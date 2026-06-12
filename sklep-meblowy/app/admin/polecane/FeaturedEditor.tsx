"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { EmptyState, ToastView, inputCls } from "@/app/admin/_shared";
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
  addFeatured,
  updateFeaturedBadge,
  removeFeatured,
  reorderFeatured,
  type ActionResult,
} from "./actions";
import type { FeaturedItem } from "@/app/_lib/featured";
import type { Product } from "@/app/_lib/types";

type Toast = { type: "success" | "error"; message: string } | null;

export default function FeaturedEditor({
  initialFeatured,
  availableProducts,
}: {
  initialFeatured: FeaturedItem[];
  availableProducts: Product[];
}) {
  const [items, setItems] = useState<FeaturedItem[]>(initialFeatured);
  // Sync stanu z propów po router.refresh() (patrz SliderEditor).
  const [prevInitial, setPrevInitial] = useState(initialFeatured);
  if (initialFeatured !== prevInitial) {
    setPrevInitial(initialFeatured);
    setItems(initialFeatured);
  }
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
    const oldIndex = items.findIndex((x) => x.id === active.id);
    const newIndex = items.findIndex((x) => x.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex).map((it, i) => ({
      ...it,
      sort_order: i,
    }));
    // Stan sprzed próby — rollback nie może cofać do initialFeatured (gubiłby
    // wcześniejsze udane reordery), tylko do ostatniego dobrego stanu (audyt LOW).
    const prev = items;
    setItems(reordered);
    startTransition(async () => {
      const res = await reorderFeatured(
        reordered.map((it) => ({ id: it.id, sort_order: it.sort_order }))
      );
      if (!res.ok) {
        setItems(prev);
        showToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Polecane produkty</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Sekcja &bdquo;Polecane produkty&rdquo; na stronie głównej. Wybierz produkty z listy,
          ustaw badge (&bdquo;Bestseller&rdquo;, &bdquo;Nowość&rdquo; itp.) i kolejność przeciąganiem.
          Jeśli nic nie wybierzesz — home pokaże 4 najnowsze produkty automatycznie.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Form: dodaj polecany */}
      <AddForm
        availableProducts={availableProducts}
        onAdd={async (fd) => {
          const res = await addFeatured(fd);
          handleResult(res, () => router.refresh());
        }}
      />

      {/* Lista featured */}
      {items.length === 0 ? (
        <EmptyState message="Brak polecanych — dodaj pierwszy z listy powyżej." />
      ) : (
        <DndContext id="featured-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={items.map((x) => x.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {items.map((it) => (
                <SortableRow
                  key={it.id}
                  item={it}
                  onUpdateBadge={async (badge) => {
                    const fd = new FormData();
                    fd.set("id", it.id);
                    fd.set("badge", badge);
                    const res = await updateFeaturedBadge(fd);
                    handleResult(res, () => {
                      setItems(items.map((x) => (x.id === it.id ? { ...x, badge: badge || null } : x)));
                    });
                  }}
                  onRemove={async () => {
                    const fd = new FormData();
                    fd.set("id", it.id);
                    const res = await removeFeatured(fd);
                    handleResult(res, () => {
                      setItems(items.filter((x) => x.id !== it.id));
                    });
                  }}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </div>
  );
}

// ============================================================
// Form: dodaj polecany
// ============================================================

function AddForm({
  availableProducts,
  onAdd,
}: {
  availableProducts: Product[];
  onAdd: (fd: FormData) => Promise<void>;
}) {
  const [pending, startTransition] = useTransition();
  const [productId, setProductId] = useState("");
  const [badge, setBadge] = useState("");

  if (availableProducts.length === 0) {
    return (
      <div className="p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--muted)]">
        Wszystkie istniejące produkty są już w polecanych. Żeby dodać kolejny, najpierw
        zsynchronizuj nowy produkt z BaseLinkera (Admin → BaseLinker).
      </div>
    );
  }

  return (
    <form
      action={(fd) => {
        if (!productId) return;
        startTransition(async () => {
          await onAdd(fd);
          setProductId("");
          setBadge("");
        });
      }}
      className="p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl flex flex-col md:flex-row gap-3 items-end"
    >
      <label className="flex-1 flex flex-col gap-1.5">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Produkt do dodania
        </span>
        <select
          name="product_id"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          required
          className={inputCls}
        >
          <option value="">— wybierz produkt —</option>
          {availableProducts.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} ({p.price.toLocaleString("pl-PL")} zł)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1.5 md:w-56">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Badge (opcjonalny)
        </span>
        <input
          name="badge"
          value={badge}
          onChange={(e) => setBadge(e.target.value)}
          placeholder="np. Bestseller, Nowość"
          maxLength={50}
          className={inputCls}
        />
      </label>
      <button
        type="submit"
        disabled={pending || !productId}
        className="shrink-0 px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {pending ? "Dodaję..." : "+ Dodaj polecany"}
      </button>
    </form>
  );
}

// ============================================================
// Sortable row — pojedynczy featured
// ============================================================

function SortableRow({
  item,
  onUpdateBadge,
  onRemove,
}: {
  item: FeaturedItem;
  onUpdateBadge: (badge: string) => Promise<void>;
  onRemove: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.id });
  const [pendingBadge, startBadgeTransition] = useTransition();
  const [pendingRemove, startRemoveTransition] = useTransition();
  const [badge, setBadge] = useState(item.badge ?? "");

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const thumb = item.product.images?.[0] ?? null;
  const dirty = (item.badge ?? "") !== badge;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-3 flex items-center gap-3 flex-wrap"
    >
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

      <div className="relative w-16 h-16 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
        {thumb ? (
          <Image src={thumb} alt="" fill sizes="64px" className="object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-[10px]">
            brak zdj.
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <p className="font-display text-sm font-semibold text-[var(--fg)] truncate">
          {item.product.name}
        </p>
        <p className="text-xs text-[var(--muted)] mt-0.5">
          {item.product.category} · {item.product.price.toLocaleString("pl-PL")} zł
        </p>
      </div>

      <div className="flex items-center gap-2">
        <input
          value={badge}
          onChange={(e) => setBadge(e.target.value)}
          placeholder="badge (opcjonalny)"
          maxLength={50}
          className={`${inputCls} w-48`}
        />
        <button
          type="button"
          disabled={!dirty || pendingBadge}
          onClick={() => startBadgeTransition(() => onUpdateBadge(badge))}
          className="px-3 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors disabled:opacity-30"
        >
          {pendingBadge ? "..." : "Zapisz"}
        </button>
        <button
          type="button"
          disabled={pendingRemove}
          onClick={() => {
            if (!window.confirm(`Usunąć "${item.product.name}" z polecanych?`)) return;
            startRemoveTransition(() => onRemove());
          }}
          className="px-3 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
        >
          Usuń
        </button>
      </div>
    </div>
  );
}

// ============================================================
// Helpers / małe komponenty
// ============================================================

