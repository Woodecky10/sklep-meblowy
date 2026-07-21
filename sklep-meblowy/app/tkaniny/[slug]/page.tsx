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

// Strona tkaniny (spec 2026-07-21): opis + wzornik (siatka kolorów z
// color_images) + plakietka grupy cenowej + link do /sklep z filtrem tkaniny.

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
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-4">
            {colors.map((code) => {
              const img = fabric.color_images?.[code];
              return (
                <figure key={code} className="flex flex-col items-center gap-2 text-center">
                  <span className="relative w-full aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={`${fabric.name} ${code}`} loading="lazy" className="w-full h-full object-cover" />
                    ) : (
                      <span className="w-full h-full flex items-center justify-center text-sm text-[var(--muted)]">
                        {code}
                      </span>
                    )}
                  </span>
                  <figcaption className="text-xs text-[var(--muted)]">{code}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      <LocalizedLink
        href={`/sklep?tkanina=${encodeURIComponent(fabric.name)}`}
        className="inline-block px-6 py-3 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
      >
        {t.fabrics.seeProducts}
      </LocalizedLink>
    </div>
  );
}
