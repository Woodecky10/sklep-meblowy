import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";
import VariantsEditor from "./VariantsEditor";

export const metadata = { title: "Edycja wariantów — Admin" };

type Props = { params: Promise<{ id: string }> };

export default async function AdminProduktEditPage({ params }: Props) {
  await requireAdmin();
  const { id } = await params;

  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .single();

  if (!data) notFound();
  const product = data as Product;

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/produkty"
        className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
      >
        ← Wszystkie produkty
      </Link>
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Edycja wariantów
        </p>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)]">
          {product.name}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          Edytuj wyświetlane nazwy opcji i wartości oraz przypisz zdjęcia
          per wariant. Synchronizacja z BL nie nadpisze tych zmian.
        </p>
      </div>

      {product.variants && product.variants.combinations.length > 0 ? (
        <VariantsEditor product={product} />
      ) : (
        <div className="text-center py-16 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
          <p className="font-display text-base">
            Ten produkt nie ma wariantów w BaseLinkerze.
          </p>
        </div>
      )}
    </div>
  );
}
