import { Suspense } from "react";
import type { Metadata } from "next";
import { getProducts } from "@/app/_lib/products";
import type { Category } from "@/app/_lib/types";
import ProductCard from "@/app/_components/ui/ProductCard";
import FilterBar from "@/app/_components/ui/FilterBar";
import Pagination from "@/app/_components/ui/Pagination";

export const metadata: Metadata = { title: "Sklep" };

type SearchParams = Promise<{
  kategoria?: string;
  sortuj?: string;
  strona?: string;
}>;

const CATEGORY_LABELS: Record<string, string> = {
  kanapy: "Kanapy",
  lozka: "Łóżka",
  fotele: "Fotele",
  pufy: "Pufy",
};

export default async function SklepPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const category = sp.kategoria as Category | undefined;
  const sort = (sp.sortuj as "price_asc" | "price_desc" | "newest") ?? "newest";
  const page = Number(sp.strona ?? 1);

  const { products, total, pages } = await getProducts({ category, sort, page });

  const rawParams: Record<string, string> = {};
  if (sp.kategoria) rawParams.kategoria = sp.kategoria;
  if (sp.sortuj) rawParams.sortuj = sp.sortuj;

  const heading = category ? CATEGORY_LABELS[category] ?? "Sklep" : "Wszystkie produkty";

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Kolekcja
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          {heading}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">{total} produktów</p>
      </div>

      <Suspense>
        <FilterBar />
      </Suspense>

      {products.length === 0 ? (
        <div className="text-center py-24 text-[var(--muted)]">
          <p className="font-display text-2xl mb-2">Brak produktów</p>
          <p className="text-sm">Spróbuj zmienić filtry.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} searchParams={rawParams} />
    </div>
  );
}
