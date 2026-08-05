import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { createClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import { hasVariants, totalProductStock } from "@/app/_lib/variants";
import { promoChipLabel, warsawToday } from "@/app/_lib/sale-schedule";
import ProductsList, { type AdminProductRow } from "./ProductsList";

export const metadata = { title: "Produkty — Admin" };

export default async function AdminProductsPage() {
  await requireAdmin();

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  // Projekcja dla client componentu — stock/warianty liczone serwerowo,
  // pełny JSON wariantów nie jedzie do przeglądarki.
  const today = warsawToday();
  const rows: AdminProductRow[] = ((data ?? []) as Product[]).map((p) => ({
    id: p.id,
    name: p.name,
    category: p.category,
    price: Number(p.price),
    stock: hasVariants(p) ? totalProductStock(p) : p.stock,
    variantCount: p.variants?.options.length ?? 0,
    thumb: p.images[0] ?? null,
    isActive: p.is_active,
    promoChip: promoChipLabel(
      {
        id: p.id,
        price: Number(p.price),
        sale_price: p.sale_price,
        sale_price_planned: p.sale_price_planned,
        sale_from: p.sale_from,
        sale_to: p.sale_to,
        promo_badge: p.promo_badge,
      },
      today
    ),
  }));

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

      {rows.length === 0 ? (
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl text-center text-[var(--muted)]">
          Brak produktów. Kliknij &bdquo;+ Nowy produkt&rdquo;, żeby dodać pierwszy.
        </div>
      ) : (
        <ProductsList products={rows} />
      )}
    </div>
  );
}
