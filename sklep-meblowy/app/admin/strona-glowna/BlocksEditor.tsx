"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  updateSystemBlockHeadings,
  togglePageBlockVisible,
  deleteContentBlock,
  reorderPageBlocks,
} from "./actions";
import AddBlockModal from "./AddBlockModal";
import {
  BannerForm,
  GalleryForm,
  FaqForm,
  ReviewsForm,
  ProductsForm,
  type BlockPickerData,
  cs,
} from "./BlockForms";
import TrustItemsEditor from "./TrustItemsEditor";
import SiteTextsCard from "./SiteTextsCard";
import {
  CONTENT_BLOCK_DEFS,
  isSystemBlockType,
  isContentBlockType,
  type PageBlockRow,
  type SystemBlockType,
} from "@/app/_lib/blocks";
import type { TrustItemRow } from "@/app/_lib/trust-items";
import type { SiteTextsMap } from "@/app/_lib/site-texts";
import type { ActionResult } from "@/app/_lib/types";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

// Metadane bloków SYSTEMOWYCH — skopiowane 1:1 ze starego SECTION_META
// (HomeSectionsEditor.tsx). PL-only, panel admina.
const SYSTEM_META: Record<
  SystemBlockType,
  { name: string; desc: string; contentHref?: string; contentCta?: string; hasHeadings: boolean }
> = {
  hero: {
    name: "Slider (hero)",
    desc: "Duży baner na górze strony. Treść slajdów edytujesz w osobnym edytorze.",
    contentHref: "/admin/slider",
    contentCta: "Edytuj slajdy",
    hasHeadings: false,
  },
  tiles: {
    name: "Kafelki „Znajdź swój styl”",
    desc: "Siatka kafelków z linkami do kolekcji/kategorii.",
    contentHref: "/admin/kafelki",
    contentCta: "Edytuj kafelki",
    hasHeadings: true,
  },
  featured: {
    name: "Polecane produkty",
    desc: "Ręcznie wybrane produkty z badge'ami.",
    contentHref: "/admin/polecane",
    contentCta: "Edytuj polecane",
    hasHeadings: true,
  },
  trust_bar: {
    name: "Pasek zaufania",
    desc: "Atuty sklepu (Polski producent, Darmowa dostawa itd.).",
    hasHeadings: true,
  },
  collections: {
    name: "Nasze kolekcje",
    desc: "Automatyczna mozaika kolekcji, które mają produkty.",
    contentHref: "/admin/kolekcje",
    contentCta: "Edytuj kolekcje",
    hasHeadings: true,
  },
};

