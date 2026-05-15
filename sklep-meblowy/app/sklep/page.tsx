import { Suspense } from "react";
import type { Metadata } from "next";
import { getProducts, getFilterFacets } from "@/app/_lib/products";
import { getRatingsForProducts } from "@/app/_lib/reviews";
import {
  getCategoryLabel,
  getSections,
  getCategories,
} from "@/app/_lib/categories";
import { getCollection } from "@/app/_lib/collections";
import ProductCard from "@/app/_components/ui/ProductCard";
import FilterBar from "@/app/_components/ui/FilterBar";
import Pagination from "@/app/_components/ui/Pagination";

export const metadata: Metadata = { title: "Sklep" };

type SearchParams = Promise<{
  kategoria?: string;
  sortuj?: string;
  strona?: string;
  q?: string;
  cena_od?: string;
  cena_do?: string;
  dostepne?: string;
  kolor?: string;
  material?: string;
  kolekcja?: string;
}>;

function parsePositiveNumber(value: string | undefined) {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function SklepPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const category = sp.kategoria || undefined;
  const sort = (sp.sortuj as "price_asc" | "price_desc" | "newest") ?? "newest";
  const page = Number(sp.strona ?? 1);
  const search = sp.q?.trim() || undefined;
  const priceMin = parsePositiveNumber(sp.cena_od);
  const priceMax = parsePositiveNumber(sp.cena_do);
  const inStockOnly = sp.dostepne === "1";
  const colors = sp.kolor?.split(",").filter(Boolean);
  const materials = sp.material?.split(",").filter(Boolean);
  const collectionSlug = sp.kolekcja?.trim() || undefined;

  const [{ products, total, pages }, facets, sections, allCategories, categoryLabel, collection] =
    await Promise.all([
      getProducts({
        category,
        sort,
        page,
        search,
        priceMin,
        priceMax,
        inStockOnly,
        colors,
        materials,
        collectionSlug,
      }),
      getFilterFacets({ search, category }),
      getSections(),
      getCategories(),
      getCategoryLabel(category),
      collectionSlug ? getCollection(collectionSlug) : Promise.resolve(null),
    ]);

  // Batch pobrania ocen — jedno zapytanie dla całej strony list.
  const ratings = await getRatingsForProducts(products.map((p) => p.id));
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));

  // Zachowaj wszystkie aktywne filtry w linkach paginacji
  const rawParams: Record<string, string> = {};
  if (sp.kategoria) rawParams.kategoria = sp.kategoria;
  if (sp.sortuj) rawParams.sortuj = sp.sortuj;
  if (sp.q) rawParams.q = sp.q;
  if (sp.cena_od) rawParams.cena_od = sp.cena_od;
  if (sp.cena_do) rawParams.cena_do = sp.cena_do;
  if (sp.dostepne) rawParams.dostepne = sp.dostepne;
  if (sp.kolor) rawParams.kolor = sp.kolor;
  if (sp.material) rawParams.material = sp.material;
  if (sp.kolekcja) rawParams.kolekcja = sp.kolekcja;

  const heading = collection
    ? collection.label
    : search
    ? `Wyniki: „${search}”`
    : category
    ? categoryLabel ?? "Sklep"
    : "Wszystkie produkty";

  // Projekcja dla FilterBar (client) — slug + label per sekcja.
  const filterSections = sections.map((s) => ({
    slug: s.slug,
    label: s.label,
    categories: allCategories
      .filter((c) => c.group_slug === s.slug)
      .map((c) => ({ slug: c.slug, label: c.label })),
  }));

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
        <FilterBar
          colors={facets.colors}
          materials={facets.materials}
          sections={filterSections}
        />
      </Suspense>

      {products.length === 0 ? (
        <div className="text-center py-24 text-[var(--muted)]">
          <p className="font-display text-2xl mb-2">Brak produktów</p>
          <p className="text-sm">Spróbuj zmienić filtry lub frazę wyszukiwania.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              rating={ratings.get(product.id)}
              categoryLabel={categoryLabels.get(product.category)}
            />
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} searchParams={rawParams} />
    </div>
  );
}
