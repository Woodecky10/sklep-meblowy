"use client";

import { useState, useTransition } from "react";
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
  createTile,
  updateTile,
  deleteTile,
  reorderTiles,
  toggleTileActive,
  type ActionResult,
} from "./actions";
import type { TileRow } from "@/app/_lib/home-tiles";

type Toast = { type: "success" | "error"; message: string } | null;

export default function TilesEditor({
  initialTiles,
}: {
  initialTiles: TileRow[];
}) {
  const [tiles, setTiles] = useState<TileRow[]>(initialTiles);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [, startTransition] = useTransition();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  function handleResult(result: ActionResult, onSuccess?: () => void) {
    if (result.ok) {
      showToast({ type: "success", message: result.message ?? "Zapisano" });
      onSuccess?.();
    } else {
      showToast({ type: "error", message: result.error });
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = tiles.findIndex((t) => t.id === active.id);
    const newIndex = tiles.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(tiles, oldIndex, newIndex).map((t, i) => ({
      ...t,
      sort_order: i,
    }));

    setTiles(reordered);
    startTransition(async () => {
      const res = await reorderTiles(
        reordered.map((t) => ({ id: t.id, sort_order: t.sort_order }))
      );
      if (!res.ok) {
        setTiles(initialTiles);
        showToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Kafelki</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Kafelki sekcji &bdquo;Znajdź swój styl&rdquo; na stronie głównej. Każdy kafelek
            to zdjęcie + etykieta + link do kolekcji. Przeciągnij żeby zmienić kolejność.
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
          + Nowy kafelek
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creating && (
        <Card>
          <TileForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (fd) => {
              const res = await createTile(fd);
              handleResult(res, () => {
                setCreating(false);
                window.location.reload();
              });
            }}
          />
        </Card>
      )}

      {tiles.length === 0 && !creating ? (
        <EmptyState message="Brak kafelków. Dodaj pierwszy żeby zacząć." />
      ) : (
        <DndContext id="tiles-dnd" sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={tiles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {tiles.map((tile) => (
                <SortableRow
                  key={tile.id}
                  tile={tile}
                  expanded={editingId === tile.id}
                  onToggleExpand={() => setEditingId(editingId === tile.id ? null : tile.id)}
                  onUpdate={async (fd) => {
                    const res = await updateTile(fd);
                    handleResult(res, () => {
                      setEditingId(null);
                      window.location.reload();
                    });
                  }}
                  onDelete={async () => {
                    const fd = new FormData();
                    fd.set("id", tile.id);
                    const res = await deleteTile(fd);
                    handleResult(res, () => {
                      setTiles(tiles.filter((t) => t.id !== tile.id));
                    });
                  }}
                  onToggleActive={async () => {
                    const fd = new FormData();
                    fd.set("id", tile.id);
                    fd.set("active", tile.active ? "0" : "1");
                    const res = await toggleTileActive(fd);
                    handleResult(res, () => {
                      setTiles(
                        tiles.map((t) =>
                          t.id === tile.id ? { ...t, active: !t.active } : t
                        )
                      );
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
// Sortable row
// ============================================================

function SortableRow({
  tile,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onToggleActive,
}: {
  tile: TileRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (fd: FormData) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: tile.id });
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [pendingToggle, startToggleTransition] = useTransition();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-3 p-3">
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

        <div className="relative w-20 h-14 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
          {tile.image_url ? (
            <Image src={tile.image_url} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-[10px]">
              brak zdj.
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-sm font-semibold text-[var(--fg)] truncate">
              {tile.label || <span className="italic text-[var(--muted)]">(bez etykiety)</span>}
            </p>
            {!tile.active && (
              <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-800 text-[var(--muted)] text-[10px] font-sans uppercase tracking-widest rounded-full">
                ukryty
              </span>
            )}
          </div>
          {tile.description && (
            <p className="text-xs text-[var(--muted)] truncate mt-0.5">{tile.description}</p>
          )}
          <p className="text-[10px] text-[var(--muted)] truncate mt-0.5 font-mono">
            → {tile.href}
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => startToggleTransition(() => onToggleActive())}
            disabled={pendingToggle}
            title={tile.active ? "Ukryj kafelek" : "Pokaż kafelek"}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {tile.active ? "Ukryj" : "Pokaż"}
          </button>
          <button
            onClick={onToggleExpand}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {expanded ? "Zwiń" : "Edytuj"}
          </button>
          <button
            onClick={() => {
              if (!window.confirm(`Usunąć kafelek "${tile.label || "(bez etykiety)"}"? Tej operacji nie da się cofnąć.`)) return;
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
          <TileForm mode="update" initial={tile} onCancel={onToggleExpand} onSubmit={onUpdate} />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Form (create/update)
// ============================================================

function TileForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: TileRow;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [previewUrl, setPreviewUrl] = useState<string | null>(initial?.image_url ?? null);
  const [compressedFile, setCompressedFile] = useState<File | null>(null);
  const [compressing, setCompressing] = useState(false);
  const [compressInfo, setCompressInfo] = useState<string | null>(null);

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPreviewUrl(URL.createObjectURL(file));

    if (file.size < 800 * 1024) {
      setCompressedFile(file);
      setCompressInfo(`${(file.size / 1024).toFixed(0)} KB — bez kompresji`);
      return;
    }

    setCompressing(true);
    setCompressInfo(null);
    try {
      const imageCompression = (await import("browser-image-compression")).default;
      const compressed = await imageCompression(file, {
        maxSizeMB: 1,
        maxWidthOrHeight: 1600,
        useWebWorker: true,
        fileType: file.type === "image/png" ? "image/jpeg" : file.type,
        initialQuality: 0.82,
      });
      setCompressedFile(compressed);
      const before = (file.size / 1024 / 1024).toFixed(1);
      const after = (compressed.size / 1024).toFixed(0);
      setCompressInfo(`${before} MB → ${after} KB (skompresowane)`);
    } catch (err) {
      console.error("Kompresja nieudana:", err);
      setCompressedFile(file);
      setCompressInfo(`${(file.size / 1024 / 1024).toFixed(1)} MB — kompresja zawiodła, wysyłam oryginał`);
    } finally {
      setCompressing(false);
    }
  }

  return (
    <form
      action={(fd) => {
        if (compressedFile) {
          fd.set("image", compressedFile, compressedFile.name);
        }
        startTransition(() => onSubmit(fd));
      }}
      className="grid grid-cols-1 lg:grid-cols-3 gap-6"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="lg:col-span-2 flex flex-col gap-4">
        <Field
          label="Zdjęcie kafelka"
          hint={
            initial?.image_url
              ? "Zostaw puste żeby zachować obecne zdjęcie. Wybierz nowe żeby zastąpić."
              : "Format: JPG/PNG/WebP. Duże zdjęcia są automatycznie kompresowane."
          }
        >
          <input
            type="file"
            name="image"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full text-sm text-[var(--fg)] file:mr-3 file:px-4 file:py-2 file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--card-bg)] file:text-[var(--fg)] file:text-xs file:font-sans file:uppercase file:tracking-widest file:cursor-pointer hover:file:border-[var(--color-gold)]"
          />
          {compressing && (
            <p className="text-xs text-[var(--color-gold)] mt-1 flex items-center gap-2">
              <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                <circle cx="12" cy="12" r="10" opacity="0.25" />
                <path d="M22 12a10 10 0 0 0-10-10" />
              </svg>
              Kompresuję zdjęcie...
            </p>
          )}
          {compressInfo && !compressing && (
            <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">✓ {compressInfo}</p>
          )}
        </Field>

        <Field label="Opis zdjęcia (alt)" hint="Co widać na zdjęciu — dla wyszukiwarek i niewidzących">
          <input
            name="image_alt"
            defaultValue={initial?.image_alt ?? ""}
            placeholder="np. Elegancka sofa w jasnym salonie"
            maxLength={200}
            className={inputCls}
          />
        </Field>

        <Field label="Etykieta" required hint="Wyświetlane na kafelku, np. „Sofy 3-osobowe”.">
          <input
            name="label"
            defaultValue={initial?.label ?? ""}
            required
            minLength={1}
            maxLength={200}
            placeholder="np. Sofy 3-osobowe"
            className={inputCls}
          />
        </Field>

        <Field label="Krótki opis" hint="Opcjonalne. Pojawia się pod etykietą, np. „Komfort i elegancja…”.">
          <textarea
            name="description"
            defaultValue={initial?.description ?? ""}
            maxLength={500}
            rows={2}
            placeholder="np. Komfort i elegancja w każdym salonie"
            className={`${inputCls} resize-y`}
          />
        </Field>

        <Field label="Link" required hint='Dokąd klient ma trafić, np. "/sklep?kategoria=sofa-3-osobowa".'>
          <input
            name="href"
            defaultValue={initial?.href ?? "/sklep"}
            required
            minLength={1}
            maxLength={500}
            placeholder="/sklep?kategoria=..."
            className={inputCls}
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={initial?.active ?? true}
            className="h-4 w-4 accent-[var(--color-gold)]"
          />
          <span>Pokazuj na stronie głównej</span>
        </label>

        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={pending || compressing}
            className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {compressing
              ? "Kompresuję..."
              : pending
              ? "Zapisuję..."
              : mode === "create"
              ? "Dodaj kafelek"
              : "Zapisz zmiany"}
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
      </div>

      <div className="lg:col-span-1">
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-3">
          Podgląd
        </p>
        <TilePreview imageUrl={previewUrl} label={initial?.label ?? ""} description={initial?.description ?? ""} />
      </div>
    </form>
  );
}

// ============================================================
// Preview
// ============================================================

function TilePreview({
  imageUrl,
  label,
  description,
}: {
  imageUrl: string | null;
  label: string;
  description: string;
}) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--border)] bg-stone-100 dark:bg-stone-900">
      <div className="aspect-square relative">
        {imageUrl ? (
          <Image src={imageUrl} alt="" fill sizes="300px" className="object-cover" unoptimized />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-xs">
            brak zdjęcia
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-4">
          {label && (
            <p className="font-display text-lg font-bold text-white leading-tight">
              {label}
            </p>
          )}
          {description && (
            <p className="text-white/80 text-xs leading-relaxed mt-1 line-clamp-2">
              {description}
            </p>
          )}
        </div>
      </div>
      <p className="text-[10px] text-[var(--muted)] px-3 py-2 text-center">
        Podgląd kafelka
      </p>
    </div>
  );
}

// ============================================================
// Helpers / małe komponenty
// ============================================================

const inputCls =
  "w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]";

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1.5">
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
