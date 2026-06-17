import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/app/_lib/admin";
import { createClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import { hasVariants, totalProductStock } from "@/app/_lib/variants";
import DeleteProductButton from "./DeleteProductButton";
import ToggleProductActiveButton from "./ToggleProductActiveButton";

export const metadata = { title: "Produkty — Admin" };

export default async function AdminProductsPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  const products = ((data ?? []) as Product[]).slice();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
            Admin
          </p>
          <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
            Produkty
          </h1>
          <p className="text-sm text-[var(--muted)] mt-2">
            Łącznie: {products.length}{" "}
            {products.length === 1 ? "produkt" : products.length < 5 ? "produkty" : "produktów"}.
            Kliknij &bdquo;Edytuj&rdquo; przy produkcie, żeby zmienić nazwę, cenę, opis, zdjęcia lub warianty.
          </p>
        </div>
        <Link
          href="/admin/produkty/nowy"
          className="shrink-0 px-5 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          + Nowy produkt
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-red-800 dark:text-red-300 text-sm">
          Błąd ładowania produktów: {error.message}
        </div>
      )}

      {products.length === 0 ? (
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl text-center text-[var(--muted)]">
          Brak produktów. Kliknij &bdquo;+ Nowy produkt&rdquo;, żeby dodać pierwszy.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {products.map((p) => {
            const thumb = p.images[0] ?? null;
            const stock = hasVariants(p) ? totalProductStock(p) : p.stock;
            const variantCount = hasVariants(p) ? p.variants!.combinations.length : 0;
            return (
              <li
                key={p.id}
                className="flex items-center gap-4 p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl hover:border-[var(--color-gold)] transition-colors"
              >
                <div className="relative w-20 h-20 shrink-0 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden">
                  {thumb ? (
                    <Image
                      src={thumb}
                      alt={p.name}
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">
                      brak
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <p className="font-display text-base font-semibold text-[var(--fg)] truncate">
                    {p.name}
                    {!p.is_active && (
                      <span className="ml-2 align-middle px-2 py-0.5 text-[10px] font-sans uppercase tracking-widest rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                        ukryty
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-0.5">
                    {p.category} · {p.price.toFixed(2)} zł · stock: {stock}
                    {variantCount > 0 && ` · ${variantCount} wariant${variantCount === 1 ? "" : variantCount < 5 ? "y" : "ów"}`}
                  </p>
                </div>

                <Link
                  href={`/admin/produkty/${p.id}`}
                  className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] border border-[var(--color-gold)] rounded-lg hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
                >
                  Edytuj
                </Link>
                <ToggleProductActiveButton productId={p.id} isActive={p.is_active} />
                <DeleteProductButton productId={p.id} productName={p.name} />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
