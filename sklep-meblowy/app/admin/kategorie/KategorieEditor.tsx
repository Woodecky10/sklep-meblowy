"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
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
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useConfirm } from "@/app/_context/ConfirmContext";
// Czysty moduł (bez server-only), więc wolno go importować z "use client".
import { warnsAboutMissingGpc } from "@/app/_lib/gpc";
// Czyste helpery — z category-tree, NIE z categories.ts: ten drugi ciągnie
// next/cache, więc import stąd ("use client") wysypałby build.
import {
  buildTree,
  allowedParents,
  reorderSiblings,
  type CategoryNode,
  type CategoryTreeNode,
} from "@/app/_lib/category-tree";
import {
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  type ActionResult,
} from "./actions";

type Counts = Record<string, { own: number; subtree: number }>;

export default function KategorieEditor({
  nodes,
  counts,
}: {
  nodes: CategoryNode[];
  counts: Counts;
}) {
  const [items, setItems] = useState<CategoryNode[]>(nodes);
  // Sync stanu z propów po router.refresh() (ten sam wzorzec co CollectionsEditor).
  const [prevNodes, setPrevNodes] = useState(nodes);
  if (nodes !== prevNodes) {
    setPrevNodes(nodes);
    setItems(nodes);
  }
  const [editingId, setEditingId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  // Poziom, na którym TRWA przeciąganie — zmierzone transformy pokazały, że
  // verticalListSortingStrategy przesuwa tylko karty, a poddrzewa (rodzeństwo
  // karty, poza refem useSortable) zostają na miejscu; przy chwyceniu korzenia
  // "Fotele" nad "Narożniki" karty dostały translate3d(…482px…), (…-156px…),
  // (…-320px…), a ich nierozdzielone poddrzewa nie — więc na ekranie materace
  // wyglądały jak podkategoria Narożników. Zwinięcie dzieci na TYM poziomie na
  // czas przeciągania robi z kart ciągłą kolumnę, którą strategia faktycznie
  // zakłada. `null` = nikt nie przeciąga; obiekt (nie goły `null`) trzeba użyć,
  // bo `parentId` korzeni TEŻ jest `null` — inaczej nie dałoby się odróżnić
  // "nie przeciągam" od "przeciągam najwyższy poziom".
  const [draggingLevel, setDraggingLevel] = useState<{ parentId: string | null } | null>(null);
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

  const tree = buildTree(items);

  // Przeciąganie działa TYLKO wśród rodzeństwa: każdy poziom ma własny
  // SortableContext, a zapis idzie przez reorder_categories(parent, ids).
  // Przenoszenie między gałęziami to pole „Rodzic" w formularzu — świadoma
  // decyzja właściciela (mniej kodu, brak pomyłkowych upuszczeń). Czystą
  // logikę „stan + activeId/overId → nowy stan" liczy reorderSiblings
  // (app/_lib/category-tree.ts, ma własne testy) — tu zostaje tylko stan,
  // rollback i toast.
  function onDragEnd(parentId: string | null) {
    return (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over) return;

      const result = reorderSiblings(items, parentId, String(active.id), String(over.id));
      if (!result) return;

      // Cofnięcie wraca do OSTATNIEGO DOBREGO stanu, nie do propów — inaczej
      // nieudany zapis wymazuje wcześniejsze udane przestawienia.
      const prev = items;
      setItems(result.items);

      startTransition(async () => {
        const res = await reorderCategories(parentId, result.ids);
        if (!res.ok) {
          setItems(prev);
          showToast({ type: "error", message: res.error });
        }
      });
    };
  }

  function renderLevel(siblings: CategoryTreeNode[], parentId: string | null) {
    if (siblings.length === 0) return null;
    // Ten poziom jest zwinięty, gdy przeciąganie trwa NA NIM (parentId się
    // zgadza) — poziomy innych rodziców (w tym rodzic dziecka ciągnący korzeń,
    // i odwrotnie) zostają nietknięte.
    const collapseChildren = draggingLevel !== null && draggingLevel.parentId === parentId;
    const handleDragEnd = onDragEnd(parentId);
    return (
      <DndContext
        id={`categories-dnd-${parentId ?? "root"}`}
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragStart={() => setDraggingLevel({ parentId })}
        onDragEnd={(event) => {
          setDraggingLevel(null);
          handleDragEnd(event);
        }}
        // Escape (i odmontowanie węzła w trakcie ciągnięcia) idą przez
        // onDragCancel, NIE onDragEnd — bez tego handlera dzieci po Escape
        // zostałyby zwinięte na zawsze.
        onDragCancel={() => setDraggingLevel(null)}
      >
        <SortableContext
          items={siblings.map((n) => n.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="flex flex-col gap-2">
            {siblings.map((node) => (
              <TreeRow
                key={node.id}
                node={node}
                counts={counts}
                expanded={editingId === node.id}
                onToggleExpand={() =>
                  setEditingId(editingId === node.id ? null : node.id)
                }
                onEdit={async (fd) => {
                  const res = await updateCategory(fd);
                  handleResult(res, () => {
                    setEditingId(null);
                    router.refresh();
                  });
                }}
                onDelete={async () => {
                  const fd = new FormData();
                  fd.set("id", node.id);
                  const res = await deleteCategory(fd);
                  handleResult(res, () => router.refresh());
                }}
                onAddChild={() => setCreatingUnder(node.id)}
                allParents={allowedParents(items, node.id)}
                allCategories={items}
              >
                {!collapseChildren && renderLevel(node.children, node.id)}
                {creatingUnder === node.id && (
                  <Card>
                    <CategoryForm
                      mode="create"
                      parentId={node.id}
                      allParents={allowedParents(items, "")}
                      allCategories={items}
                      onCancel={() => setCreatingUnder(undefined)}
                      onSubmit={async (fd) => {
                        const res = await createCategory(fd);
                        handleResult(res, () => {
                          setCreatingUnder(undefined);
                          router.refresh();
                        });
                      }}
                    />
                  </Card>
                )}
              </TreeRow>
            ))}
          </div>
        </SortableContext>
      </DndContext>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Kategorie</h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Kategorie tworzą drzewo bez limitu głębokości. Pozycje najwyższego poziomu to
            zakładki w górnym menu sklepu, a pod nimi widać dwa kolejne poziomy.
            Głębsze podkategorie klient znajdzie na stronie kategorii, nad produktami.
            Przeciągaj chwytem, żeby zmienić kolejność w obrębie jednego rodzica;
            żeby przenieść gałąź gdzie indziej, użyj pola „Rodzic” w edycji.
          </p>
        </div>
        <button
          onClick={() => {
            setCreatingUnder(null);
            setEditingId(null);
          }}
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          + Nowa pozycja menu
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creatingUnder === null && (
        <Card>
          <CategoryForm
            mode="create"
            parentId={null}
            allParents={allowedParents(items, "")}
            allCategories={items}
            onCancel={() => setCreatingUnder(undefined)}
            onSubmit={async (fd) => {
              const res = await createCategory(fd);
              handleResult(res, () => {
                setCreatingUnder(undefined);
                router.refresh();
              });
            }}
          />
        </Card>
      )}

      {items.length === 0 ? (
        <EmptyState message="Brak kategorii. Dodaj pierwszą pozycję menu, żeby zacząć." />
      ) : (
        renderLevel(tree, null)
      )}
    </div>
  );
}

function TreeRow({
  node,
  counts,
  expanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddChild,
  allParents,
  allCategories,
  children,
}: {
  node: CategoryTreeNode;
  counts: Counts;
  expanded: boolean;
  onToggleExpand: () => void;
  onEdit: (fd: FormData) => Promise<void>;
  onDelete: () => Promise<void>;
  onAddChild: () => void;
  allParents: { id: string; label: string; depth: number }[];
  // Kandydaci do cross-sellu — CAŁE drzewo, bo cross-sell nie ma nic wspólnego
  // z hierarchią (łóżko wskazuje materace z zupełnie innej gałęzi).
  allCategories: CategoryNode[];
  children?: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: node.id });
  const [pendingDelete, startDeleteTransition] = useTransition();
  const confirm = useConfirm();

  // useSortable mierzy DOKŁADNIE ten element, na którym siedzi ref — musi
  // opakowywać TYLKO kartę wiersza, nigdy {children} (całe zagnieżdżone
  // poddrzewo). Inaczej closestCenter liczyłby środek kolizji do środka
  // WYSOKOŚCI CAŁEGO poddrzewa węzła z wieloma dziećmi, nie do środka jego
  // widocznego nagłówka — przeciąganie krótkiego węzła nad rozbudowaną
  // gałęzią celowałoby w złe miejsce.
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
    marginLeft: node.depth * 24,
  };

  const c = counts[node.slug] ?? { own: 0, subtree: 0 };

  // Produkty tej kategorii wychodzą do katalogu (Google/Pinterest) bez pola
  // `google_product_category`. Ostrzeżenie stoi TUTAJ, a nie tylko w logach
  // serwera, bo to właścicielka zakłada kategorie — a dowiadywała się
  // o problemie dopiero z panelu katalogu, dobę później.
  const bezKategoriiGoogle = warnsAboutMissingGpc(allCategories, node.slug, c.own);

  return (
    <div>
      <div
        ref={setNodeRef}
        style={style}
        className="border border-[var(--border)] rounded-xl bg-[var(--card-bg)]"
      >
        <div className="flex items-center gap-3 p-3 flex-wrap">
          <button
            {...attributes}
            {...listeners}
            aria-label={`Przeciągnij żeby zmienić kolejność: ${node.label}`}
            className="shrink-0 w-8 h-8 flex items-center justify-center text-[var(--muted)] hover:text-[var(--fg)] cursor-grab active:cursor-grabbing"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.5" />
              <circle cx="15" cy="6" r="1.5" />
              <circle cx="9" cy="12" r="1.5" />
              <circle cx="15" cy="12" r="1.5" />
              <circle cx="9" cy="18" r="1.5" />
              <circle cx="15" cy="18" r="1.5" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <p className="font-semibold text-[var(--fg)] truncate">
              {node.label}
              {!node.active && (
                <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                  (ukryta)
                </span>
              )}
              {bezKategoriiGoogle && (
                <span
                  title="Produkty z tej kategorii trafiają do Google i Pinteresta bez kategorii produktowej, co ogranicza ich widoczność. Przenieś kategorię pod istniejącą gałąź (np. Sofy, Łóżka, Materace) albo poproś o dopisanie jej odpowiednika."
                  className="ml-2 align-middle inline-block px-2 py-0.5 rounded-full text-[10px] font-sans font-normal uppercase tracking-widest bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                >
                  bez kategorii Google
                </span>
              )}
            </p>
            <p className="text-xs text-[var(--muted)]">
              slug: <code>{node.slug}</code> · {c.own}{" "}
              {c.own === 1 ? "własny produkt" : "własnych produktów"}
              {c.subtree !== c.own && ` · ${c.subtree} w poddrzewie`}
            </p>
          </div>

          <button
            onClick={onAddChild}
            className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] rounded-full text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            + Podkategoria
          </button>
          <button
            onClick={onToggleExpand}
            className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] rounded-full text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
          >
            {expanded ? "Zamknij" : "Edytuj"}
          </button>
          <button
            disabled={pendingDelete}
            onClick={async () => {
              const ok = await confirm({
                title: `Usunąć kategorię „${node.label}"?`,
                message: "Tej operacji nie można cofnąć.",
                danger: true,
              });
              if (!ok) return;
              startDeleteTransition(async () => {
                await onDelete();
              });
            }}
            className="shrink-0 px-3 py-1.5 text-xs font-sans uppercase tracking-widest text-red-600 hover:text-red-700 transition-colors disabled:opacity-50"
          >
            Usuń
          </button>
        </div>

        {expanded && (
          <div className="border-t border-[var(--border)] p-4">
            <CategoryForm
              mode="update"
              initial={node}
              parentId={node.parent_id}
              allParents={allParents}
              allCategories={allCategories}
              onCancel={onToggleExpand}
              onSubmit={onEdit}
            />
          </div>
        )}
      </div>

      {children && <div className="mt-2 flex flex-col gap-2">{children}</div>}
    </div>
  );
}

