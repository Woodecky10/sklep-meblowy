"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, EmptyState, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import RichTextEditor from "@/app/admin/_shared/RichTextEditor";
import { createFabric, updateFabric, deleteFabric, type ActionResult } from "./actions";
import { uploadProductImage } from "@/app/admin/produkty/actions";
import { compressIfNeeded } from "@/app/_lib/image-compress";
import { normalizeSearchText } from "@/app/_lib/search-normalize";
import { MAX_FEATURED_PRODUCTS } from "@/app/_lib/fabric-featured-products";
import { FABRIC_PROPERTY_CODES, type FabricPropertyCode } from "@/app/_lib/fabric-properties";
import { useConfirm } from "@/app/_context/ConfirmContext";
import FabricGroupsPanel from "./FabricGroupsPanel";
import type { Fabric, FabricPriceGroup } from "@/app/_lib/types";

// Produkt w pickerze „Meble w tej tkaninie" (lista z page.tsx — tylko aktywne).
export type FabricPickerProduct = { id: string; name: string; image: string | null };

// Podpisy checkboxów w panelu (admin jest wyłącznie po polsku). Podpisy dla
// klienta sklepu żyją w słowniku PL/DE — to dwa różne teksty i tak ma być.
const PROPERTY_LABELS_PL: Record<FabricPropertyCode, string> = {
  waterproof: "Wodoodporna",
  pet_friendly: "Przyjazna zwierzętom",
  easy_clean: "Łatwa w czyszczeniu",
};

