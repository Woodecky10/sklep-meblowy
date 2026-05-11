import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getProduct } from "@/app/_lib/products";

export const metadata = { title: "Edycja produktu — Admin" };

// Placeholder dla 17b — pełny edytor w 17c/17d.
export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link
          href="/admin/produkty"
          className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] inline-flex items-center gap-1.5"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Wszystkie produkty
        </Link>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)] mt-2">
          {product.name}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-1">
          {product.category} · {product.price.toFixed(2)} zł
        </p>
      </div>

      <div className="p-6 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl">
        <p className="text-sm text-[var(--muted)]">
          Edytor podstawowych pól i wariantów pojawi się w kolejnym kroku (17c/17d).
        </p>
      </div>
    </div>
  );
}
