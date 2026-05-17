import type { MetadataRoute } from "next";
import { createClient } from "@/app/_lib/supabase/server";
import { COMPANY } from "@/app/_lib/company";
import { getCategories } from "@/app/_lib/categories";
import { getAllCollections } from "@/app/_lib/collections";

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

  // Statyczne strony publiczne — kolejność = priorytet wizualny.
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,            lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE}/sklep`,       lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE}/o-nas`,       lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/kontakt`,     lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${BASE}/dostawa`,     lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/zwroty`,      lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/regulamin`,   lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
    { url: `${BASE}/prywatnosc`,  lastModified: now, changeFrequency: "yearly",  priority: 0.3 },
  ];

  // Wszystkie kategorie jako filtry /sklep?kategoria=X
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

  // Wszystkie produkty — pobieramy bez RLS żeby załapać wszystko co publiczne
  // (RLS produktów jest read-all bo to public storefront).
  const supabase = await createClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, created_at")
    .order("created_at", { ascending: false });

  const productRoutes: MetadataRoute.Sitemap = (products ?? []).map((p) => {
    const product = p as { id: string; created_at: string };
    return {
      url: `${BASE}/produkt/${product.id}`,
      lastModified: new Date(product.created_at),
      changeFrequency: "weekly",
      priority: 0.8,
    };
  });

  return [...staticRoutes, ...categoryRoutes, ...collectionRoutes, ...productRoutes];
}
