import { notFound } from "next/navigation";
import { headers } from "next/headers";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Metadata } from "next";
import {
  getProduct,
  getRelatedProducts,
  getCrossSellProducts,
  getSizeSiblings,
} from "@/app/_lib/products";
import { getCategoryLabel, getAllCategories } from "@/app/_lib/categories";
import { getCollection, getCollectionSiblings } from "@/app/_lib/collections";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import {
  getProductRating,
  getReviewsForProduct,
  getReviewStatus,
} from "@/app/_lib/reviews";
import ProductMainSection from "@/app/_components/ui/ProductMainSection";
import ProductCard from "@/app/_components/ui/ProductCard";
import RecentlyViewed from "@/app/_components/ui/RecentlyViewed";
import StarRating from "@/app/_components/ui/StarRating";
import ReviewList from "@/app/_components/ui/ReviewList";
import ReviewForm from "@/app/_components/ui/ReviewForm";
import { sanitizeProductHtml } from "@/app/_lib/product-html";
import { DEDICATED_FEATURE_KEYS } from "@/app/_lib/product-features";
import ProductDescriptionSections from "@/app/_components/ui/ProductDescriptionSections";
import TrustBar from "@/app/_components/ui/TrustBar";
import { COMPANY } from "@/app/_lib/company";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizePath, localizeHref } from "@/app/_lib/i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import { convertToEur } from "@/app/_lib/money";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { buildSizeOptions } from "@/app/_lib/size-groups";
import { effectivePrice } from "@/app/_lib/pricing";
import { getFabricImageMap, getFabricMetaMap } from "@/app/_lib/fabrics";
import { FabricImageProvider, FabricMetaProvider } from "@/app/_lib/fabric-context";
import { getVariantInfoMap } from "@/app/_lib/variant-info-data";
import { VariantInfoProvider } from "@/app/_lib/variant-info-context";
import { getBundlesForProduct } from "@/app/_lib/bundles-server";
import type { Product } from "@/app/_lib/types";

type Props = { params: Promise<{ id: string }> };

// Strip HTML tagów dla meta description (Google nie chce tagów w meta).
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
}

