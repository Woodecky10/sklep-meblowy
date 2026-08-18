import { Suspense } from "react";
import type { Metadata } from "next";
import {
  getProducts,
  getFilterFacets,
  PRODUCTS_PAGE_LIMIT_MAX,
} from "@/app/_lib/products";
import { resolveShopView } from "@/app/_lib/shop-view";
import { parseOptionFilterParams } from "@/app/_lib/option-filter";
import { parseFeatureFilterParams } from "@/app/_lib/feature-filter";
import { getRatingsForProducts } from "@/app/_lib/reviews";
import { getCategories, getAllCategories } from "@/app/_lib/categories";
import { menuProjection, pathTo } from "@/app/_lib/category-tree";
import { getCollection, getAllCollections } from "@/app/_lib/collections";
import { localizeCollection } from "@/app/_lib/localize";
import { getUserWishlistIds } from "@/app/_lib/wishlist";
import { pluralForm } from "@/app/_lib/plural";
import { getLocale } from "@/app/_lib/i18n-server";
import { getEurRate } from "@/app/_lib/store-settings";
import { localizePath } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { baseOpenGraph } from "@/app/_lib/seo-og";
import ProductCard from "@/app/_components/ui/ProductCard";
import ProductCarousel from "@/app/_components/ui/ProductCarousel";
import FilterBar from "@/app/_components/ui/FilterBar";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import CollectionIntro from "./CollectionIntro";
import CategoryChildren from "./CategoryChildren";
import EmptySearchState from "./EmptySearchState";
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
    // Pełny blok OG (z obrazkiem) — patrz seo-og.ts: `openGraph` jest nadpisywane
    // w całości, więc samo `locale` gubiło og:image z layoutu.
    openGraph: baseOpenGraph(locale),
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

// Uchwyt slidera kolekcji — patrz komentarz przy użyciu niżej.
const SLIDER_ID = "collection-slider";