export default function BlocksEditor({
  initialBlocks,
  initialTrustItems,
  initialSiteTexts,
  picker,
}: {
  initialBlocks: PageBlockRow[];
  initialTrustItems: TrustItemRow[];
  initialSiteTexts: SiteTextsMap;
  picker: BlockPickerData;
}) {
  const router = useRouter();
  const [blocks, setBlocks] = useState(initialBlocks);
  // Sync stanu z propów po router.refresh() (wzorzec TilesEditor/HomeSectionsEditor).
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

  // Strzałki ↑/↓: optymistyczna zamiana + rollback do stanu sprzed próby.
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
    // Optymistycznie przełącz lokalnie.
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
      const res = await deleteContentBlock(fd);
      handleResult(res);
    });
  }

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Strona główna</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Ułóż sekcje strony głównej: zmieniaj kolejność strzałkami, ukrywaj
          przełącznikiem, edytuj nagłówki (polski i niemiecki). Dodawaj własne
          sekcje (tekst ze zdjęciem, galerię, FAQ, opinie, dodatkowe produkty)
          przyciskiem „+ Dodaj sekcję”.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-col gap-4" data-guard-section>
        {blocks.map((b, i) => {
          const systemMeta = isSystemBlockType(b.block_type) ? SYSTEM_META[b.block_type] : null;
          const contentMeta = isContentBlockType(b.block_type) ? CONTENT_BLOCK_DEFS[b.block_type] : null;
          const name = systemMeta?.name ?? contentMeta?.name ?? b.block_type;
          const expanded = expandedId === b.id;
          const canExpand = systemMeta ? systemMeta.hasHeadings : true;

          return (
            <Card key={b.id}>
              <div className="flex items-center gap-4">
                {/* Strzałki kolejności */}
                <div className="flex flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || isPending}
                    aria-label={`Przesuń sekcję ${name} wyżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 15-6-6-6 6" /></svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    disabled={i === blocks.length - 1 || isPending}
                    aria-label={`Przesuń sekcję ${name} niżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>

                {/* Nazwa + opis */}
                <div className="flex-1 min-w-0">
                  {systemMeta ? (
                    <>
                      <p className={`font-display text-lg font-semibold ${b.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                        {systemMeta.name}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{systemMeta.desc}</p>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`font-display text-lg font-semibold ${b.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                          {contentMeta?.name ?? b.block_type}
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
                    </>
                  )}
                </div>

                {/* Link do edytora zawartości (tylko sekcje systemowe) */}
                {systemMeta?.contentHref && (
                  <Link
                    href={systemMeta.contentHref}
                    className="hidden sm:inline-flex text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline shrink-0"
                  >
                    {systemMeta.contentCta} →
                  </Link>
                )}

                {/* Toggle widoczności */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={b.visible}
                  aria-label={`Widoczność sekcji ${name}`}
                  onClick={() => toggleVisible(b)}
                  disabled={isPending}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${b.visible ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${b.visible ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>

                {/* Rozwiń edycję (nagłówki systemowe / treść klocka) */}
                {canExpand && (
                  <button
                    type="button"
                    onClick={() => setExpandedId(expanded ? null : b.id)}
                    aria-expanded={expanded}
                    aria-label={`Edytuj ${systemMeta ? "nagłówki" : "treść"} sekcji ${name}`}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={expanded ? "rotate-180 transition-transform" : "transition-transform"}><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                )}

                {/* Usuń (tylko sekcje treściowe — systemowych nie można usuwać) */}
                {contentMeta && (
                  <button
                    type="button"
                    onClick={() => remove(b)}
                    className="text-xs font-sans uppercase tracking-widest text-red-600 hover:underline shrink-0"
                  >
                    Usuń
                  </button>
                )}
              </div>

              {expanded && (
                <>
                  {systemMeta?.hasHeadings && (
                    <>
                      <SystemHeadingsForm block={b} onResult={handleResult} />
                      {b.block_type === "trust_bar" && (
                        <TrustItemsEditor initialItems={initialTrustItems} onResult={handleResult} />
                      )}
                    </>
                  )}
                  {contentMeta && b.block_type === "banner" && (
                    <BannerForm block={b} onResult={handleResult} />
                  )}
                  {contentMeta && b.block_type === "gallery" && (
                    <GalleryForm block={b} onResult={handleResult} />
                  )}
                  {contentMeta && b.block_type === "faq" && (
                    <FaqForm block={b} onResult={handleResult} />
                  )}
                  {contentMeta && b.block_type === "reviews" && (
                    <ReviewsForm block={b} onResult={handleResult} />
                  )}
                  {contentMeta && b.block_type === "products" && (
                    <ProductsForm block={b} onResult={handleResult} picker={picker} />
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setAddOpen(true)}
        className="self-start px-6 py-3 border border-[var(--color-gold)] text-[var(--color-gold)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
      >
        + Dodaj sekcję
      </button>

      <Card>
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h2 className="font-display text-lg font-semibold text-[var(--fg)]">
              Podstrony
            </h2>
            <p className="text-xs text-[var(--muted)]">
              Własne strony (np. „Pielęgnacja mebli") składane z tych samych
              sekcji co strona główna.
            </p>
          </div>
          <Link
            href="/admin/podstrony"
            className="shrink-0 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline"
          >
            Zarządzaj →
          </Link>
        </div>
      </Card>

      <SiteTextsCard initialTexts={initialSiteTexts} onResult={handleResult} />

      {addOpen && <AddBlockModal onClose={() => setAddOpen(false)} onResult={handleResult} />}
    </div>
  );
}

// Formularz nagłówka+podtytułu (PL i DE obok siebie) bloku SYSTEMOWEGO.
// Przeniesiony ze starego SectionHeadingsForm z trzema zmianami: prop `block`
// zamiast `section`, ukryty input "id" zamiast "key", defaulty czytane z
// jsonb `block.content.*` (przez `cs`), submit → updateSystemBlockHeadings.
function SystemHeadingsForm({
  block,
  onResult,
}: {
  block: PageBlockRow;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();

  function submit(formData: FormData) {
    startSave(async () => {
      onResult(await updateSystemBlockHeadings(formData));
    });
  }

  return (
    <form action={submit} className="mt-6 pt-6 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="hidden" name="id" value={block.id} />
      <Field label="Podtytuł (mała złota linijka)">
        <input name="subheading" defaultValue={cs(block.content.subheading)} className={inputCls} />
      </Field>
      <Field label="Podtytuł DE">
        <input name="subheading_de" defaultValue={cs(block.content.subheading_de)} className={inputCls} />
      </Field>
      <Field label="Nagłówek">
        <input name="heading" defaultValue={cs(block.content.heading)} className={inputCls} />
      </Field>
      <Field label="Nagłówek DE">
        <input name="heading_de" defaultValue={cs(block.content.heading_de)} className={inputCls} />
      </Field>
      <div className="sm:col-span-2">
        <button
          type="submit"
          disabled={saving}
          data-guard-save
          className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
        >
          {saving ? "Zapisuję..." : "Zapisz nagłówki"}
        </button>
      </div>
    </form>
  );
}
