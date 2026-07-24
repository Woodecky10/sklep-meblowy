import { Suspense } from "react";
import type { Metadata } from "next";
import { getProducts, getFilterFacets } from "@/app/_lib/products";
import { parseOptionFilterParams } from "@/app/_lib/option-filter";
import { parseFeatureFilterParams } from "@/app/_lib/feature-filter";
import { getRatingsForProducts } from "@/app/_lib/reviews";
import {
  getCategoryLabel,
  getSections,
  getCategories,
} from "@/app/_lib/categories";
import { getCollection, getAllCollections } from "@/app/_lib/collections";
import { localizeCollection } from "@/app/_lib/localize";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import { pluralForm } from "@/app/_lib/plural";
import { getLocale } from "@/app/_lib/i18n-server";
import { getEurRate } from "@/app/_lib/store-settings";
import { localizePath } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import ProductCard from "@/app/_components/ui/ProductCard";
import FilterBar from "@/app/_components/ui/FilterBar";
import Pagination from "@/app/_components/ui/Pagination";

// /sklep jest w pełni przetłumaczone przez słownik UI → DE zawsze (hasDe: true).
// canonical = self per locale, og:locale dopasowany. Relatywne URL-e rozwiązuje
// metadataBase z app/layout.tsx.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.shop.title,
    alternates: {
      canonical: localizePath("/sklep", locale),
      languages: alternatesFor("/sklep", { hasDe: true }).languages,
    },
    openGraph: {
      locale: locale === "de" ? "de_DE" : "pl_PL",
    },
  };
}

type SearchParams = Promise<
  {
    kategoria?: string;
    sekcja?: string;
    sortuj?: string;
    strona?: string;
    q?: string;
    cena_od?: string;
    cena_do?: string;
    dostepne?: string;
    kolekcja?: string;
    szer_od?: string;
    szer_do?: string;
    gl_od?: string;
    gl_do?: string;
    wys_od?: string;
    wys_do?: string;
  } & Record<string, string | string[] | undefined>
>;

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
  const locale = await getLocale();
  const t = getDictionary(locale);
  const category = sp.kategoria || undefined;
  // sekcja działa tylko jeśli kategoria nie jest ustawiona — kategoria
  // bardziej szczegółowa wygrywa (user kliknął sub-kategorię z dropdown).
  const sectionSlug = !category && sp.sekcja ? sp.sekcja.trim() : undefined;
  const sort =
    (sp.sortuj as "alphabetic" | "price_asc" | "price_desc" | "newest") ??
    "alphabetic";
  const page = Number(sp.strona ?? 1);
  const search = sp.q?.trim() || undefined;
  const priceMin = parsePositiveNumber(sp.cena_od);
  const priceMax = parsePositiveNumber(sp.cena_do);
  const inStockOnly = sp.dostepne === "1";
  const collectionSlug = sp.kolekcja?.trim() || undefined;
  const optionFilters = parseOptionFilterParams(sp);
  const featureFilters = parseFeatureFilterParams(sp);
  const dimensionRanges = {
    widthMin: parsePositiveNumber(sp.szer_od),
    widthMax: parsePositiveNumber(sp.szer_do),
    depthMin: parsePositiveNumber(sp.gl_od),
    depthMax: parsePositiveNumber(sp.gl_do),
    heightMin: parsePositiveNumber(sp.wys_od),
    heightMax: parsePositiveNumber(sp.wys_do),
  };

  const [
    { products, total, pages },
    facets,
    sections,
    allCategories,
    allCollections,
    categoryLabel,
    collection,
    wishlistIds,
    rate,
  ] = await Promise.all([
    getProducts({
      category,
      sort,
      page,
      search,
      priceMin,
      priceMax,
      inStockOnly,
      optionFilters,
      featureFilters,
      dimensionRanges,
      collectionSlug,
      sectionSlug,
      locale,
    }),
    getFilterFacets(locale),
    getSections(locale),
    getCategories(locale),
    getAllCollections(),
    getCategoryLabel(category, locale),
    collectionSlug ? getCollection(collectionSlug, locale) : Promise.resolve(null),
    // wishlist i kurs NIE zależą od listy produktów — kiedyś czekały w drugiej
    // paczce (pełny dodatkowy łańcuch RTT po products).
    getUserWishlistIds(),
    getEurRate(),
  ]);

  // Oceny wymagają id produktów — jedyne genuinie sekwencyjne zapytanie.
  const ratings = await getRatingsForProducts(products.map((p) => p.id));
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));

  // Zachowaj wszystkie aktywne filtry w linkach paginacji
  const rawParams: Record<string, string> = {};
  if (sp.kategoria) rawParams.kategoria = sp.kategoria;
  if (sp.sekcja && !sp.kategoria) rawParams.sekcja = sp.sekcja;
  if (sp.sortuj) rawParams.sortuj = sp.sortuj;
  if (sp.q) rawParams.q = sp.q;
  if (sp.cena_od) rawParams.cena_od = sp.cena_od;
  if (sp.cena_do) rawParams.cena_do = sp.cena_do;
  if (sp.dostepne) rawParams.dostepne = sp.dostepne;
  if (sp.kolekcja) rawParams.kolekcja = sp.kolekcja;
  for (const k of ["szer_od", "szer_do", "gl_od", "gl_do", "wys_od", "wys_do"] as const) {
    const v = sp[k];
    if (typeof v === "string" && v) rawParams[k] = v;
  }
  for (const [k, val] of Object.entries(sp)) {
    if (
      (k.startsWith("opcja_") || k.startsWith("cecha_")) &&
      typeof val === "string" &&
      val
    )
      rawParams[k] = val;
  }

  // Label sekcji z `sections` (np. "Narożniki" zamiast surowego slug "naroznik").
  const sectionLabel = sectionSlug
    ? sections.find((s) => s.slug === sectionSlug)?.label
    : null;

  // Najbardziej szczegółowy filtr wygrywa: kolekcja > wyszukiwanie > kategoria
  // > sekcja > domyślny tytuł.
  function resolveHeading(): string {
    if (collection) return collection.label;
    if (search) return `${t.shop.searchPrefix}: „${search}”`;
    if (category) return categoryLabel ?? t.shop.title;
    if (sectionLabel) return sectionLabel;
    return t.shop.allProducts;
  }
  const heading = resolveHeading();

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
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.shop.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          {heading}
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2">
          {total}{" "}
          {pluralForm(total, {
            one: t.home.productOne,
            few: t.home.productFew,
            many: t.home.productMany,
          })}
        </p>
      </div>

      <Suspense>
        <FilterBar
          featureFacets={facets.features}
          optionFacets={facets.options}
          dimensionBounds={facets.dimensions}
          sections={filterSections}
          collections={allCollections.map((c) => {
            const lc = localizeCollection(c, locale);
            return { slug: lc.slug, label: lc.label };
          })}
        />
      </Suspense>

      {products.length === 0 ? (
        <div className="text-center py-24 text-[var(--muted)]">
          <p className="font-display text-2xl mb-2">{t.shop.emptyTitle}</p>
          <p className="text-sm">{t.shop.emptyHint}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              rating={ratings.get(product.id)}
              categoryLabel={categoryLabels.get(product.category)}
              isInWishlist={wishlistIds.has(product.id)}
              locale={locale}
              rate={rate}
            />
          ))}
        </div>
      )}

      <Pagination page={page} pages={pages} searchParams={rawParams} locale={locale} />
    </div>
  );
}