// Plain-text opis dla SEO/JSON-LD. Po wyłączeniu sync opisów plain `description`
// bywa puste dla nowych produktów — wtedy składamy z widocznych tekstowych
// sekcji (jedyne źródło opisu, wpisywane ręcznie w panelu).
function productPlainDescription(product: Product): string {
  if (product.description && product.description.trim().length > 0) {
    return product.description;
  }
  return (product.description_sections ?? [])
    .filter(
      (s): s is Extract<typeof s, { kind: "text" }> =>
        s.kind === "text" && s.hidden !== true
    )
    .map((s) => (s.admin_body ?? s.body).trim())
    .filter((b) => b.length > 0)
    .join("\n\n");
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const locale = await getLocale();
  const product = await getProduct(id, locale);
  if (!product) return { title: locale === "de" ? "Produkt nicht gefunden" : "Produkt nie znaleziony" };
  // DE w SEO tylko gdy produkt przetłumaczony. `needs_translation` NIE jest w
  // typie Product (data layer zwraca je przez select("*")) — dostęp przez cast.
  const hasDe =
    (product as { needs_translation?: boolean }).needs_translation === false;
  const plPath = `/produkt/${id}`;
  return {
    title: product.name,
    // Meta description = plain text (bez HTML, max 160 znaków)
    description: stripHtml(productPlainDescription(product)).slice(0, 160),
    alternates: {
      // canonical = self dla bieżącego locale (relatywne, rozwiązane przez
      // metadataBase z app/layout.tsx). Na PL → /produkt/X, na DE → /de/produkt/X.
      canonical: localizePath(plPath, locale),
      languages: alternatesFor(plPath, { hasDe }).languages,
    },
    openGraph: {
      locale: locale === "de" ? "de_DE" : "pl_PL",
      images: product.images?.[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProduktPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const product = await getProduct(id, locale);
  if (!product) notFound();

  const [sizeSiblings, related, rating, reviews, reviewStatus, categoryLabel, allCategories, crossSell, wishlistIds, rate, bundles] =
    await Promise.all([
      // Selektor rozmiaru: rodzeństwo z tym samym size_group (osobne aukcje per rozmiar).
      product.size_group ? getSizeSiblings(product.size_group, locale) : Promise.resolve([]),
      getRelatedProducts(product.id, product.category, 4, locale),
      getProductRating(product.id),
      getReviewsForProduct(product.id, 50, locale),
      getReviewStatus(product.id),
      getCategoryLabel(product.category, locale),
      getAllCategories(locale),
      getCrossSellProducts([product.category], [product.id], 4, locale),
      getUserWishlistIds(),
      getEurRate(),
      // Zestawy zawierające ten produkt — box „Kup w zestawie" na karcie.
      getBundlesForProduct(product.id, locale),
    ]);
  const sizeOptions = buildSizeOptions(sizeSiblings, product.id);
  // Mapa zdjęć próbek tkanin (wartość „Nazwa Numer" → URL) do próbek w selektorze.
  const fabricImageMap = await getFabricImageMap();
  // Mapa wartość wariantu → metadane tkaniny (slug, grupa cenowa) — selektor
  // grupuje próbki w rozwijane karty grup + link „szczegóły" do /tkaniny/[slug].
  const fabricMetaMap = await getFabricMetaMap();
  // Mapa (opcja+wartość) → {info, info_de} — krótkie informacje o wariancie
  // (tooltip „i" przy wartości w selektorze).
  const variantInfoMap = await getVariantInfoMap();

  // Etykieta cross-sell pochodzi z LABELA pierwszej cross_sell_categories tej
  // kategorii — np. dla łóżek pokaże "Polecane materace".
  const currentCat = allCategories.find((c) => c.slug === product.category);
  const crossSellTargetSlug = currentCat?.crossSellCategories?.[0];
  const crossSellLabel = crossSellTargetSlug
    ? allCategories.find((c) => c.slug === crossSellTargetSlug)?.label ?? null
    : null;

  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));

  // Kolekcja: jeśli produkt jest w kolekcji, pobierz inne produkty z niej.
  const [collection, collectionSiblings] = product.collection_id
    ? await Promise.all([
        getCollection(product.collection_id, locale),
        getCollectionSiblings(product.collection_id, product.id, 8, locale),
      ])
    : [null, []];

  const details: { label: string; value: string }[] = [];
  if (product.dimensions) {
    const { width, depth, height } = product.dimensions;
    details.push({
      label: t.product.specWidth,
      value: `${width} × ${depth} × ${height} cm (${t.product.dimensionsHint})`,
    });
  }
  if (product.weight !== null && product.weight !== undefined) {
    details.push({ label: t.product.specWeight, value: `${product.weight} kg` });
  }
  if (product.material) {
    details.push({ label: t.product.specMaterial, value: product.material });
  }
  if (product.color) {
    details.push({ label: t.product.specBaseColor, value: product.color });
  }
  if (product.construction) {
    details.push({ label: t.product.specConstruction, value: product.construction });
  }
  if (product.delivery_time) {
    details.push({ label: t.product.specDeliveryTime, value: product.delivery_time });
  }
  if (product.warranty) {
    details.push({ label: t.product.specWarranty, value: product.warranty });
  }

  // Dodatkowe cechy produktu (features) — parametry z panelu admina. Pomijamy
  // te które już są dedykowane (Kolor, Materiał, Wymiary, Konstrukcja, Czas
  // realizacji, Gwarancja) — żeby nie dublować linii w specyfikacji.
  const DEDICATED_KEYS = new Set(
    DEDICATED_FEATURE_KEYS.map((s) => s.toLowerCase())
  );
  for (const f of product.features ?? []) {
    if (DEDICATED_KEYS.has(f.key.toLowerCase().trim())) continue;
    details.push({ label: f.key, value: f.value });
  }
  // Cała specyfikacja alfabetycznie A-Z po etykiecie (pola stałe + parametry
  // razem). Collation "pl", nieczuła na wielkość liter/diakrytyki, z sortem
  // numerycznym (spójnie z sortVariantValues). Nie mutuje danych źródłowych —
  // `details` to lokalna tablica budowana w tym renderze.
  details.sort((a, b) =>
    a.label.localeCompare(b.label, "pl", { numeric: true, sensitivity: "base" })
  );

  // Structured data dla Google (schema.org/Product) — rich snippets w SERP-ach:
  // cena, dostępność, gwiazdki/ocena prosto w wynikach wyszukiwania.
  // Plain text description (bez HTML tagów) wymagany przez Google.
  const plainDescription = stripHtml(productPlainDescription(product)).slice(0, 5000);
  const productUrl = `https://${COMPANY.domain}/produkt/${product.id}`;
  // Cena w danych strukturalnych = cena EFEKTYWNA (promocyjna gdy obniżka), żeby
  // zgadzała się z ceną widoczną na stronie — inaczej Google (Merchant/rich
  // snippets) zgłasza rozjazd "structured data ≠ visible price". Dla produktów
  // z wariantami sale_price jest null (defense-in-depth), więc = product.price.
  const jsonLdPrice = effectivePrice(product.price, product.sale_price);
  const jsonLd: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: plainDescription,
    image: product.images ?? [],
    sku: product.id,
    brand: {
      "@type": "Brand",
      name: COMPANY.brandName,
    },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: locale === "de" ? "EUR" : "PLN",
      price: (locale === "de" ? convertToEur(jsonLdPrice, rate) : jsonLdPrice).toFixed(2),
      // Meble robione na zamówienie — zawsze "dostępne".
      availability: "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
  };
  if (rating && rating.count > 0) {
    jsonLd.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: rating.average.toFixed(1),
      reviewCount: rating.count,
      bestRating: "5",
      worstRating: "1",
    };
  }

  // Escape `<` → <: bez tego product.name/description zawierające
  // </script> wybiłyby się z bloku JSON-LD i wstrzyknęły skrypt (audyt LOW).
  const jsonLdHtml = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
  const nonce = (await headers()).get("x-nonce") ?? undefined;

  // Sekcje opisu (IKEA-style akordeony). Pre-process: aplikuj admin overrides
  // (admin_title / admin_body / hidden) — admin może per produkt naprawić treść
  // bez edytowania każdej sekcji z osobna. Body sanitujemy server-side (PR #35),
  // bo ProductDescriptionSections.tsx ("use client") renderuje je przez
  // dangerouslySetInnerHTML.
  const visibleSections = (product.description_sections ?? [])
    .filter((s) => !(s.kind === "text" && s.hidden === true))
    .map((s) => {
      if (s.kind !== "text") return s;
      const hasBodyOverride = (s.admin_body?.trim().length ?? 0) > 0;
      const rawBody = hasBodyOverride ? (s.admin_body as string) : s.body;
      return {
        ...s,
        title: s.admin_title?.trim() || s.title,
        body: sanitizeProductHtml(rawBody),
      };
    });

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />

      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-sans text-[var(--muted)] mb-12 uppercase tracking-widest">
        <LocalizedLink href="/" className="hover:text-[var(--color-gold)] transition-colors">{t.product.breadcrumbHome}</LocalizedLink>
        <span>/</span>
        <LocalizedLink href="/sklep" className="hover:text-[var(--color-gold)] transition-colors">{t.product.breadcrumbShop}</LocalizedLink>
        <span>/</span>
        <LocalizedLink
          href={`/sklep?kategoria=${product.category}`}
          className="hover:text-[var(--color-gold)] transition-colors"
        >
          {categoryLabel ?? product.category}
        </LocalizedLink>
        <span>/</span>
        <span className="text-[var(--fg)] normal-case tracking-normal">{product.name}</span>
      </nav>

      {/* Główna sekcja — galeria + akcje + specyfikacja w lewej kolumnie.
          Specyfikacja przeniesiona z osobnej sekcji do ProductMainSection
          żeby wypełniała pustą przestrzeń pod galerią. */}
      <FabricImageProvider map={fabricImageMap}>
        <FabricMetaProvider map={fabricMetaMap}>
          <VariantInfoProvider map={variantInfoMap}>
            <ProductMainSection
              product={product}
              categoryLabel={categoryLabel ?? null}
              rating={rating}
              specifications={details}
              sizeOptions={sizeOptions}
              bundles={bundles}
            />
          </VariantInfoProvider>
        </FabricMetaProvider>
      </FabricImageProvider>

      {/* Sekcja: opis produktu.
          - Jeśli mamy description_sections (IKEA-style akordeony) →
            renderujemy ProductDescriptionSections.
          - Inaczej fallback do legacy flat description (stare produkty
            sprzed migracji 22, z opisem w polu głównym). */}
      {visibleSections.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.product.descriptionEyebrow}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {t.product.descriptionHeading}
            </h2>
          </div>
          <ProductDescriptionSections sections={visibleSections} />
        </section>
      )}
      {(product.description_sections?.length ?? 0) === 0 &&
        product.description &&
        product.description.trim().length > 0 && (
          <section className="mb-24">
            <div className="mb-8">
              <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
                {t.product.fullDescriptionEyebrow}
              </p>
              <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
                {t.product.fullDescriptionHeading}
              </h2>
            </div>
            <div
              className="product-description max-w-4xl text-[var(--fg)] leading-relaxed"
              dangerouslySetInnerHTML={{ __html: sanitizeProductHtml(product.description) }}
            />
          </section>
        )}

      {/* Pasek zaufania — atuty sklepu pod opisem produktu (spec 2026-07-06).
          Renderuje się też gdy produkt nie ma opisu — wtedy zaraz po sekcji głównej. */}
      <section className="mb-24">
        <TrustBar locale={locale} />
      </section>

      {/* Cross-sell — np. dla łóżka pokaż "Polecane materace" */}
      {crossSell.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.product.crossSellEyebrow}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {crossSellLabel
                ? `${t.product.crossSellRecommendedPrefix} ${crossSellLabel.toLowerCase()}`
                : t.product.crossSellFallbackHeading}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {crossSell.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} locale={locale} rate={rate} />
            ))}
          </div>
        </section>
      )}

      {/* Pełna kolekcja — pozostałe produkty z tej samej serii */}
      {collection && collectionSiblings.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.product.fullCollectionEyebrow}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {collection.label}
            </h2>
            {collection.description && (
              <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
                {collection.description}
              </p>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {collectionSiblings.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} locale={locale} rate={rate} />
            ))}
          </div>
        </section>
      )}

      {/* Sekcja opinii */}
      <section id="opinie" className="mb-24">
        <div className="mb-8 flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.product.reviews}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {t.product.reviewsHeading}
            </h2>
          </div>
          {rating.count > 0 && (
            <div className="flex items-center gap-3">
              <StarRating value={rating.average} size={22} />
              <p className="font-sans text-lg font-bold text-[var(--fg)]">
                {rating.average.toFixed(1)}{" "}
                <span className="text-sm font-normal text-[var(--muted)]">
                  ({rating.count})
                </span>
              </p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-10 items-start">
          <ReviewList reviews={reviews} />

          <aside>
            {reviewStatus.canReview ? (
              <ReviewForm
                productId={product.id}
                existingReview={reviewStatus.existingReview}
              />
            ) : (
              <div className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 text-sm text-[var(--muted)] leading-relaxed">
                {reviewStatus.reason === "not_logged_in" ? (
                  <>
                    {t.product.reviewGuardLoggedOut}{" "}
                    <a href={localizeHref("/logowanie", locale)} className="text-[var(--color-gold)] underline">
                      {t.product.reviewGuardLogin}
                    </a>
                    {t.product.reviewGuardLoggedOutSuffix}
                  </>
                ) : (
                  <>{t.product.reviewGuardNotPurchased}</>
                )}
              </div>
            )}
          </aside>
        </div>
      </section>

      {/* Podobne produkty */}
      {related.length > 0 && (
        <section>
          <div className="mb-10">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {t.product.relatedProducts}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {t.product.relatedProductsHeading}
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} locale={locale} rate={rate} />
            ))}
          </div>
        </section>
      )}

      <RecentlyViewed
        locale={locale}
        current={{
          id: product.id,
          name: product.name,
          price: product.price,
          image: product.images?.[0] ?? "",
          category: categoryLabels.get(product.category) ?? product.category,
        }}
      />
    </div>
  );
}
