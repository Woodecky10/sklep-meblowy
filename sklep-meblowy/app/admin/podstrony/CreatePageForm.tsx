"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createPage } from "./actions";
import { slugifyTitle } from "@/app/_lib/pages";
import { Card, Field, inputCls } from "@/app/admin/_shared";

export default function CreatePageForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [creating, startTransition] = useTransition();
  const previewSlug = slugifyTitle(title);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const fd = new FormData();
    fd.set("title", title);
    startTransition(async () => {
      const res = await createPage(fd);
      if (res.ok) {
        const id = (res.data as { id: string } | undefined)?.id;
        if (id) router.push(`/admin/podstrony/${id}`);
        else router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <Card>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <h2 className="font-display text-lg font-semibold text-[var(--fg)]">
          Nowa strona
        </h2>
        <div className="flex items-end gap-3 flex-wrap">
          <Field label="Tytuł strony" required className="flex-1 min-w-[240px]">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="np. Pielęgnacja mebli"
              className={inputCls}
            />
          </Field>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {creating ? "Tworzę..." : "Utwórz stronę"}
          </button>
        </div>
        {previewSlug && (
          <p className="text-xs text-[var(--muted)]">
            Adres strony: <code className="font-mono">/{previewSlug}</code>{" "}
            (możesz go zmienić w ustawieniach strony)
          </p>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </Card>
  );
}