function parsePositiveNumber(value: string | undefined) {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

// Next oddaje string[] dla powtórzonego parametru (np. ?kategoria=a&kategoria=b),
// mimo że SearchParams obiecuje string. Bez tej normalizacji `.trim()` na
// tablicy rzuca TypeError → 500 na publicznej stronie (stary kod z `query.eq`
// dostawał tablicę i po prostu nie znajdował wyników — bezpieczniej).
function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export default async function SklepPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const sp = await searchParams;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const category = first(sp.kategoria) || undefined;
  // sekcja działa tylko jeśli kategoria nie jest ustawiona — kategoria
  // bardziej szczegółowa wygrywa (user kliknął sub-kategorię z dropdown).
  const sectionSlug = !category && sp.sekcja ? first(sp.sekcja)?.trim() : undefined;
  const sort =
    (sp.sortuj as "alphabetic" | "price_asc" | "price_desc" | "newest") ??
    "alphabetic";
  const page = Number(sp.strona ?? 1);
  const search = first(sp.q)?.trim() || undefined;
  const priceMin = parsePositiveNumber(sp.cena_od);
  const priceMax = parsePositiveNumber(sp.cena_do);
  const inStockOnly = sp.dostepne === "1";
  const collectionSlug = first(sp.kolekcja)?.trim() || undefined;
  // Slider dla czystego wejścia w kolekcję, lista dla wszystkiego innego.
  // Reguła mieszka w shop-view.ts, nie tutaj — inaczej nie dałoby się jej
  // sprawdzić bez renderowania całej strony.
  const view = resolveShopView(sp);
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
    { products, total, pages, correctedFrom, correctedTo },
    facets,
    visibleCategories,
    allCategories,
    allCollections,
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
      // Slider pokazuje CAŁĄ kolekcję, więc omija stronicowanie. Dziś
      // najliczniejsza kolekcja ma 15 produktów przy suficie 100
      // (PRODUCTS_PAGE_LIMIT_MAX). Gdyby kiedyś przerosła ten sufit, slider
      // pokaże pierwszą setkę, a resztę wyda przycisk „Pokaż wszystkie jako
      // listę" — i nie stanie się to po cichu, bo licznik pod nagłówkiem
      // liczy `total`, czyli wszystkie.
      limit: view === "slider" ? PRODUCTS_PAGE_LIMIT_MAX : undefined,
    }),
    getFilterFacets(locale),
    // Filtry i pasek dzieci pokazują tylko widoczne gałęzie…
    getCategories(locale),
    // …a etykieta i okruszki muszą działać też dla ukrytego węzła, bo jego
    // adres pozostaje dostępny (patrz Global Constraints).
    getAllCategories(locale),
    getAllCollections(),
    collectionSlug ? getCollection(collectionSlug, locale) : Promise.resolve(null),
    // wishlist i kurs NIE zależą od listy produktów — kiedyś czekały w drugiej
    // paczce (pełny dodatkowy łańcuch RTT po products).
    getUserWishlistIds(),
    getEurRate(),
  ]);

  // Oceny wymagają id produktów — jedyne genuinie sekwencyjne zapytanie.
  const ratings = await getRatingsForProducts(products.map((p) => p.id));
  const categoryLabels = new Map(allCategories.map((c) => [c.slug, c.label]));

  // Ścieżka od korzenia do wybranego węzła — nagłówek, nadkreślenie i okruszki.
  // `kategoria` wygrywa nad legacy `sekcja`, dokładnie jak w resolveCategoryFilter.
  const activeSlug = category ?? sectionSlug;
  const trail = activeSlug ? pathTo(allCategories, activeSlug) : [];
  const activeNode = trail.length > 0 ? trail[trail.length - 1] : null;

  // Dzieci węzła — TYLKO widoczne, bo to element nawigacji.
  const childNodes = activeNode
    ? visibleCategories
        .filter((c) => c.parent_id === activeNode.id)
        .map((c) => ({ slug: c.slug, label: c.label }))
    : [];

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

  // Czy poza frazą zawęża wynik cokolwiek jeszcze (kategoria, cena, kolekcja,
  // wymiary, facety opcji/cech). Liczy się z rawParams, bo ten zbiera już
  // WSZYSTKIE aktywne parametry — wystarczy odjąć te, które wyniku nie zawężają.
  // Potrzebne stanowi pustego wyniku: komunikat „Nie prowadzimy X" wolno
  // pokazać tylko wtedy, gdy fraza jest jedynym zawężeniem (patrz
  // EmptySearchState). Liczy zachowawczo — parametr obecny, ale niepoprawny
  // (np. `cena_od=abc`) też uznaje za zawężenie, a to spycha komunikat do
  // wariantu, który niczego nie obiecuje.
  const NIEZAWEZAJACE_PARAMY = new Set(["q", "sortuj"]);
  const hasOtherFilters = Object.keys(rawParams).some(
    (k) => !NIEZAWEZAJACE_PARAMY.has(k)
  );

  // Najbardziej szczegółowy filtr wygrywa: kolekcja > wyszukiwanie > kategoria
  // (dowolny poziom drzewa) > domyślny tytuł.
  function resolveHeading(): string {
    if (collection) return collection.label;
    if (search) return `${t.shop.searchPrefix}: „${search}”`;
    if (activeNode) return activeNode.label;
    return t.shop.allProducts;
  }
  const heading = resolveHeading();

  // Nadkreślenie musi opisywać TEN widok, nie zawsze „Kolekcja" — wcześniej nad
  // „Wszystkie produkty" i nad kategorią stało nieprawdziwe „KOLEKCJA".
  // Ta sama kolejność pierwszeństwa co w resolveHeading, żeby nadkreślenie i
  // tytuł nie mogły się rozjechać (np. „Kategoria" nad nazwą kolekcji).
  function resolveEyebrow(): string {
    if (collection) return t.shop.eyebrowCollection;
    if (search) return t.shop.eyebrowSearch;
    // Każdy poziom drzewa to dla klienta „kategoria" — pasek i podkategoria
    // niczym się dla niego nie różnią.
    if (activeNode) return t.shop.eyebrowCategory;
    return t.shop.eyebrowShop;
  }
  const eyebrow = resolveEyebrow();

  // Drzewo do trzech poziomów — te same dane co megamenu, ten sam moduł.
  const filterNodes = menuProjection(visibleCategories);

  // Karty budowane RAZ dla obu widoków. Slider i siatka różnią się wyłącznie
  // opakowaniem — druga kopia tego wywołania rozjechałaby się przy pierwszej
  // zmianie propsów ProductCard, i to tylko w jednym z widoków.
  const cards = products.map((product) => (
    <ProductCard
      key={product.id}
      product={product}
      rating={ratings.get(product.id)}
      categoryLabel={categoryLabels.get(product.category)}
      isInWishlist={wishlistIds.has(product.id)}
      locale={locale}
      rate={rate}
    />
  ));

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      {/* Nagłówek wyśrodkowany TYLKO dla widoku kolekcji — tam tworzy jedną
          kompozycję z wyśrodkowanym opisem pod nim. Ten sam blok obsługuje
          kategorie, wyszukiwanie i „wszystkie produkty"; tam centrowanie dałoby
          wyśrodkowany nagłówek nad lewo-wyrównanymi filtrami, bez niczego, co by
          to uzasadniało. Warunek na `collection`, nie na `collection.description`,
          żeby wszystkie kolekcje wyglądały tak samo — dziś 3 z 4 mają pusty opis. */}
      <div className={`mb-10 ${collection ? "text-center" : ""}`}>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {eyebrow}
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

      {/* Opis kolekcji NAD filtrami — tylko gdy wybrana jest kolekcja i ma opis.
          Puste opisy (dziś 3 z 4 kolekcji) nie zostawiają po sobie odstępu. */}
      {collection?.description && (
        <CollectionIntro
          description={collection.description}
          moreLabel={t.shop.descriptionMore}
          lessLabel={t.shop.descriptionLess}
        />
      )}

      {/* Okruszki: ścieżka w drzewie. Sam nagłówek nie mówi, gdzie klient jest,
          gdy ta sama nazwa może wystąpić na dwóch gałęziach. */}
      {trail.length > 1 && (
        <nav className="flex flex-wrap items-center gap-2 mb-4 text-xs text-[var(--muted)]">
          {trail.slice(0, -1).map((n) => (
            <span key={n.slug} className="flex items-center gap-2">
              <LocalizedLink
                href={`/sklep?kategoria=${n.slug}`}
                className="hover:text-[var(--color-gold)] transition-colors"
              >
                {n.label}
              </LocalizedLink>
              <span aria-hidden="true">/</span>
            </span>
          ))}
          <span className="text-[var(--fg)]">{activeNode?.label}</span>
        </nav>
      )}

      <Suspense>
        <FilterBar
          featureFacets={facets.features}
          optionFacets={facets.options}
          dimensionBounds={facets.dimensions}
          nodes={filterNodes}
          collections={allCollections.map((c) => {
            const lc = localizeCollection(c, locale);
            return { slug: lc.slug, label: lc.label };
          })}
        />
      </Suspense>

      <CategoryChildren items={childNodes} />

      {/* Korekta literówki (search-correction.ts). `correctedFrom` obecne ⇔
          fraza klienta dała zero, a poprawiona coś znalazła.

          Dwa warianty, bo poprawką bywa RDZEŃ ze słownika ręcznego (`kanap`,
          `lozk`) albo prawdziwe, ale 3-znakowe słowo (`flo`, `mio`) — zdanie
          „Pokazujemy wyniki dla «lozk»" wygląda dla klienta jak zepsuty sklep.
          ⚠️ O tym, który wariant, NIE decyduje ta strona: `correctedTo` jest
          obecne dokładnie wtedy, gdy poprawkę wolno zacytować. Gdyby regułę
          powtórzyć tutaj, dwa miejsca decydowałyby o tym samym i cicho by się
          rozjechały.

          break-words, bo w zdaniu siedzi fraza klienta: jedno długie słowo bez
          spacji (55 znaków w teście) wychodziło poza kontener na 390px — ten
          sam wzorzec co w EmptySearchState.tsx.

          ⚠️ Warunek na `products.length` nie jest nadmiarowy. Korekta patrzy na
          `total`, więc przy adresie w rodzaju `?q=sofq&strona=10` poprawiona
          fraza MA wyniki (41 sztuk), ale ta konkretna strona jest już za
          końcem listy. Bez tego warunku klient zobaczyłby „Pokazujemy wyniki
          dla «sofa»" tuż nad „Nie znaleźliśmy nic dla «sofq»" — dwa zdania,
          które sobie przeczą. */}
      {correctedFrom && products.length > 0 && (
        <p className="mb-6 text-sm text-[var(--muted)] break-words">
          {correctedTo ? (
            <>
              {t.shop.correctedShowing}{" "}
              <span className="text-[var(--fg)] font-medium">
                „{correctedTo}”
              </span>{" "}
              — {t.shop.correctedNotFound} „{correctedFrom}”
            </>
          ) : (
            <>
              {t.shop.emptySearchTitle} „{correctedFrom}” —{" "}
              {t.shop.correctedSimilar}
            </>
          )}
        </p>
      )}

      {products.length === 0 ? (
        <EmptySearchState
          query={search}
          categories={filterNodes}
          hasOtherFilters={hasOtherFilters}
          locale={locale}
          labels={{
            emptyTitle: t.shop.emptyTitle,
            emptyHint: t.shop.emptyHint,
            emptyNotCarried: t.shop.emptyNotCarried,
            emptySearchTitle: t.shop.emptySearchTitle,
            emptyCategoriesHint: t.shop.emptyCategoriesHint,
          }}
        />
      ) : view === "slider" ? (
        <>
          {/* Uchwyt dla e2e (kolekcja-slider.spec.ts). Bez niego test musiałby
              celować w klasy Tailwinda z ProductCarousel — te same, których
              używa karuzela „Pełna kolekcja" na karcie produktu, więc test
              zieleniłby się na złym elemencie. */}
          <div id={SLIDER_ID}>
            <ProductCarousel>{cards}</ProductCarousel>
          </div>

          {/* Wyjście ze slidera to LINK, nie przycisk: ma działać bez
              JavaScriptu, dać się otworzyć w nowej karcie i wracać przyciskiem
              wstecz. Powrót do slidera robi ten sam adres BEZ `widok` — dlatego
              nie ma tu drugiego parametru w rodzaju `widok=slider`. */}
          <div className="flex justify-center mt-10">
            <LocalizedLink
              href={`/sklep?kolekcja=${encodeURIComponent(
                collectionSlug ?? ""
              )}&widok=lista`}
              className="px-6 py-3 rounded-full border border-[var(--border)] text-sm font-sans uppercase tracking-widest text-[var(--color-gold)] hover:border-[var(--color-gold)] hover:bg-[var(--color-gold)]/5 transition-colors"
            >
              {t.shop.collectionShowList}
            </LocalizedLink>
          </div>
        </>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {cards}
        </div>
      )}

      <Pagination page={page} pages={pages} searchParams={rawParams} locale={locale} />
    </div>
  );
}
