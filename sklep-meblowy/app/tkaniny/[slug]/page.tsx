import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getFabricBySlug, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pickLocalized, localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import { formatMoney } from "@/app/_lib/money";
import { sanitizeRichHtml, extractShortDescription } from "@/app/_lib/product-html";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import FabricSwatchGrid from "@/app/_components/ui/FabricSwatchGrid";
import FabricFeaturedProducts from "@/app/_components/ui/FabricFeaturedProducts";
import { createAdminClient } from "@/app/_lib/supabase/server";

// Strona tkaniny (spec 2026-07-21): opis + wzornik (siatka kolorów z
// color_images) + plakietka grupy cenowej + sekcja „Meble w tej tkaninie"
// (wybrane produkty jako kafelki → /produkt/[id], gdy dostępne).

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const fabric = await getFabricBySlug(slug);
  if (!fabric) return { title: t.fabrics.notFoundTitle };
  const desc = pickLocalized(fabric.description ?? "", fabric.description_de, locale);
  const plPath = `/tkaniny/${fabric.slug}`;
  const hasDe = !!fabric.name_de && fabric.name_de.trim().length > 0;
  return {
    title: pickLocalized(fabric.name, fabric.name_de, locale),
    description: desc ? extractShortDescription(desc, 160) : undefined,
    alternates: {
      canonical: localizePath(plPath, locale),
      languages: alternatesFor(plPath, { hasDe }).languages,
    },
  };
}

export default async function TkaninaPage({ params }: Props) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [fabric, groups, rate] = await Promise.all([
    getFabricBySlug(slug),
    getFabricPriceGroups(),
    getEurRate(),
  ]);
  if (!fabric) notFound();

  const group = groups.find((g) => g.id === fabric.group_id);
  const effective = (group?.surcharge ?? 0) + (fabric.price ?? 0);
  const description = pickLocalized(fabric.description ?? "", fabric.description_de, locale);
  const colors = (fabric.colors ?? []).map((c) => c.trim()).filter(Boolean);

  // Wybrane produkty („Meble w tej tkaninie"): defensywne ?? [] (stary cache
  // bez kolumny). Dociągnięcie jednym zapytaniem, tylko aktywne; kolejność wg
  // zapisanej listy, nieznane/nieaktywne pominięte.
  const featuredIds = fabric.featured_product_ids ?? [];
  let featuredProducts: { id: string; name: string; image: string | null }[] = [];
  if (featuredIds.length > 0) {
    const supabase = await createAdminClient();
    const { data } = await supabase
      .from("products")
      .select("id, name, name_de, images")
      .eq("is_active", true)
      .in("id", featuredIds);
    const byId = new Map(
      (
        (data ?? []) as {
          id: string;
          name: string;
          name_de: string | null;
          images: string[] | null;
        }[]
      ).map((p) => [p.id, p])
    );
    featuredProducts = featuredIds
      .map((id) => byId.get(id))
      .filter((p): p is NonNullable<typeof p> => !!p)
      .map((p) => ({
        id: p.id,
        name: pickLocalized(p.name, p.name_de, locale),
        image: p.images?.[0] ?? null,
      }));
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-sans text-[var(--muted)] mb-12 uppercase tracking-widest">
        <LocalizedLink href="/" className="hover:text-[var(--color-gold)] transition-colors">
          {t.product.breadcrumbHome}
        </LocalizedLink>
        <span>/</span>
        <LocalizedLink href="/tkaniny" className="hover:text-[var(--color-gold)] transition-colors">
          {t.fabrics.heading}
        </LocalizedLink>
        <span>/</span>
        <span className="text-[var(--fg)] normal-case tracking-normal">
          {pickLocalized(fabric.name, fabric.name_de, locale)}
        </span>
      </nav>

      <div className="mb-10">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.fabrics.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-4">
          {pickLocalized(fabric.name, fabric.name_de, locale)}
        </h1>
        <div className="flex items-center gap-3 flex-wrap text-sm font-sans">
          {group && (
            <span className="px-3 py-1 rounded-full border border-[var(--color-gold)] text-[var(--color-gold-text)] font-semibold">
              {pickLocalized(group.name, group.name_de, locale)}
              {" · "}
              {effective > 0 ? `+${formatMoney(effective, locale, rate)}` : t.fabrics.groupNoSurcharge}
            </span>
          )}
          {fabric.category && (
            <span className="text-[var(--muted)]">
              {t.fabrics.typeLabel}: {fabric.category}
            </span>
          )}
        </div>
      </div>

      {description && (
        <div
          className="rich-text text-[var(--fg)] leading-relaxed mb-12 max-w-3xl"
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(description) }}
        />
      )}

      {colors.length > 0 && (
        <section className="mb-12">
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
            {t.fabrics.swatchHeading}
          </h2>
          <FabricSwatchGrid
            colors={colors}
            images={fabric.color_images ?? {}}
            name={pickLocalized(fabric.name, fabric.name_de, locale)}
          />
        </section>
      )}

      {featuredProducts.length > 0 && (
        <section>
          <h2 className="font-display text-2xl font-bold text-[var(--fg)] mb-6">
            {t.fabrics.productionHeading}
          </h2>
          <FabricFeaturedProducts products={featuredProducts} />
        </section>
      )}
    </div>
  );
}
