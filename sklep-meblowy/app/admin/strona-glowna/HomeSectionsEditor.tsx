"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import type { HomeSectionKey, HomeSectionRow } from "@/app/_lib/home-sections";
import {
  updateHomeSection,
  toggleHomeSectionVisible,
  reorderHomeSections,
} from "./actions";
import type { ActionResult } from "@/app/_lib/types";
import TrustItemsEditor from "./TrustItemsEditor";
import SiteTextsCard from "./SiteTextsCard";
import type { TrustItemRow } from "@/app/_lib/trust-items";
import type { SiteTextsMap } from "@/app/_lib/site-texts";

// Metadane prezentacyjne sekcji (PL-only, panel admina).
const SECTION_META: Record<
  HomeSectionKey,
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

export default function HomeSectionsEditor({
  initialSections,
  initialTrustItems,
  initialSiteTexts,
}: {
  initialSections: HomeSectionRow[];
  initialTrustItems: TrustItemRow[];
  initialSiteTexts: SiteTextsMap;
}) {
  const [sections, setSections] = useState(initialSections);
  // Sync stanu z propów po router.refresh() (wzorzec TilesEditor).
  const [prevInitial, setPrevInitial] = useState(initialSections);
  if (initialSections !== prevInitial) {
    setPrevInitial(initialSections);
    setSections(initialSections);
  }
  const [expandedKey, setExpandedKey] = useState<HomeSectionKey | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

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
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    [next[index], next[target]] = [next[target], next[index]];
    const prev = sections;
    setSections(next);
    startTransition(async () => {
      const res = await reorderHomeSections(next.map((s) => s.key));
      if (!res.ok) {
        setSections(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  function toggleVisible(s: HomeSectionRow) {
    const fd = new FormData();
    fd.set("key", s.key);
    fd.set("visible", s.visible ? "0" : "1");
    // Optymistycznie przełącz lokalnie.
    const prev = sections;
    setSections(sections.map((x) => (x.key === s.key ? { ...x, visible: !x.visible } : x)));
    startTransition(async () => {
      const res = await toggleHomeSectionVisible(fd);
      if (!res.ok) {
        setSections(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
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
          przełącznikiem, edytuj nagłówki (polski i niemiecki). Zawartość
          sekcji (slajdy, kafelki, produkty) edytujesz dotychczasowymi
          edytorami — przycisk „Edytuj zawartość”.
        </p>
      </div>

      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <div className="flex flex-col gap-4" data-guard-section>
        {sections.map((s, i) => {
          const meta = SECTION_META[s.key];
          const expanded = expandedKey === s.key;
          return (
            <Card key={s.key}>
              <div className="flex items-center gap-4">
                {/* Strzałki kolejności */}
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
                    disabled={i === sections.length - 1 || isPending}
                    aria-label={`Przesuń sekcję ${meta.name} niżej`}
                    className="w-7 h-7 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] disabled:opacity-30 hover:border-[var(--color-gold)]"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                </div>

                {/* Nazwa + opis */}
                <div className="flex-1 min-w-0">
                  <p className={`font-display text-lg font-semibold ${s.visible ? "text-[var(--fg)]" : "text-[var(--muted)] line-through"}`}>
                    {meta.name}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{meta.desc}</p>
                </div>

                {/* Link do edytora zawartości */}
                {meta.contentHref && (
                  <Link
                    href={meta.contentHref}
                    className="hidden sm:inline-flex text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] hover:underline shrink-0"
                  >
                    {meta.contentCta} →
                  </Link>
                )}

                {/* Toggle widoczności */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={s.visible}
                  aria-label={`Widoczność sekcji ${meta.name}`}
                  onClick={() => toggleVisible(s)}
                  disabled={isPending}
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${s.visible ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"}`}
                >
                  <span
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${s.visible ? "left-[22px]" : "left-0.5"}`}
                  />
                </button>

                {/* Rozwiń nagłówki */}
                {meta.hasHeadings && (
                  <button
                    type="button"
                    onClick={() => setExpandedKey(expanded ? null : s.key)}
                    aria-expanded={expanded}
                    aria-label={`Edytuj nagłówki sekcji ${meta.name}`}
                    className="w-8 h-8 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] shrink-0"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={expanded ? "rotate-180 transition-transform" : "transition-transform"}><path d="m6 9 6 6 6-6" /></svg>
                  </button>
                )}
              </div>

              {expanded && meta.hasHeadings && (
                <>
                  <SectionHeadingsForm section={s} onResult={handleResult} />
                  {s.key === "trust_bar" && (
                    <TrustItemsEditor initialItems={initialTrustItems} onResult={handleResult} />
                  )}
                </>
              )}
            </Card>
          );
        })}
      </div>

      <SiteTextsCard initialTexts={initialSiteTexts} onResult={handleResult} />
    </div>
  );
}

// Formularz nagłówka+podtytułu (PL i DE obok siebie) jednej sekcji.
function SectionHeadingsForm({
  section,
  onResult,
}: {
  section: HomeSectionRow;
  onResult: (r: ActionResult) => void;
}) {
  const [saving, startSave] = useTransition();

  function submit(formData: FormData) {
    startSave(async () => {
      onResult(await updateHomeSection(formData));
    });
  }

  return (
    <form action={submit} className="mt-6 pt-6 border-t border-[var(--border)] grid grid-cols-1 sm:grid-cols-2 gap-4">
      <input type="hidden" name="key" value={section.key} />
      <Field label="Podtytuł (mała złota linijka)">
        <input name="subheading" defaultValue={section.subheading ?? ""} className={inputCls} />
      </Field>
      <Field label="Podtytuł DE">
        <input name="subheading_de" defaultValue={section.subheading_de ?? ""} className={inputCls} />
      </Field>
      <Field label="Nagłówek">
        <input name="heading" defaultValue={section.heading ?? ""} className={inputCls} />
      </Field>
      <Field label="Nagłówek DE">
        <input name="heading_de" defaultValue={section.heading_de ?? ""} className={inputCls} />
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
