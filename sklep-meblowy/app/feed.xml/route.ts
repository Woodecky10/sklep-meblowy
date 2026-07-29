import { createAdminClient } from "@/app/_lib/supabase/server";
import { getCategories } from "@/app/_lib/categories";
import { productPlainText, type ProductTextSource } from "@/app/_lib/product-text";
import { buildProductFeedXml, selectFeedItems, type FeedProduct } from "@/app/_lib/product-feed";

// Feed produktowy dla Google Merchant Center → /feed.xml
//
// Merchant Center zasysa ten URL (harmonogram ustawia się w panelu, zwykle raz
// na dobę) i na jego podstawie wystawia meble w bezpłatnych listach produktowych
// oraz w kampaniach Shopping. Konfiguracja po stronie Mikołaja: Merchant Center
// → Produkty → Dodaj feed → „Zaplanowane pobieranie" → https://mollien.pl/feed.xml
//
// Wersja PL/PLN. Feed DE/EUR to osobny URL (Merchant wymaga feedu per kraj) —
// buildProductFeedXml obsługuje już locale "de" i EUR, brakuje tylko routingu
// i przeliczenia kursem; robimy gdy będzie decyzja o promocji na DE.

// `revalidate` włącza prerender trasy (bez tego route handler jest renderowany
// przy każdym żądaniu). Efektywny czas odświeżania to 300 s, nie 3600: Next
// zacieśnia go do najkrótszego revalidate z zależności, a getCategories używa
// `unstable_cache` z 300 s — sprawdzone w .next/prerender-manifest.json
// (initialRevalidateSeconds: 300). Merchant Center czyta feed raz na dobę, więc
// 5 minut świeżości jest z dużym zapasem.
export const revalidate = 3600;

export async function GET() {
  // Admin client (service role, bez cookies) — jak w app/sitemap.ts: w trakcie
  // prerenderu cookies() rzuca kontrolny DynamicServerError. Jawny is_active=true
  // odtwarza publiczną politykę RLS: feed nie wystawia ukrytych produktów.
  const supabase = await createAdminClient();
  const [{ data: rows, error }, categories] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id, name, description, description_sections, price, sale_price, images, category, size_group"
      )
      .eq("is_active", true)
      .order("created_at", { ascending: false }),
    getCategories("pl"),
  ]);

  if (error) {
    // Lepiej oddać 503 niż pusty feed: Merchant Center przy pustym pliku
    // dezaktywuje WSZYSTKIE oferty, a przy błędzie pobrania zachowuje poprzednie.
    console.error("[feed.xml] błąd pobierania produktów z Supabase:", error);
    return new Response("Feed niedostępny — błąd pobierania produktów.", {
      status: 503,
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    });
  }

  const categoryLabels = new Map(categories.map((c) => [c.slug, c.label]));

  const products: FeedProduct[] = (rows ?? []).map((row) => {
    const p = row as {
      id: string;
      name: string | null;
      description: string | null;
      description_sections: unknown;
      price: number | null;
      sale_price: number | null;
      images: string[] | null;
      category: string | null;
      size_group: string | null;
    };
    return {
      id: p.id,
      name: p.name ?? "",
      // Ten sam plain-text co meta description i JSON-LD na karcie produktu —
      // rozjazd opisu między sklepem a ofertą to błąd w panelu Merchant.
      description: productPlainText({
        description: p.description,
        description_sections:
          p.description_sections as ProductTextSource["description_sections"],
      }),
      price: p.price ?? 0,
      salePrice: p.sale_price,
      images: p.images,
      categoryLabel: p.category ? categoryLabels.get(p.category) ?? p.category : null,
      sizeGroup: p.size_group,
    };
  });

  // Pominięte oferty logujemy, żeby braki w danych (produkt bez zdjęcia lub bez
  // ceny) były widoczne u nas, a nie dopiero jako błędy w panelu Google.
  const { skipped } = selectFeedItems(products);
  if (skipped.length > 0) {
    console.warn(
      `[feed.xml] pominięto ${skipped.length} ofert:`,
      skipped.map((s) => `${s.id} (${s.reason})`).join(", ")
    );
  }

  const xml = buildProductFeedXml(products, { locale: "pl", currency: "PLN" });

  return new Response(xml, {
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      // Spójnie z revalidate trasy (300 s) — inaczej CDN trzymałby feed dłużej,
      // niż żyje jego prerender.
      "Cache-Control": "public, max-age=300, s-maxage=300",
    },
  });
}
