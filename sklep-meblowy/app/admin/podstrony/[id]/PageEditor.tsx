"use client";

// Edytor podstrony: ustawienia (tytuł/adres/SEO/publikacja) + sekcje-bloki.
// Mechanika wierszy bloków to świadomy bliźniak gałęzi treściowej
// BlocksEditor (home) — bez bloków systemowych; wydzielenie wspólnego
// komponentu odłożone, żeby nie ruszać działającego edytora home.

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { updatePageMeta, togglePagePublished } from "../actions";
import {
  reorderPageBlocks,
  togglePageBlockVisible,
  deleteContentBlock,
} from "@/app/admin/strona-glowna/actions";
import AddBlockModal from "@/app/admin/strona-glowna/AddBlockModal";
import {
  BannerForm,
  GalleryForm,
  FaqForm,
  ReviewsForm,
  ProductsForm,
  cs,
  type BlockPickerData,
} from "@/app/admin/strona-glowna/BlockForms";
import {
  CONTENT_BLOCK_DEFS,
  isContentBlockType,
  type PageBlockRow,
} from "@/app/_lib/blocks";
import type { PageRow } from "@/app/_lib/pages";
import type { ActionResult } from "@/app/_lib/types";
import { Card, ToastView, Field, inputCls, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

export default function PageEditor({
  initialPage,
  initialBlocks,
  picker,
}: {
  initialPage: PageRow;
  initialBlocks: PageBlockRow[];
  picker: BlockPickerData;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  const [prevInitial, setPrevInitial] = useState(initialBlocks);
  if (initialBlocks !== prevInitial) {
    setPrevInitial(initialBlocks);
    setBlocks(initialBlocks);
  }
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }
  function handleResult(result: ActionResult, onSuccess?: () => void) {
    if (result.ok) {
      showToast({ type: "success", message: result.message ?? "Zapisano" });
      onSuccess?.();
      router.refresh();
    } else {
      showToast({ type: "error", message: result.error });
    }
  }

  // ── Bloki: mechanika 1:1 z BlocksEditor (gałąź treściowa) ────────────────
  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= blocks.length) return;
    const next = [...blocks];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = blocks;
    setBlocks(next);
    startTransition(async () => {
      const res = await reorderPageBlocks(next.map((b) => b.id));
      if (!res.ok) {
        setBlocks(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  function toggleVisible(b: PageBlockRow) {
    const fd = new FormData();
    fd.set("id", b.id);
    fd.set("visible", b.visible ? "0" : "1");
    const prev = blocks;
    setBlocks(blocks.map((x) => (x.id === b.id ? { ...x, visible: !x.visible } : x)));
    startTransition(async () => {
      const res = await togglePageBlockVisible(fd);
      if (!res.ok) {
        setBlocks(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  async function remove(b: PageBlockRow) {
    const meta = isContentBlockType(b.block_type) ? CONTENT_BLOCK_DEFS[b.block_type] : null;
    if (!meta) return;
    const ok = await confirm({
      message: `Usunąć sekcję „${meta.name}"? Tej operacji nie można cofnąć.`,
      danger: true,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", b.id);
    startTransition(async () => {
      handleResult(await deleteContentBlock(fd));
    });
  }

  function togglePublished() {
    const fd = new FormData();
    fd.set("id", initialPage.id);
    fd.set("published", initialPage.published ? "0" : "1");
    startTransition(async () => {
      handleResult(await togglePagePublished(fd));
    });
  }

  return (
    <div className="max-w-4xl mx-auto flex flex-col gap-6">
      <div>
        <Link
          href="/admin/podstrony"
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Podstrony
        </Link>
        <div className="flex items-center gap-3 flex-wrap mt-2">
          <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
            {initialPage.title}
          </h1>
          <span
            className={`px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest ${
              initialPage.published
                ? "bg-[var(--color-gold)]/15 text-[var(--color-gold-text)]"
                : "bg-[var(--border)] text-[var(--muted)]"
            }`}
          >
            {initialPage.published ? "Opublikowana" : "Szkic"}
          </span>
          <a
            href={`/${initialPage.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
          >
            Podgląd ↗
          </a>
          <button
            type="button"
            onClick={togglePublished}
            disabled={isPending}
            className="px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors disabled:opacity-60"
          >
            {initialPage.published ? "Cofnij do szkicu" : "Opublikuj"}
          </button>
        </div>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <Card>
        <MetaForm page={initialPage} onResult={handleResult} />
      </Card>

      <h2 className="font-display text-xl font-semibold text-[var(--fg)]">
        Sekcje strony
      </h2>
      {blocks.length === 0 && (
        <p className="text-sm text-[var(--muted)] italic">
          Strona nie ma jeszcze sekcji — dodaj pierwszą poniżej.
        </p>
      )}
      <div className="flex flex-col gap-4" data-guard-section>
        {blocks.map((b, i) => {
          const meta = isContentBlockType(b.block_type)
            ? CONTENT_BLOCK_DEFS[b.block_type]
            : null;
          if (!meta) return null;
          const expanded = expandedId === b.id;
          return (
            <Card key={b.id}>
              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || isPending}
                    aria-label={`Przesuń sekcję ${meta.name} wyżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1 || isPending}
                    aria-label={`Przesuń sekcję ${meta.name} niżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className={`font-display text-lg font-semibold ${b.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                      {meta.name}
                    </p>
                    {!b.visible && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest bg-[var(--border)] text-[var(--muted)]">
                        Ukryta
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[var(--muted)]">
                    {cs(b.content.heading) || "(bez nagłówka)"}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={b.visible}
                  aria-label={`Widoczność sekcji ${meta.name}`}
                  onClick={() => toggleVisible(b)}
                  disabled={isPending}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${b.visible ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}
                >
                  <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${b.visible ? "left-[22px]" : "left-0.5"}`} />
                </button>
                <button
                  type="button"
                  onClick={() => remove(b)}
                  disabled={isPending}
                  className="shrink-0 px-3 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-60"
                >
                  Usuń
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : b.id)}
                  aria-expanded={expanded}
                  aria-label={`Edytuj treść sekcji ${meta.name}`}
                  className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] shrink-0"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform ${expanded ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
                </button>
              </div>
              {expanded && (
                <div className="mt-6 pt-6 border-t border-[var(--border)]">
                  {b.block_type === "banner" && <BannerForm block={b} onResult={handleResult} />}
                  {b.block_type === "gallery" && <GalleryForm block={b} onResult={handleResult} />}
                  {b.block_type === "faq" && <FaqForm block={b} onResult={handleResult} />}
                  {b.block_type === "reviews" && <ReviewsForm block={b} onResult={handleResult} />}
                  {b.block_type === "products" && <ProductsForm block={b} onResult={handleResult} picker={picker} />}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="self-start px-5 py-2.5 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-xs uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj sekcję
      </button>

      {addOpen && (
        <AddBlockModal
          pageId={initialPage.id}
          onClose={() => setAddOpen(false)}
          onResult={handleResult}
        />
      )}
    </div>
  );
}

// Ustawienia strony — uncontrolled form z FormData (wzorzec SystemHeadingsForm).
function MetaForm({
  page,
  onResult,
}: {
  page: PageRow;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startTransition] = useTransition();

  function submit(formData: FormData) {
    startTransition(async () => {
      onResult(await updatePageMeta(formData));
    });
  }

  return (
    <form action={submit} className="flex flex-col gap-4">
      <h2 className="font-display text-lg font-semibold text-[var(--fg)]">
        Ustawienia strony
      </h2>
      <input type="hidden" name="id" value={page.id} />
      <input type="hidden" name="prev_slug" value={page.slug} />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Tytuł" required>
          <input name="title" defaultValue={page.title} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Tytuł (DE)">
          <input name="title_de" defaultValue={page.title_de ?? ""} maxLength={200} className={inputCls} />
        </Field>
        <Field label="Adres strony (po sklep.pl/)">
          <input name="slug" defaultValue={page.slug} maxLength={100} className={`${inputCls} font-mono`} />
        </Field>
        <p className="text-xs text-[var(--muted)] self-end pb-3">
          Małe litery, cyfry i myślniki. Zmiana adresu zmienia link do strony —
          stary przestanie działać.
        </p>
        <Field label="Opis dla wyszukiwarek (SEO)">
          <textarea name="seo_description" defaultValue={page.seo_description ?? ""} rows={2} maxLength={300} className={inputCls} />
        </Field>
        <Field label="Opis SEO (DE)">
          <textarea name="seo_description_de" defaultValue={page.seo_description_de ?? ""} rows={2} maxLength={300} className={inputCls} />
        </Field>
      </div>
      <button
        type="submit"
        disabled={saving}
        data-guard-save
        className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
      >
        {saving ? "Zapisuję..." : "Zapisz ustawienia"}
      </button>
    </form>
  );
}
