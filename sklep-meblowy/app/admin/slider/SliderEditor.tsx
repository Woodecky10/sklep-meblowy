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
  createSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
  toggleSlideActive,
  type ActionResult,
} from "./actions";
import type { SlideRow } from "@/app/_lib/slides";

type Toast = { type: "success" | "error"; message: string } | null;

export default function SliderEditor({
  initialSlides,
}: {
  initialSlides: SlideRow[];
}) {
  const [slides, setSlides] = useState<SlideRow[]>(initialSlides);
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

  // Drag-and-drop sensors — pointer (mysz/touch) + keyboard (dostępność)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  function onDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = slides.findIndex((s) => s.id === active.id);
    const newIndex = slides.findIndex((s) => s.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(slides, oldIndex, newIndex).map((s, i) => ({
      ...s,
      sort_order: i,
    }));

    // Optimistic update — pokazujemy nową kolejność od razu, server w tle
    setSlides(reordered);
    startTransition(async () => {
      const res = await reorderSlides(
        reordered.map((s) => ({ id: s.id, sort_order: s.sort_order }))
      );
      if (!res.ok) {
        // Wycofaj jeśli się sypnęło
        setSlides(initialSlides);
        showToast({ type: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Slider</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Slajdy widoczne na stronie głównej. Przeciągnij żeby zmienić kolejność.
            Slajdy poza datami od-do auto-ukrywają się klientom (ale dalej widać je tu).
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
          + Nowy slajd
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Formularz nowego slajdu */}
      {creating && (
        <Card>
          <SlideForm
            mode="create"
            onCancel={() => setCreating(false)}
            onSubmit={async (fd) => {
              const res = await createSlide(fd);
              handleResult(res, () => {
                setCreating(false);
                // Strona zostanie zrevalidate przez server action,
                // ale szybciej zobaczymy efekt z fresh page reload
                window.location.reload();
              });
            }}
          />
        </Card>
      )}

      {/* Lista slajdów (sortable) */}
      {slides.length === 0 && !creating ? (
        <EmptyState message="Brak slajdów. Dodaj pierwszy żeby zacząć." />
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
          <SortableContext items={slides.map((s) => s.id)} strategy={verticalListSortingStrategy}>
            <div className="flex flex-col gap-3">
              {slides.map((slide) => (
                <SortableRow
                  key={slide.id}
                  slide={slide}
                  expanded={editingId === slide.id}
                  onToggleExpand={() =>
                    setEditingId(editingId === slide.id ? null : slide.id)
                  }
                  onUpdate={async (fd) => {
                    const res = await updateSlide(fd);
                    handleResult(res, () => {
                      setEditingId(null);
                      window.location.reload();
                    });
                  }}
                  onDelete={async () => {
                    const fd = new FormData();
                    fd.set("id", slide.id);
                    const res = await deleteSlide(fd);
                    handleResult(res, () => {
                      setSlides(slides.filter((s) => s.id !== slide.id));
                    });
                  }}
                  onToggleActive={async () => {
                    const fd = new FormData();
                    fd.set("id", slide.id);
                    fd.set("active", slide.active ? "0" : "1");
                    const res = await toggleSlideActive(fd);
                    handleResult(res, () => {
                      setSlides(
                        slides.map((s) =>
                          s.id === slide.id ? { ...s, active: !s.active } : s
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
// Sortable row — single slide entry with drag handle + expand-to-edit
// ============================================================

function SortableRow({
  slide,
  expanded,
  onToggleExpand,
  onUpdate,
  onDelete,
  onToggleActive,
}: {
  slide: SlideRow;
  expanded: boolean;
  onToggleExpand: () => void;
  onUpdate: (fd: FormData) => Promise<void>;
  onDelete: () => Promise<void>;
  onToggleActive: () => Promise<void>;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: slide.id });
  const [pendingDelete, startDeleteTransition] = useTransition();
  const [pendingToggle, startToggleTransition] = useTransition();

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  const dateInfo = formatDateRange(slide.starts_at, slide.ends_at);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl overflow-hidden"
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag handle */}
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

        {/* Thumbnail */}
        <div className="relative w-20 h-14 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
          {slide.image_url ? (
            <Image src={slide.image_url} alt="" fill sizes="80px" className="object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-[10px]">
              brak zdj.
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-display text-sm font-semibold text-[var(--fg)] truncate">
              {slide.title || <span className="italic text-[var(--muted)]">(bez tytułu)</span>}
            </p>
            {!slide.active && (
              <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-800 text-[var(--muted)] text-[10px] font-sans uppercase tracking-widest rounded-full">
                ukryty
              </span>
            )}
            {dateInfo && (
              <span className="px-2 py-0.5 bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 text-[10px] font-sans rounded-full">
                {dateInfo}
              </span>
            )}
          </div>
          {slide.eyebrow && (
            <p className="text-xs text-[var(--muted)] truncate mt-0.5">{slide.eyebrow}</p>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={() => startToggleTransition(() => onToggleActive())}
            disabled={pendingToggle}
            title={slide.active ? "Ukryj slajd" : "Pokaż slajd"}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {slide.active ? "Ukryj" : "Pokaż"}
          </button>
          <button
            onClick={onToggleExpand}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {expanded ? "Zwiń" : "Edytuj"}
          </button>
          <button
            onClick={() => {
              if (!window.confirm(`Usunąć slajd "${slide.title || "(bez tytułu)"}"? Tej operacji nie da się cofnąć.`)) return;
              startDeleteTransition(() => onDelete());
            }}
            disabled={pendingDelete}
            className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-50"
          >
            Usuń
          </button>
        </div>
      </div>

      {/* Edit form */}
      {expanded && (
        <div className="border-t border-[var(--border)] p-5 bg-[var(--bg)]">
          <SlideForm
            mode="update"
            initial={slide}
            onCancel={onToggleExpand}
            onSubmit={onUpdate}
          />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Form — create/update slajdu (z preview obok)
// ============================================================

function SlideForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: SlideRow;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();

  // Live preview state — odzwierciedla aktualne wartości pól
  const [preview, setPreview] = useState({
    image_url: initial?.image_url ?? null,
    eyebrow: initial?.eyebrow ?? "",
    title: initial?.title ?? "",
    highlighted_word: initial?.highlighted_word ?? "",
    subtitle: initial?.subtitle ?? "",
    cta_primary_label: initial?.cta_primary_label ?? "",
  });

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="grid grid-cols-1 lg:grid-cols-3 gap-6"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      {/* Form fields (2/3) */}
      <div className="lg:col-span-2 flex flex-col gap-4">
        {/* Zdjęcie */}
        <Field
          label="Zdjęcie tła"
          hint={
            initial?.image_url
              ? "Zostaw puste żeby zachować obecne zdjęcie. Wybierz nowe żeby zastąpić."
              : "Format: JPG/PNG/WebP. Polecane: szerokie (16:9 albo 21:9), min. 1920px szerokości."
          }
        >
          <input
            type="file"
            name="image"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                setPreview((p) => ({ ...p, image_url: URL.createObjectURL(file) }));
              }
            }}
            className="w-full text-sm text-[var(--fg)] file:mr-3 file:px-4 file:py-2 file:rounded-full file:border file:border-[var(--border)] file:bg-[var(--card-bg)] file:text-[var(--fg)] file:text-xs file:font-sans file:uppercase file:tracking-widest file:cursor-pointer hover:file:border-[var(--color-gold)]"
          />
        </Field>

        <Field label="Opis zdjęcia (alt)" hint="Co widać na zdjęciu — dla wyszukiwarek i niewidzących">
          <input
            name="image_alt"
            defaultValue={initial?.image_alt ?? ""}
            placeholder="np. Elegancka sofa w jasnym salonie"
            className={inputCls}
          />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Field label="Etykieta nad tytułem" hint='Mała, np. "Kolekcja 2026" albo "Promocja świąteczna"'>
            <input
              name="eyebrow"
              defaultValue={initial?.eyebrow ?? ""}
              maxLength={100}
              onChange={(e) => setPreview((p) => ({ ...p, eyebrow: e.target.value }))}
              placeholder="np. Kolekcja 2026"
              className={inputCls}
            />
          </Field>

          <Field label="Tytuł" required hint="Plain text. Złotą czcionką podświetlimy słowo z pola obok.">
            <input
              name="title"
              defaultValue={initial?.title ?? ""}
              required
              minLength={2}
              maxLength={200}
              onChange={(e) => setPreview((p) => ({ ...p, title: e.target.value }))}
              placeholder="np. Meble, które opowiadają historię"
              className={inputCls}
            />
          </Field>
        </div>

        <Field
          label="Słowo do podświetlenia złotem"
          hint='Opcjonalne. Jeśli np. "opowiadają", to to słowo w tytule będzie złote.'
        >
          <input
            name="highlighted_word"
            defaultValue={initial?.highlighted_word ?? ""}
            maxLength={100}
            onChange={(e) => setPreview((p) => ({ ...p, highlighted_word: e.target.value }))}
            placeholder="np. opowiadają"
            className={inputCls}
          />
        </Field>

        <Field label="Podpis (1–2 zdania)" hint="Pojawia się pod tytułem">
          <textarea
            name="subtitle"
            defaultValue={initial?.subtitle ?? ""}
            maxLength={500}
            rows={3}
            onChange={(e) => setPreview((p) => ({ ...p, subtitle: e.target.value }))}
            placeholder="np. Odkryj kolekcję mebli premium..."
            className={inputCls}
          />
        </Field>

        {/* CTA primary */}
        <fieldset className="border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
          <legend className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] px-2">
            Główny przycisk (CTA)
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Napis na przycisku">
              <input
                name="cta_primary_label"
                defaultValue={initial?.cta_primary_label ?? ""}
                maxLength={100}
                onChange={(e) => setPreview((p) => ({ ...p, cta_primary_label: e.target.value }))}
                placeholder="np. Przeglądaj kolekcję"
                className={inputCls}
              />
            </Field>
            <Field label="Link" hint='Np. "/sklep" albo "/sklep?kategoria=sofa-3-osobowa"'>
              <input
                name="cta_primary_href"
                defaultValue={initial?.cta_primary_href ?? ""}
                maxLength={500}
                placeholder="/sklep"
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        {/* CTA secondary */}
        <fieldset className="border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
          <legend className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] px-2">
            Drugi przycisk (opcjonalny)
          </legend>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Napis">
              <input
                name="cta_secondary_label"
                defaultValue={initial?.cta_secondary_label ?? ""}
                maxLength={100}
                placeholder="np. Nowości"
                className={inputCls}
              />
            </Field>
            <Field label="Link">
              <input
                name="cta_secondary_href"
                defaultValue={initial?.cta_secondary_href ?? ""}
                maxLength={500}
                placeholder="/sklep?sortuj=newest"
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

        {/* Daty obowiązywania */}
        <fieldset className="border border-[var(--border)] rounded-xl p-4 flex flex-col gap-3">
          <legend className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] px-2">
            Daty obowiązywania (opcjonalne)
          </legend>
          <p className="text-xs text-[var(--muted)] leading-relaxed">
            Jeśli ustawisz, slajd pojawi się na stronie tylko w tym zakresie.
            Idealne do akcji świątecznych, Black Friday itp.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Field label="Pokaż od">
              <input
                type="datetime-local"
                name="starts_at"
                defaultValue={toDateTimeLocal(initial?.starts_at)}
                className={inputCls}
              />
            </Field>
            <Field label="Pokaż do">
              <input
                type="datetime-local"
                name="ends_at"
                defaultValue={toDateTimeLocal(initial?.ends_at)}
                className={inputCls}
              />
            </Field>
          </div>
        </fieldset>

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

        {/* Buttons */}
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={pending}
            className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {pending ? "Zapisuję..." : mode === "create" ? "Dodaj slajd" : "Zapisz zmiany"}
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

      {/* Preview (1/3) */}
      <div className="lg:col-span-1">
        <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-3">
          Podgląd
        </p>
        <SlidePreview state={preview} />
      </div>
    </form>
  );
}

// ============================================================
// Preview — kompaktowa wersja slajdu, pokazuje co użytkownik widzi
// ============================================================

function SlidePreview({
  state,
}: {
  state: {
    image_url: string | null;
    eyebrow: string;
    title: string;
    highlighted_word: string;
    subtitle: string;
    cta_primary_label: string;
  };
}) {
  return (
    <div className="relative rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--color-navy)]">
      <div className="aspect-[4/3] relative">
        {state.image_url && (
          <Image
            src={state.image_url}
            alt=""
            fill
            sizes="400px"
            className="object-cover"
            unoptimized
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/20" />
        <div className="relative h-full flex items-center p-5">
          <div className="max-w-full">
            {state.eyebrow && (
              <p className="font-sans text-[10px] uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
                {state.eyebrow}
              </p>
            )}
            {state.title && (
              <h2 className="font-display text-lg font-bold text-white leading-tight mb-2">
                {renderTitlePreview(state.title, state.highlighted_word)}
              </h2>
            )}
            {state.subtitle && (
              <p className="text-white/80 text-xs leading-relaxed mb-3 line-clamp-3">
                {state.subtitle}
              </p>
            )}
            {state.cta_primary_label && (
              <span className="inline-block px-3 py-1.5 bg-[var(--color-gold)] text-[var(--color-navy)] text-[10px] font-sans font-semibold uppercase tracking-widest rounded-full">
                {state.cta_primary_label}
              </span>
            )}
          </div>
        </div>
      </div>
      <p className="text-[10px] text-[var(--muted)] px-3 py-2 text-center">
        Tak będzie wyglądać slajd na stronie
      </p>
    </div>
  );
}

function renderTitlePreview(title: string, highlight: string) {
  if (!highlight.trim()) return title;
  const idx = title.toLowerCase().indexOf(highlight.toLowerCase().trim());
  if (idx === -1) return title;
  const before = title.slice(0, idx);
  const matched = title.slice(idx, idx + highlight.length);
  const after = title.slice(idx + highlight.length);
  return (
    <>
      {before}
      <em className="not-italic text-[var(--color-gold)]">{matched}</em>
      {after}
    </>
  );
}

// ============================================================
// Helpers
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

// Konwersja ISO timestamp z DB → format dla <input type="datetime-local"> ("YYYY-MM-DDTHH:mm")
function toDateTimeLocal(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Sformatuj zakres dat dla badge'a — pokazuje czy slajd jest wygasły / przyszły
function formatDateRange(starts: string | null, ends: string | null): string | null {
  if (!starts && !ends) return null;
  const now = Date.now();
  const startsMs = starts ? new Date(starts).getTime() : null;
  const endsMs = ends ? new Date(ends).getTime() : null;

  if (startsMs && now < startsMs) {
    return `Pojawi się ${new Date(startsMs).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}`;
  }
  if (endsMs && now > endsMs) {
    return `Wygasł ${new Date(endsMs).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}`;
  }
  if (endsMs) {
    return `Aktywny do ${new Date(endsMs).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}`;
  }
  return null;
}
