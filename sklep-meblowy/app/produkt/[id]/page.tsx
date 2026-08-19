import { notFound } from "next/navigation";
import ProductViewEvents from "@/app/_components/analytics/ProductViewEvents";
import { headers } from "next/headers";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Metadata } from "next";
import {
  getProduct,
  getRelatedProducts,
  getSizeMatchedCrossSell,
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
import { sleepSizeOf, formatSleepSize } from "@/app/_lib/sleep-size";
import ProductCarousel from "@/app/_components/ui/ProductCarousel";
import { productPlainText } from "@/app/_lib/product-text";
import { baseOpenGraph } from "@/app/_lib/seo-og";
import { buildBreadcrumbJsonLd, serializeJsonLd } from "@/app/_lib/seo-jsonld";

// Uchwyt dla e2e (kolekcja-slider-produkt.spec.ts). Bez niego test musiałby
// celować w klasy Tailwinda z ProductCarousel — te same, których używa
// karuzela produktów polecanych kilka sekcji wyżej, więc zieleniłby się na
// złym elemencie.
const COLLECTION_SLIDER_ID = "product-collection-slider";

// Ile rodzeństwa z kolekcji trafia do slidera. Wcześniej było 8 przy siatce
// 4 w rzędzie (dwa równe rzędy). Slider przewija, więc obcinanie kolekcji
// straciło sens — a od migracji 75 to właściciel ustawia kolejność, więc
// obcięcie ukrywałoby akurat te pozycje, które świadomie dał na koniec.
// Sufit zostaje, żeby jedna wielka kolekcja nie ściągnęła setek wierszy:
// dziś najliczniejsza ma 15 produktów.
const COLLECTION_SLIDER_LIMIT = 50;

type Props = { params: Promise<{ id: string }> };

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
    // Meta description = plain text (bez HTML, max 160 znaków). Ten sam helper
    // karmi JSON-LD i feed do Merchant Center — patrz product-text.ts.
    description: productPlainText(product).slice(0, 160),
    alternates: {
      // canonical = self dla bieżącego locale (relatywne, rozwiązane przez
      // metadataBase z app/layout.tsx). Na PL → /produkt/X, na DE → /de/produkt/X.
      canonical: localizePath(plPath, locale),
      languages: alternatesFor(plPath, { hasDe }).languages,
    },
    // Zdjęcie produktu jako obrazek udostępnienia; gdy produkt nie ma zdjęć,
    // baseOpenGraph degraduje do brandowego /og zamiast zostawić link bez obrazka.
    openGraph: baseOpenGraph(locale, { images: [product.images?.[0]] }),
  };
}