function CategoryForm({
  mode,
  initial,
  parentId,
  allParents,
  allCategories,
  onCancel,
  onSubmit,
}: {
  mode: "create" | "update";
  initial?: CategoryNode;
  parentId: string | null;
  allParents: { id: string; label: string; depth: number }[];
  allCategories: CategoryNode[];
  onCancel: () => void;
  onSubmit: (fd: FormData) => Promise<void>;
}) {
  const [pending, startFormTransition] = useTransition();

  // Cross-sell przenoszony 1:1 z dzisiejszego formularza (ukryty checkbox
  // w stylizowanym <label>). NIE zmieniaj tu mechaniki — patrz ostrzeżenie
  // pod tym blokiem kodu.
  const [crossSell, setCrossSell] = useState<string[]>(
    initial?.crossSellCategories ?? []
  );

  // Kandydaci: całe drzewo oprócz edytowanego węzła, alfabetycznie.
  const candidates = allCategories
    .filter((c) => c.id !== initial?.id)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label, "pl"));

  function toggleCrossSell(slug: string) {
    setCrossSell((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  return (
    <form
      onSubmit={(e) => {
        // preventDefault + onSubmit, NIE <form action={fn}>: React 19 po akcji
        // formularza robi form.reset(), który cofa niekontrolowane <select>
        // do wartości z mountu (regresja opisana w e2e/product-category-save).
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startFormTransition(async () => {
          await onSubmit(fd);
        });
      }}
      className="flex flex-col gap-4"
    >
      {mode === "update" && <input type="hidden" name="id" defaultValue={initial?.id} />}

      <Field label="Nazwa wyświetlana" required>
        <input name="label" defaultValue={initial?.label ?? ""} required className={inputCls} />
      </Field>

      <Field label="Nazwa po niemiecku (DE)" hint="Puste = pokaże się polska">
        <input name="label_de" defaultValue={initial?.label_de ?? ""} className={inputCls} />
      </Field>

      {/* hint w nawiasach klamrowych, NIE w cudzysłowie: tekst sam zawiera
          cudzysłowy i zamknąłby atrybut. */}
      <Field
        label="Rodzic"
        hint={
          "„Najwyższy poziom” = zakładka w górnym menu. Lista nie zawiera tej kategorii ani jej podkategorii."
        }
      >
        <select name="parent_id" defaultValue={parentId ?? ""} className={inputCls}>
          <option value="">— najwyższy poziom —</option>
          {allParents.map((p) => (
            <option key={p.id} value={p.id}>
              {" ".repeat(p.depth * 4)}
              {p.label}
            </option>
          ))}
        </select>
      </Field>

      {mode === "create" && (
        <Field label="Slug (link)" hint="Zostaw puste — wygeneruje się z nazwy">
          <input name="slug" className={inputCls} />
        </Field>
      )}

      <Field label="Kolejność" hint="Mniejsze na początku. Zwykle wygodniej przeciągnąć.">
        <input
          name="sort_order"
          type="number"
          defaultValue={initial?.sort_order ?? 0}
          className={inputCls}
        />
      </Field>

      {mode === "update" && (
        <label className="flex items-start gap-3 text-sm text-[var(--fg)]">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={initial?.active ?? true}
            className="mt-1"
          />
          <span>
            Pokazuj w sklepie
            <span className="block text-xs text-[var(--muted)]">
              ⚠️ Odznaczenie chowa z menu, filtrów i mapy strony CAŁE poddrzewo tej
              kategorii — razem ze wszystkimi podkategoriami. Produkty zostają
              dostępne w sklepie i w wyszukiwarce.
            </span>
          </span>
        </label>
      )}

      {candidates.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Polecaj klientom z tych kategorii (cross-sell)
          </span>
          <p className="text-xs text-[var(--muted)] leading-snug">
            Klient kupuje produkt z tej kategorii → w koszyku i na karcie produktu
            pokażemy mu produkty z zaznaczonych kategorii poniżej.
          </p>
          {/* Hidden input gwarantujący, że FormData zna ten klucz nawet gdy lista
              jest pusta (server zinterpretuje getAll() = []) */}
          {crossSell.length === 0 && (
            <input type="hidden" name="cross_sell_categories" value="" />
          )}
          <div className="flex flex-wrap gap-2">
            {candidates.map((c) => {
              const active = crossSell.includes(c.slug);
              return (
                <label
                  key={c.slug}
                  className={`px-3 py-1.5 text-xs font-sans rounded-full border cursor-pointer transition-colors ${
                    active
                      ? "bg-[var(--color-gold)] text-[var(--color-navy)] border-[var(--color-gold)]"
                      : "border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    name="cross_sell_categories"
                    value={c.slug}
                    checked={active}
                    onChange={() => toggleCrossSell(c.slug)}
                    className="hidden"
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {mode === "create" ? "Dodaj kategorię" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-5 py-2.5 text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}