export default function FabricsEditor({
  initialFabrics,
  groups,
  pickerProducts,
}: {
  initialFabrics: Fabric[];
  groups: FabricPriceGroup[];
  pickerProducts: FabricPickerProduct[];
}) {
  const confirm = useConfirm();
  const groupById = new Map(groups.map((g) => [g.id, g]));
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

      <FabricGroupsPanel groups={groups} onResult={(res) => handleResult(res)} />

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      {creating && (
        <Card>
          <FabricForm
            mode="create"
            categories={categories}
            groups={groups}
            pickerProducts={pickerProducts}
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
                    {" · "}{groupById.get(f.group_id)?.name ?? "?"}
                    {f.category && ` · ${f.category}`}
                    {f.price > 0 && ` · korekta +${f.price.toFixed(2)} zł`}
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
                    groups={groups}
                    pickerProducts={pickerProducts}
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
  groups,
  pickerProducts,
  onSubmit,
  onCancel,
}: {
  mode: "create" | "update";
  initial?: Fabric;
  categories: string[];
  groups: FabricPriceGroup[];
  pickerProducts: FabricPickerProduct[];
  onSubmit: (fd: FormData) => Promise<void>;
  onCancel: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [rows, setRows] = useState<{ code: string; image: string }[]>(() =>
    (initial?.colors ?? []).map((c) => ({ code: c, image: initial?.color_images?.[c] ?? "" }))
  );
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [description, setDescription] = useState(initial?.description ?? "");
  const [descriptionDe, setDescriptionDe] = useState(initial?.description_de ?? "");
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

  const [selectedIds, setSelectedIds] = useState<string[]>(
    initial?.featured_product_ids ?? []
  );
  const [productQuery, setProductQuery] = useState("");
  const productById = useMemo(
    () => new Map(pickerProducts.map((p) => [p.id, p])),
    [pickerProducts]
  );
  const filteredProducts = useMemo(() => {
    const q = normalizeSearchText(productQuery);
    if (!q) return pickerProducts;
    return pickerProducts.filter((p) => normalizeSearchText(p.name).includes(q));
  }, [pickerProducts, productQuery]);
  function toggleProduct(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id)
        ? prev.filter((x) => x !== id)
        : prev.length >= MAX_FEATURED_PRODUCTS
          ? prev
          : [...prev, id]
    );
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
        <Field label="Grupa cenowa" required>
          <select
            name="group_id"
            defaultValue={initial?.group_id ?? groups.find((g) => g.code === "standard")?.id ?? groups[0]?.id}
            className={inputCls}
          >
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
                {g.surcharge > 0 ? ` (+${g.surcharge.toFixed(2)} zł)` : " (bez dopłaty)"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Korekta ceny (zł)" hint="Doliczana PONAD dopłatę grupy. Zwykle 0.">
          <input name="price" type="number" step="0.01" min="0" defaultValue={initial?.price ?? 0} className={inputCls} />
        </Field>
        <Field label="Kategoria / typ" hint="Do grupowania przy wyborze (np. welur, sztruks). Puste = bez kategorii.">
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
      <Field label="Opis" hint="Pokazywany na stronie tkaniny (/tkaniny). Obsługuje formatowanie.">
        <input type="hidden" name="description" value={description} />
        <RichTextEditor value={description} onChange={setDescription} ariaLabel="Opis tkaniny (PL)" placeholder="Opis tkaniny…" />
      </Field>
      <Field label="Opis (DE)" hint="Puste → na /de pokaże się opis PL.">
        <input type="hidden" name="description_de" value={descriptionDe} />
        <RichTextEditor value={descriptionDe} onChange={setDescriptionDe} ariaLabel="Opis tkaniny (DE)" />
      </Field>
      <Field label="Krótkie info" hint="Krótki tekst w dymku obok „szczegóły” w pickerze (maks. 500 znaków).">
        <textarea
          name="short_info"
          defaultValue={initial?.short_info ?? ""}
          maxLength={500}
          rows={2}
          className={inputCls}
          placeholder="np. Miękki welur, łatwy w czyszczeniu"
        />
      </Field>
      <Field label="Krótkie info (DE)" hint="Puste → na /de pokaże się PL.">
        <textarea
          name="short_info_de"
          defaultValue={initial?.short_info_de ?? ""}
          maxLength={500}
          rows={2}
          className={inputCls}
        />
      </Field>

      {/* Cechy tkaniny — zamknięty zestaw kodów z fabric-properties.ts. Blok
          świadomie NIE używa <Field>: Field renderuje <label>, a <label> w
          <label> to nieprawidłowy HTML (klik w podpis/podpowiedź zaznaczałby
          pierwszy checkbox). Ten sam układ co „Kolory / numery" niżej. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Cechy tkaniny
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Pokazują się klientowi jako plakietki przy wyborze tkaniny. Zaznacz
          tylko to, co potwierdza producent.
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          {FABRIC_PROPERTY_CODES.map((code) => (
            <label key={code} className="inline-flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
              <input
                type="checkbox"
                name="properties"
                value={code}
                defaultChecked={(initial?.properties ?? []).includes(code)}
                className="w-4 h-4 accent-[var(--color-gold)]"
              />
              {PROPERTY_LABELS_PL[code]}
            </label>
          ))}
        </div>
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

      {/* Meble w tej tkaninie — wybór produktów (bez wgrywania zdjęć). Strona
          tkaniny pokazuje je jako siatkę kafelków → /produkt/[id]. */}
      <div className="flex flex-col gap-2">
        <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)]">
          Meble w tej tkaninie
        </span>
        <p className="text-[11px] text-[var(--muted)] -mt-1">
          Wybierz produkty pokazywane w sekcji &bdquo;Meble w tej tkaninie&rdquo;
          na stronie tkaniny (główne zdjęcie + nazwa, klik → karta produktu).
          Kolejność = kolejność dodawania. Max {MAX_FEATURED_PRODUCTS}.
        </p>
        <input
          type="hidden"
          name="featured_product_ids_json"
          readOnly
          value={JSON.stringify(selectedIds)}
        />

        {/* Wybrane (w kolejności wyświetlania) */}
        {selectedIds.length === 0 ? (
          <span className="text-xs text-[var(--muted)] italic">
            Nie wybrano produktów.
          </span>
        ) : (
          <div className="flex flex-col gap-2">
            {selectedIds.map((id) => {
              const p = productById.get(id);
              return (
                <div
                  key={id}
                  className="flex items-center gap-3 bg-[var(--bg)] border border-[var(--border)] rounded-lg p-2"
                >
                  <span className="relative w-16 h-12 shrink-0 rounded-lg overflow-hidden border border-[var(--border)] bg-[var(--card-bg)]">
                    {p?.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-[10px] text-[var(--muted)]">
                        brak
                      </span>
                    )}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">
                    {p?.name ?? "(produkt nieaktywny lub usunięty)"}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleProduct(id)}
                    aria-label="Usuń produkt"
                    className="shrink-0 w-8 h-8 flex items-center justify-center rounded-full text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6 6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Szukaj i dodaj */}
        <input
          value={productQuery}
          onChange={(e) => setProductQuery(e.target.value)}
          placeholder="Szukaj produktu do dodania…"
          className={`${inputCls} mt-1`}
        />
        <ul className="max-h-72 overflow-y-auto border border-[var(--border)] rounded-xl divide-y divide-[var(--border)]">
          {filteredProducts.map((p) => {
            const active = selectedIds.includes(p.id);
            const atLimit = selectedIds.length >= MAX_FEATURED_PRODUCTS;
            return (
              <li key={p.id}>
                <label
                  className={`flex items-center gap-3 p-2 transition-colors ${
                    active
                      ? "bg-[var(--color-gold)]/10 cursor-pointer"
                      : atLimit
                        ? "opacity-50 cursor-not-allowed"
                        : "cursor-pointer hover:bg-[var(--bg)]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={active}
                    disabled={!active && atLimit}
                    onChange={() => toggleProduct(p.id)}
                    className="h-4 w-4 accent-[var(--color-gold)]"
                  />
                  <span className="relative w-10 h-10 shrink-0 rounded-lg overflow-hidden bg-[var(--card-bg)] border border-[var(--border)]">
                    {p.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={p.image} alt="" className="w-full h-full object-cover" />
                    ) : null}
                  </span>
                  <span className="flex-1 min-w-0 truncate text-sm text-[var(--fg)]">
                    {p.name}
                  </span>
                </label>
              </li>
            );
          })}
          {filteredProducts.length === 0 && (
            <li className="p-4 text-xs text-[var(--muted)] italic">Brak dopasowań</li>
          )}
        </ul>
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