export default async function ProduktPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const product = await getProduct(id, locale);
  if (!product) notFound();

  // Rozmiar spania łóżka ("160x200") — klucz doboru materacy. null dla mebli
  // bez rozmiaru (sofy, fotele) → cross-sell leci starą ścieżką.
  const sleepSize = sleepSizeOf(product);

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
      getSizeMatchedCrossSell(
        [product.category],
        sleepSize ? [sleepSize] : [],
        [product.id],
        12,
        locale
      ),
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

  // Gdy WSZYSTKIE dopasowane karty są z jednej kategorii, nagłówek bierze jej
  // etykietę — np. dla łóżek kontynentalnych (cross-sell = tylko nawierzchniowe)
  // zamiast „Materace w rozmiarze…" wyjdzie „Materace nawierzchniowe w
  // rozmiarze…". Te łóżka mają materac w komplecie, więc zachęcanie do zakupu
  // „materaca" byłoby mylące.
  //
  // Na /de używamy etykiety tylko gdy kategoria MA tłumaczenie — inaczej
  // wyszłaby mieszanka „Materace nawierzchniowe in der Größe…".
  const crossSellCategorySlugs = new Set(crossSell.products.map((p) => p.category));
  const singleCrossSellCat =
    crossSell.sizeMatched && crossSellCategorySlugs.size === 1
      ? allCategories.find((c) => c.slug === [...crossSellCategorySlugs][0])
      : undefined;
  const singleCrossSellLabel =
    singleCrossSellCat &&
    (locale !== "de" || (singleCrossSellCat.label_de?.trim() ?? "") !== "")
      ? singleCrossSellCat.label
      : null;

  // Kolekcja: jeśli produkt jest w kolekcji, pobierz inne produkty z niej.
  const [collection, collectionSiblings] = product.collection_id
    ? await Promise.all([
        getCollection(product.collection_id, locale),
        getCollectionSiblings(
          product.collection_id,
          product.id,
          COLLECTION_SLIDER_LIMIT,
          locale
        ),
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
  const plainDescription = productPlainText(product).slice(0, 5000);
  // URL oferty w bieżącym locale — na /de musi wskazywać stronę DE, inaczej
  // Google widzi rozjazd między canonical (/de/produkt/X) a offers.url.
  const productUrl = `https://${COMPANY.domain}${localizePath(`/produkt/${product.id}`, locale)}`;
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

  // serializeJsonLd escapuje `<` → <: bez tego product.name/description
  // zawierające </script> wybiłyby się z bloku i wstrzyknęły skrypt (audyt LOW).
  const jsonLdHtml = serializeJsonLd(jsonLd);

  // BreadcrumbList — te same okruchy, które widzi klient (nawigacja niżej).
  // Google pokazuje je w wyniku wyszukiwania zamiast surowego URL-a.
  const breadcrumbJsonLd = buildBreadcrumbJsonLd(
    [
      { name: t.product.breadcrumbHome, path: "/" },
      { name: t.product.breadcrumbShop, path: "/sklep" },
      {
        name: categoryLabel ?? product.category,
        path: `/sklep?kategoria=${product.category}`,
      },
      { name: product.name },
    ],
    locale
  );
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
      {/* Meta + GA4: cena ta sama co w JSON-LD (po przecenie), żeby wartość
          zdarzenia zgadzała się z tym, co widzi klient i co czyta Google.
          Nazwa też ta sama co w JSON-LD i w feedzie — inaczej raport GA4
          rozjechałby się z Merchant Center przy pierwszej zmianie nazwy. */}
      <ProductViewEvents
        productId={product.id}
        name={product.name}
        price={jsonLdPrice}
      />
      <script
        type="application/ld+json"
        nonce={nonce}
        dangerouslySetInnerHTML={{ __html: jsonLdHtml }}
      />
      {breadcrumbJsonLd && (
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
        />
      )}

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

      {/* Cross-sell — dla łóżka materace w JEGO rozmiarze spania, w karuzeli.
          Gdy produkt nie ma rozmiaru albo nic nie pasuje (sizeMatched=false)
          → stara kopia i 4 najnowsze z kategorii docelowych. */}
      {crossSell.products.length > 0 && (
        <section className="mb-24">
          <div className="mb-8">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
              {crossSell.sizeMatched
                ? t.product.crossSellSizeEyebrow
                : t.product.crossSellEyebrow}
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              {crossSell.sizeMatched && sleepSize
                ? singleCrossSellLabel
                  ? `${singleCrossSellLabel} ${t.product.crossSellSizeIn} ${formatSleepSize(sleepSize)}`
                  : `${t.product.crossSellSizeHeading} ${formatSleepSize(sleepSize)}`
                : crossSellLabel
                  ? `${t.product.crossSellRecommendedPrefix} ${crossSellLabel.toLowerCase()}`
                  : t.product.crossSellFallbackHeading}
            </h2>
          </div>
          <ProductCarousel>
            {crossSell.products.map((p) => (
              <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} locale={locale} rate={rate} />
            ))}
          </ProductCarousel>
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
          {/* Slider, nie siatka — zgłoszenie właścicielki 2026-08-18: „jak
              wejdziesz w produkt z jakiejś kolekcji, to ja chciałam ten slider
              tam". Siatka spychała opinie o dwa rzędy w dół przy większych
              kolekcjach, a od migracji 75 kolejność ustawia właściciel, więc
              PIERWSZE pozycje są tu tymi, które chciała pokazać najpierw.
              Ten sam ProductCarousel co w produktach polecanych wyżej. */}
          <div id={COLLECTION_SLIDER_ID}>
            <ProductCarousel>
              {collectionSiblings.map((p) => (
                <ProductCard key={p.id} product={p} categoryLabel={categoryLabels.get(p.category)} isInWishlist={wishlistIds.has(p.id)} locale={locale} rate={rate} />
              ))}
            </ProductCarousel>
          </div>

          {/* Wyjście na stronę kolekcji. LINK, nie przycisk: działa bez
              JavaScriptu, otwiera się w nowej karcie i wraca przyciskiem wstecz.
              Slider wyżej pokazuje już całą kolekcję, więc ta strona dokłada
              oglądany produkt z powrotem do zestawu oraz filtry i sortowanie. */}
          <div className="flex justify-center mt-10">
            <LocalizedLink
              href={`/sklep?kolekcja=${encodeURIComponent(collection.slug)}`}
              className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
            >
              {t.product.seeFullCollection}
            </LocalizedLink>
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
          <ReviewList reviews={reviews} productName={product.name} />

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
