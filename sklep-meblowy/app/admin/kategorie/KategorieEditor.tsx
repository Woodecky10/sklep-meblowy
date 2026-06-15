"use client";

import { useState, useTransition } from "react";
import { Card, EmptyState, Field, ToastView } from "@/app/admin/_shared";
import type { Section, CategoryDef } from "@/app/_lib/categories";
import {
  createGroup,
  updateGroup,
  deleteGroup,
  createCategory,
  updateCategory,
  deleteCategory,
  type ActionResult,
} from "./actions";

type Props = {
  sections: Section[];
  categories: CategoryDef[];
  productCounts: Record<string, number>;
};

type Toast = { type: "success" | "error"; message: string } | null;

export default function KategorieEditor({
  sections,
  categories,
  productCounts,
}: Props) {
  const [toast, setToast] = useState<Toast>(null);
  const [openGroupForm, setOpenGroupForm] = useState<string | null>(null);
  const [openCategoryForm, setOpenCategoryForm] = useState<string | null>(null);
  const [openNewCategoryForGroup, setOpenNewCategoryForGroup] = useState<string | null>(null);
  const [openNewGroup, setOpenNewGroup] = useState(false);

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

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Mollien
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
            Kategorie
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
            Zarządzaj grupami i kategoriami widocznymi w nawigacji sklepu.
            Zmiany zapisują się od razu — sklep odświeży się przy następnej wizycie klienta.
          </p>
        </div>
        <button
          onClick={() => setOpenNewGroup(true)}
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          + Nowa grupa
        </button>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {/* Formularz nowej grupy */}
      {openNewGroup && (
        <Card>
          <GroupForm
            mode="create"
            onCancel={() => setOpenNewGroup(false)}
            onSubmit={async (fd) => {
              const res = await createGroup(fd);
              handleResult(res, () => setOpenNewGroup(false));
            }}
          />
        </Card>
      )}

      {/* Lista grup z kategoriami */}
      {sections.length === 0 ? (
        <EmptyState message="Brak grup. Dodaj pierwszą żeby zacząć." />
      ) : (
        <div className="flex flex-col gap-6">
          {sections.map((section) => {
            const sectionCategories = categories.filter(
              (c) => c.group_id === section.id
            );
            return (
              <Card key={section.id}>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h2 className="font-display text-xl font-semibold text-[var(--fg)] flex items-center gap-3">
                      {section.label}
                      {!section.active && (
                        <span className="px-2 py-0.5 bg-stone-200 dark:bg-stone-800 text-[var(--muted)] text-[10px] font-sans uppercase tracking-widest rounded-full">
                          ukryta
                        </span>
                      )}
                    </h2>
                    <p className="text-xs font-sans text-[var(--muted)] mt-1">
                      slug: <code>{section.slug}</code> · kolejność: {section.sort_order} ·{" "}
                      {sectionCategories.length} kategorii
                    </p>
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <button
                      onClick={() =>
                        setOpenGroupForm(openGroupForm === section.id ? null : section.id)
                      }
                      className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                    >
                      Edytuj
                    </button>
                    <DeleteButton
                      label="Usuń"
                      confirmMessage={`Usunąć grupę "${section.label}"? Tej operacji nie da się cofnąć.`}
                      onConfirm={async () => {
                        const fd = new FormData();
                        fd.set("id", section.id);
                        const res = await deleteGroup(fd);
                        handleResult(res);
                      }}
                    />
                  </div>
                </div>

                {/* Edycja istniejącej grupy */}
                {openGroupForm === section.id && (
                  <div className="mb-4 p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                    <GroupForm
                      mode="update"
                      initial={section}
                      onCancel={() => setOpenGroupForm(null)}
                      onSubmit={async (fd) => {
                        const res = await updateGroup(fd);
                        handleResult(res, () => setOpenGroupForm(null));
                      }}
                    />
                  </div>
                )}

                {/* Lista kategorii w grupie */}
                <div className="flex flex-col gap-2">
                  {sectionCategories.length === 0 ? (
                    <p className="text-sm text-[var(--muted)] italic py-2">
                      Brak kategorii w tej grupie
                    </p>
                  ) : (
                    sectionCategories.map((cat) => {
                      const productCount = productCounts[cat.slug] ?? 0;
                      const editing = openCategoryForm === cat.id;
                      return (
                        <div key={cat.id}>
                          <div
                            className={`flex items-center justify-between gap-3 px-4 py-3 border border-[var(--border)] rounded-xl ${
                              cat.active ? "bg-[var(--bg)]" : "bg-stone-100 dark:bg-stone-900 opacity-60"
                            }`}
                          >
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-sans font-semibold text-[var(--fg)] truncate">
                                {cat.label}
                                {!cat.active && (
                                  <span className="ml-2 text-[10px] uppercase tracking-widest text-[var(--muted)]">
                                    (ukryta)
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-[var(--muted)] truncate">
                                <code>{cat.slug}</code> · {productCount}{" "}
                                {productCount === 1 ? "produkt" : "produktów"}
                                {cat.baselinkerCategoryId !== null && (
                                  <> · BL: {cat.baselinkerCategoryId}</>
                                )}
                              </p>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                onClick={() =>
                                  setOpenCategoryForm(editing ? null : cat.id)
                                }
                                className="px-3 py-1.5 text-xs font-sans uppercase tracking-widest border border-[var(--border)] text-[var(--fg)] rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
                              >
                                Edytuj
                              </button>
                              <DeleteButton
                                label="Usuń"
                                disabled={productCount > 0}
                                disabledTitle={
                                  productCount > 0
                                    ? `Nie można usunąć — kategoria ma ${productCount} ${
                                        productCount === 1 ? "produkt" : "produktów"
                                      }`
                                    : undefined
                                }
                                confirmMessage={`Usunąć kategorię "${cat.label}"?`}
                                onConfirm={async () => {
                                  const fd = new FormData();
                                  fd.set("id", cat.id);
                                  const res = await deleteCategory(fd);
                                  handleResult(res);
                                }}
                              />
                            </div>
                          </div>
                          {editing && (
                            <div className="mt-2 p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                              <CategoryForm
                                mode="update"
                                initial={cat}
                                groups={sections}
                                allCategories={categories}
                                onCancel={() => setOpenCategoryForm(null)}
                                onSubmit={async (fd) => {
                                  const res = await updateCategory(fd);
                                  handleResult(res, () => setOpenCategoryForm(null));
                                }}
                              />
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>

                {/* Dodawanie nowej kategorii do grupy */}
                {openNewCategoryForGroup === section.id ? (
                  <div className="mt-3 p-4 bg-[var(--bg)] border border-[var(--border)] rounded-xl">
                    <CategoryForm
                      mode="create"
                      defaultGroupId={section.id}
                      groups={sections}
                      allCategories={categories}
                      onCancel={() => setOpenNewCategoryForGroup(null)}
                      onSubmit={async (fd) => {
                        const res = await createCategory(fd);
                        handleResult(res, () => setOpenNewCategoryForGroup(null));
                      }}
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setOpenNewCategoryForGroup(section.id)}
                    className="self-start mt-3 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline"
                  >
                    + Dodaj kategorię do tej grupy
                  </button>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Formularz grupy
// ============================================================

function GroupForm({
  mode,
  initial,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Section;
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="flex flex-col gap-3"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Field label="Nazwa wyświetlana" required>
          <input
            name="label"
            defaultValue={initial?.label ?? ""}
            required
            minLength={2}
            placeholder="np. Salon"
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>

        <Field
          label="Nazwa po niemiecku (DE)"
          hint="Pokazywana w niemieckiej wersji sklepu. Zostaw puste = polska nazwa."
        >
          <input
            name="label_de"
            defaultValue={initial?.label_de ?? ""}
            placeholder="np. Wohnzimmer"
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>

        {mode === "create" && (
          <Field label="Slug (link)" hint="Zostaw puste żeby wygenerować z nazwy">
            <input
              name="slug"
              placeholder="np. salon"
              className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
            />
          </Field>
        )}

        <Field label="Kolejność" hint="Mniejsze na początku">
          <input
            type="number"
            name="sort_order"
            defaultValue={initial?.sort_order ?? 0}
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>
      </div>

      {mode === "update" && initial && (
        <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={initial.active}
            className="h-4 w-4 accent-[var(--color-gold)]"
          />
          <span>Pokazuj w nawigacji</span>
        </label>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : mode === "create" ? "Dodaj grupę" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-5 py-2 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Formularz kategorii
// ============================================================

function CategoryForm({
  mode,
  initial,
  defaultGroupId,
  groups,
  allCategories,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: CategoryDef;
  defaultGroupId?: string;
  groups: Section[];
  allCategories: CategoryDef[];
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [crossSell, setCrossSell] = useState<string[]>(initial?.crossSellCategories ?? []);

  // Inne kategorie (oprócz aktualnie edytowanej) jako kandydatów do cross-sell.
  const candidates = allCategories
    .filter((c) => c.id !== initial?.id)
    .slice()
    .sort((a, b) => a.label.localeCompare(b.label));

  function toggle(slug: string) {
    setCrossSell((prev) =>
      prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug]
    );
  }

  return (
    <form
      action={(fd) => startTransition(() => onSubmit(fd))}
      className="flex flex-col gap-3"
    >
      {initial && <input type="hidden" name="id" value={initial.id} />}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Field label="Nazwa wyświetlana" required>
          <input
            name="label"
            defaultValue={initial?.label ?? ""}
            required
            minLength={2}
            placeholder="np. Sofa 3-osobowa"
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>

        <Field
          label="Nazwa po niemiecku (DE)"
          hint="Pokazywana w niemieckiej wersji sklepu. Zostaw puste = polska nazwa."
        >
          <input
            name="label_de"
            defaultValue={initial?.label_de ?? ""}
            placeholder="np. 3-Sitzer-Sofa"
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>

        <Field label="Grupa" required>
          <select
            name="group_id"
            defaultValue={initial?.group_id ?? defaultGroupId ?? ""}
            required
            className="w-full px-3 py-2 bg-[var(--card-bg)] border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          >
            <option value="">— wybierz grupę —</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.label}
              </option>
            ))}
          </select>
        </Field>

        {mode === "create" && (
          <Field label="Slug (link)" hint="Zostaw puste żeby wygenerować z nazwy">
            <input
              name="slug"
              placeholder="np. sofa-3-osobowa"
              className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
            />
          </Field>
        )}

        <Field
          label="ID kategorii w BaseLinker"
          hint="Opcjonalne. Sprawdź ID w panelu BL → Magazyn → Kategorie. Bez tego sync produktów BL pominie tę kategorię."
        >
          <input
            type="number"
            name="baselinker_category_id"
            defaultValue={initial?.baselinkerCategoryId ?? ""}
            min={1}
            placeholder="np. 7489757"
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>

        <Field label="Kolejność" hint="Mniejsze na początku">
          <input
            type="number"
            name="sort_order"
            defaultValue={initial?.sort_order ?? 0}
            className="w-full px-3 py-2 bg-transparent border border-[var(--border)] rounded-lg text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)]"
          />
        </Field>
      </div>

      {mode === "update" && initial && (
        <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
          <input
            type="checkbox"
            name="active"
            value="1"
            defaultChecked={initial.active}
            className="h-4 w-4 accent-[var(--color-gold)]"
          />
          <span>Pokazuj w sklepie</span>
        </label>
      )}

      {/* Cross-sell — multi-select kategorii polecanych */}
      {candidates.length > 0 && (
        <div className="flex flex-col gap-2 pt-2 border-t border-[var(--border)]">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
            Polecaj klientom z tych kategorii (cross-sell)
          </span>
          <p className="text-xs text-[var(--muted)] leading-snug">
            Klient kupuje produkt z tej kategorii → w koszyku i na karcie
            produktu pokażemy mu produkty z zaznaczonych kategorii poniżej.
          </p>
          {/* Hidden input gwarantujący że FormData zna ten klucz nawet
              gdy lista jest pusta (server zinterpretuje getAll() = []) */}
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
                    onChange={() => toggle(c.slug)}
                    className="hidden"
                  />
                  {c.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="px-5 py-2 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {pending ? "Zapisuję..." : mode === "create" ? "Dodaj kategorię" : "Zapisz"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={pending}
          className="px-5 py-2 border border-[var(--border)] text-[var(--fg)] font-sans text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] transition-colors"
        >
          Anuluj
        </button>
      </div>
    </form>
  );
}

// ============================================================
// Pomocnicze komponenty
// ============================================================

function DeleteButton({
  label,
  confirmMessage,
  onConfirm,
  disabled,
  disabledTitle,
}: {
  label: string;
  confirmMessage: string;
  onConfirm: () => Promise<void>;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <button
      type="button"
      disabled={disabled || pending}
      title={disabledTitle}
      onClick={() => {
        if (disabled) return;
        if (!window.confirm(confirmMessage)) return;
        startTransition(() => onConfirm());
      }}
      className={`px-3 py-1.5 text-xs font-sans uppercase tracking-widest rounded-full transition-colors ${
        disabled
          ? "border border-[var(--border)] text-[var(--muted)] opacity-50 cursor-not-allowed"
          : "border border-red-300 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
      }`}
    >
      {pending ? "..." : label}
    </button>
  );
}

