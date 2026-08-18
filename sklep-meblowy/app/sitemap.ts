import type { MetadataRoute } from "next";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { COMPANY } from "@/app/_lib/company";
import { getCategories } from "@/app/_lib/categories";
import { getAllCollections } from "@/app/_lib/collections";
import { sitemapAlternates } from "@/app/_lib/sitemap-i18n";
import { DE_ENABLED } from "@/app/_lib/i18n";
import { getPagesForSitemap } from "@/app/_lib/pages-server";
import { getActiveBundleSlugs } from "@/app/_lib/bundles-server";

// Sitemap dla Google. Renderowany przy każdym żądaniu (no caching) —
// na razie OK przy małej liczbie produktów. Jeśli kiedyś będzie 10k+
// produktów, można dodać revalidate albo cache.
//
// SKIPujemy: /admin/* (zablokowane w robots.txt), /konto/*, /checkout/*,
// /koszyk, /ulubione, /logowanie, /rejestracja, /reset-hasla. Te strony
// są user-specific albo transakcyjne — brak wartości SEO.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const BASE = `https://${COMPANY.domain}`;
  const now = new Date();

  // Strony zakupowe (home, /sklep) są w PEŁNI przetłumaczone przez słownik UI
  // (nie zależą od `needs_translation` per produkt) — publikujemy DE, o ile
  // wersja niemiecka nie jest zamrożona (DE_ENABLED w i18n.ts).
  // Dodajemy osobne wpisy /de i /de/sklep + wzajemne alternates na obu wpisach.
  const homeAlts = sitemapAlternates("/", { hasDe: true }, BASE).languages;
  const sklepAlts = sitemapAlternates("/sklep", { hasDe: true }, BASE).languages;
  const tkaninyAlts = sitemapAlternates("/tkaniny", { hasDe: true }, BASE).languages;

  // ⏸ Przy zamrożonym DE żaden URL '/de/...' nie może wyjść w sitemapie —
  // zgłaszalibyśmy Google'owi adresy, które odpowiadają redirectem.
  const deEntry = (entry: MetadataRoute.Sitemap[number]): MetadataRoute.Sitemap =>
    DE_ENABLED ? [entry] : [];

  // Statyczne strony publiczne — kolejność = priorytet wizualny.
  // Info/legal (o-nas, kontakt, dostawa, zwroty, regulamin, prywatnosc) NIE
  // dostają DE na tym etapie (brak tłumaczeń) — zostają PL-only.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,            lastModified: now, changeFrequency: "daily",   priority: 1.0, alternates: { languages: homeAlts } },
    ...deEntry({ url: `${BASE}/de`,         lastModified: now, changeFrequency: "daily",  priority: 1.0, alternates: { languages: homeAlts } }),
    { url: `${BASE}/sklep`,       lastModified: now, changeFrequency: "daily",   priority: 0.9, alternates: { languages: sklepAlts } },
    ...deEntry({ url: `${BASE}/de/sklep`,   lastModified: now, changeFrequency: "daily",  priority: 0.9, alternates: { languages: sklepAlts } }),
    { url: `${BASE}/tkaniny`,     lastModified: now, changeFrequency: "weekly",  priority: 0.7, alternates: { languages: tkaninyAlts } },
    ...deEntry({ url: `${BASE}/de/tkaniny`, lastModified: now, changeFrequency: "weekly", priority: 0.7, alternates: { languages: tkaninyAlts } }),
    { url: `${BASE}/o-nas`,       lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/kontakt`,     lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/opinie`,      lastModified: now, changeFrequency: "weekly",  priority: 0.5 },
    { url: `${BASE}/dostawa`,     lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/zwroty`,      lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/regulamin`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/prywatnosc`,  lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];

  // Dynamiczne wpisy wymagają Supabase. Gdy baza jest niedostępna (build bez
  // env, chwilowa awaria), degradujemy do tras statycznych zamiast wywalać
  // cały build/deploy — Google dostanie minimum, kolejny render uzupełni.
  try {
    // Każdy WIDOCZNY węzeł drzewa jako filtr /sklep?kategoria=X. Listing węzła
    // jest nadzbiorem listingów jego dzieci — to zwykły układ kategorii
    // w sklepie, kanonikale są rozłączne per węzeł. Ukryte gałęzie nie wchodzą
    // (getCategories filtruje efektywną widoczność).
    const categories = await getCategories();
    const categoryRoutes: MetadataRoute.Sitemap = categories.map((c) => ({
      url: `${BASE}/sklep?kategoria=${c.slug}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: 0.7,
    }));

    // Wszystkie kolekcje jako filtry /sklep?kolekcja=X
    const collections = await getAllCollections();
    const collectionRoutes: MetadataRoute.Sitemap = collections.map((c) => ({
      url: `${BASE}/sklep?kolekcja=${c.slug}`,
      lastModified: new Date(c.updated_at),
      changeFrequency: "weekly",
      priority: 0.6,
    }));

    // Produkty publiczne — admin client (bez cookies(), które w prerenderze
    // rzuca kontrolny DynamicServerError) + jawny filtr is_active=true
    // odtwarzający publiczną politykę RLS: sitemap nie indeksuje ukrytych.
    const supabase = await createAdminClient();
    const { data: products } = await supabase
      .from("products")
      .select("id, created_at, needs_translation")
      .eq("is_active", true)
      .order("created_at", { ascending: false });

    // Per produkt: wpis PL zawsze; wpis DE TYLKO gdy produkt przetłumaczony
    // (`needs_translation === false`). Oba wpisy noszą tę samą mapę alternates
    // (wzajemnie się referują) — gdy DE istnieje, mapa zawiera `de`, inaczej
    // tylko `pl` + `x-default` (Google.de nie zindeksuje pół-polskiej strony).
    const productRoutes: MetadataRoute.Sitemap = (products ?? []).flatMap((p) => {
      const product = p as {
        id: string;
        created_at: string;
        needs_translation?: boolean;
      };
      const plPath = `/produkt/${product.id}`;
      const hasDe = product.needs_translation === false;
      const lastModified = new Date(product.created_at);
      const alternates = {
        languages: sitemapAlternates(plPath, { hasDe }, BASE).languages,
      };
      const entries: MetadataRoute.Sitemap = [
        {
          url: `${BASE}${plPath}`,
          lastModified,
          changeFrequency: "weekly",
          priority: 0.8,
          alternates,
        },
      ];
      if (DE_ENABLED && hasDe) {
        entries.push({
          url: `${BASE}/de${plPath}`,
          lastModified,
          changeFrequency: "weekly",
          priority: 0.8,
          alternates,
        });
      }
      return entries;
    });

    // Podstrony (krok C): tylko opublikowane; DE tylko przy przetłumaczonym
    // tytule (hasDe) — spójnie z wpisami produktów.
    const pages = await getPagesForSitemap();
    const pageRoutes: MetadataRoute.Sitemap = pages.flatMap((p) => {
      const plPath = `/${p.slug}`;
      const hasDe = !!p.title_de && p.title_de.trim().length > 0;
      const lastModified = new Date(p.updated_at);
      const alternates = sitemapAlternates(plPath, { hasDe }, BASE);
      const entries: MetadataRoute.Sitemap = [
        {
          url: `${BASE}${plPath}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.5,
          alternates,
        },
      ];
      if (DE_ENABLED && hasDe) {
        entries.push({
          url: `${BASE}/de${plPath}`,
          lastModified,
          changeFrequency: "monthly",
          priority: 0.5,
          alternates,
        });
      }
      return entries;
    });

    // Zestawy (spec 2026-07-16): strona /zestaw/[slug] jest w pełni tłumaczona
    // (nazwa/opis z DB przez localizeBundle, UI przez słownik) — zawsze PL + DE
    // z wzajemnymi alternates, jak home/sklep. getActiveBundleSlugs zwraca tylko
    // aktywne, kompletne zestawy.
    const bundleSlugs = await getActiveBundleSlugs();
    const bundleRoutes: MetadataRoute.Sitemap = bundleSlugs.flatMap((slug) => {
      const plPath = `/zestaw/${slug}`;
      const alternates = {
        languages: sitemapAlternates(plPath, { hasDe: true }, BASE).languages,
      };
      return [
        {
          url: `${BASE}${plPath}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.7,
          alternates,
        },
        ...deEntry({
          url: `${BASE}/de${plPath}`,
          lastModified: now,
          changeFrequency: "weekly" as const,
          priority: 0.7,
          alternates,
        }),
      ];
    });

    // Tkaniny (spec 2026-07-21): strona /tkaniny/[slug]. DE tylko gdy name_de
    // uzupełnione (opis i tak fallbackuje do PL — nie indeksujemy pół-polskich).
    const { data: fabricRows } = await supabase
      .from("fabrics")
      .select("slug, name_de, created_at");
    const fabricRoutes: MetadataRoute.Sitemap = (fabricRows ?? []).flatMap((f) => {
      const fabric = f as { slug: string; name_de: string | null; created_at: string };
      const plPath = `/tkaniny/${fabric.slug}`;
      const hasDe = !!fabric.name_de && fabric.name_de.trim().length > 0;
      const lastModified = new Date(fabric.created_at);
      const alternates = { languages: sitemapAlternates(plPath, { hasDe }, BASE).languages };
      const entries: MetadataRoute.Sitemap = [
        { url: `${BASE}${plPath}`, lastModified, changeFrequency: "monthly", priority: 0.5, alternates },
      ];
      if (DE_ENABLED && hasDe) {
        entries.push({ url: `${BASE}/de${plPath}`, lastModified, changeFrequency: "monthly", priority: 0.5, alternates });
      }
      return entries;
    });

    return [...staticRoutes, ...categoryRoutes, ...collectionRoutes, ...productRoutes, ...pageRoutes, ...bundleRoutes, ...fabricRoutes];
  } catch (err) {
    // Kontrolne błędy Next (dynamic rendering, redirect itp.) mają lecieć
    // dalej — łapiemy wyłącznie realne awarie danych.
    if (
      err &&
      typeof err === "object" &&
      "digest" in err &&
      typeof (err as { digest: unknown }).digest === "string" &&
      ((err as { digest: string }).digest.startsWith("DYNAMIC_") ||
        (err as { digest: string }).digest.startsWith("NEXT_"))
    ) {
      throw err;
    }
    console.error("[sitemap] dane z Supabase niedostępne — zwracam trasy statyczne:", err);
    return staticRoutes;
  }
}
