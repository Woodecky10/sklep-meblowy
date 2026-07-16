"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { togglePagePublished, deletePage } from "./actions";
import type { PageRow } from "@/app/_lib/pages";
import type { ActionResult } from "@/app/_lib/types";
import { Card, ToastView, type Toast } from "@/app/admin/_shared";
import { useConfirm } from "@/app/_context/ConfirmContext";

export default function PagesList({ initialPages }: { initialPages: PageRow[] }) {
  const router = useRouter();
  const [pages, setPages] = useState(initialPages);
  const [prevInitial, setPrevInitial] = useState(initialPages);
  if (initialPages !== prevInitial) {
    setPrevInitial(initialPages);
    setPages(initialPages);
  }
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();
  const confirm = useConfirm();

  function showToast(t: Toast) {
    setToast(t);
    setTimeout(() => setToast(null), 4000);
  }
  function handleResult(result: ActionResult) {
    if (result.ok) {
      showToast({ type: "success", message: result.message ?? "Zapisano" });
      router.refresh();
    } else {
      showToast({ type: "error", message: result.error });
    }
  }

  function togglePublished(p: PageRow) {
    const fd = new FormData();
    fd.set("id", p.id);
    fd.set("published", p.published ? "0" : "1");
    const prev = pages;
    setPages(pages.map((x) => (x.id === p.id ? { ...x, published: !x.published } : x)));
    startTransition(async () => {
      const res = await togglePagePublished(fd);
      if (!res.ok) {
        setPages(prev);
        showToast({ type: "error", message: res.error });
      } else {
        router.refresh();
      }
    });
  }

  async function remove(p: PageRow) {
    const ok = await confirm({
      message: `Usunąć stronę „${p.title}" razem ze wszystkimi jej sekcjami? Tej operacji nie można cofnąć.`,
      danger: true,
    });
    if (!ok) return;
    const fd = new FormData();
    fd.set("id", p.id);
    startTransition(async () => {
      handleResult(await deletePage(fd));
    });
  }

  if (pages.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] italic">
        Nie ma jeszcze żadnych podstron — utwórz pierwszą powyżej.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}
      {pages.map((p) => (
        <Card key={p.id}>
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="font-display text-lg font-semibold text-[var(--fg)]">
                  {p.title}
                </p>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-sans uppercase tracking-widest ${
                    p.published
                      ? "bg-[var(--color-gold)]/15 text-[var(--color-gold-text)]"
                      : "bg-[var(--border)] text-[var(--muted)]"
                  }`}
                >
                  {p.published ? "Opublikowana" : "Szkic"}
                </span>
              </div>
              <p className="text-xs text-[var(--muted)]">
                <span className="font-mono">/{p.slug}</span>
                {" · "}
                {new Date(p.updated_at).toLocaleDateString("pl-PL")}
              </p>
            </div>
            <a
              href={`/${p.slug}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors shrink-0"
            >
              Podgląd ↗
            </a>
            <button
              type="button"
              role="switch"
              aria-checked={p.published}
              aria-label={`Publikacja strony ${p.title}`}
              onClick={() => togglePublished(p)}
              disabled={isPending}
              className={`relative w-11 h-6 rounded-full transition-colors shrink-0 disabled:opacity-60 ${
                p.published ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"
              }`}
            >
              <span
                className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                  p.published ? "left-[22px]" : "left-0.5"
                }`}
              />
            </button>
            <Link
              href={`/admin/podstrony/${p.id}`}
              className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-[var(--color-gold)] text-[var(--color-gold)] rounded-full hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
            >
              Edytuj
            </Link>
            <button
              type="button"
              onClick={() => remove(p)}
              disabled={isPending}
              className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest border border-red-300 dark:border-red-900 text-red-600 rounded-full hover:bg-red-50 dark:hover:bg-red-950 transition-colors disabled:opacity-60"
            >
              Usuń
            </button>
          </div>
        </Card>
      ))}
    </div>
  );
}
