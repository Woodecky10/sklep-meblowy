"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Card, Field, ToastView, inputCls, type Toast } from "@/app/admin/_shared";
import { createProduct } from "../actions";

type SelectSection = { label: string; categories: { slug: string; label: string }[] };
type Props = { sections: SelectSection[] };

export default function NewProductForm({ sections }: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<Toast>(null);
  const [isPending, startTransition] = useTransition();

  function showToast(t: Toast) {
    setToast(t);
    if (t) setTimeout(() => setToast(null), 4000);
  }

  if (sections.length === 0) {
    return (
      <div className="flex flex-col gap-4">
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Nowy produkt</h1>
        <Card>
          <p className="text-sm text-[var(--muted)]">
            Najpierw dodaj kategorię w{" "}
            <Link href="/admin/kategorie" className="text-[var(--color-gold)] hover:underline">
              /admin/kategorie
            </Link>
            , a potem wróć tu, żeby utworzyć produkt.
          </p>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {toast && <ToastView toast={toast} onClose={() => setToast(null)} />}

      <div className="flex items-center gap-2 text-sm">
        <Link href="/admin/produkty" className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors">
          ← Produkty
        </Link>
      </div>

      <div>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">Nowy produkt</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-xl">
          Podaj podstawowe dane — po utworzeniu przejdziesz do edytora, gdzie dodasz zdjęcia,
          warianty, opis i tłumaczenie DE.
        </p>
      </div>

      <Card>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            startTransition(async () => {
              const res = await createProduct(fd);
              if (res.ok) {
                showToast({ type: "success", message: "Produkt utworzony — przechodzę do edytora" });
                router.push(`/admin/produkty/${res.productId}`);
              } else {
                showToast({ type: "error", message: res.error });
              }
            });
          }}
          className="flex flex-col gap-4"
        >
          <Field label="Nazwa" required>
            <input name="name" required maxLength={300} className={inputCls} placeholder="np. Sofa Mollien 3-osobowa" />
          </Field>
          <Field label="Cena (zł)" required>
            <input name="price" type="number" step="0.01" min="0" required className={inputCls} />
          </Field>
          <Field label="Kategoria" required>
            <select name="category" required defaultValue="" className={inputCls}>
              <option value="" disabled>
                — wybierz kategorię —
              </option>
              {sections.map((s) => (
                <optgroup key={s.label} label={s.label}>
                  {s.categories.map((c) => (
                    <option key={c.slug} value={c.slug}>
                      {c.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </Field>
          <button
            type="submit"
            disabled={isPending}
            className="self-start px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors disabled:opacity-50"
          >
            {isPending ? "Tworzę..." : "Utwórz produkt"}
          </button>
        </form>
      </Card>
    </div>
  );
}
