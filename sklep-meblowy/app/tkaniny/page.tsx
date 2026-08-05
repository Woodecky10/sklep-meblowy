import type { Metadata } from "next";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pickLocalized, localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import { formatMoney } from "@/app/_lib/money";
import { colorsLabel } from "@/app/_lib/fabric-labels";
import Link from "next/link";
import Image from "next/image";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Fabric } from "@/app/_lib/types";

// Katalog tkanin (spec 2026-07-21): sekcje wg grup cenowych, kafelki tkanin
// linkują do /tkaniny/[slug]. Route statyczny — przykrywa dawną podstronę CMS
// o slugu "tkaniny" (slug zarezerwowany w pages.ts).
//
// Sekcje NIE są zwijane — decyzja właściciela z 2026-07-30 (wieczorna korekta
// speca): zwijane karty grup cenowych żyją na karcie produktu (VariantSelector),
// a katalog pokazuje wszystko od razu.

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.fabrics.heading,
    description: t.fabrics.intro,
    alternates: {
      canonical: localizePath("/tkaniny", locale),
      languages: alternatesFor("/tkaniny", { hasDe: true }).languages,
    },
  };
}

function fabricThumb(f: Fabric): string | undefined {
  return (f.colors ?? []).map((c) => f.color_images?.[c]).find(Boolean);
}

export default async function TkaninyPage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const [fabrics, groups, rate] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    getEurRate(),
  ]);
  const sections = groups
    .map((g) => ({ group: g, items: fabrics.filter((f) => f.group_id === g.id) }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
          {t.fabrics.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">{t.fabrics.heading}</h1>
        <p className="text-sm text-[var(--muted)] mt-3 max-w-2xl">{t.fabrics.intro}</p>
        {/* Wejście do zamawiania próbek (spec 2026-08-01). Zwykły Link, nie
            LocalizedLink: /probki jest PL-only (DE zamrożone flagą DE_ENABLED),
            więc prefiks /de prowadziłby donikąd. */}
        <Link
          href="/probki"
          className="inline-block mt-6 px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Zamów próbki tkanin →
        </Link>
      </div>

      {sections.map(({ group, items }) => (
        <section key={group.id} className="mb-16">
          <div className="flex items-baseline gap-3 mb-6 flex-wrap">
            <h2 className="font-display text-2xl font-bold text-[var(--fg)]">
              {pickLocalized(group.name, group.name_de, locale)}
            </h2>
            <span className="text-sm font-sans text-[var(--color-gold-text)] font-semibold">
              {group.surcharge > 0
                ? `+${formatMoney(group.surcharge, locale, rate)}`
                : t.fabrics.groupNoSurcharge}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
            {items.map((f) => {
              const thumb = fabricThumb(f);
              const n = (f.colors ?? []).length;
              return (
                <LocalizedLink
                  key={f.id}
                  href={`/tkaniny/${f.slug}`}
                  className="group flex flex-col gap-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-4 hover:border-[var(--color-gold)] transition-colors"
                >
                  <span className="relative block aspect-square rounded-xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
                    {thumb ? (
                      // Siatka: 2 kolumny do 640px, 3 do 1024px, dalej 5.
                      <Image
                        src={thumb}
                        alt={pickLocalized(f.name, f.name_de, locale)}
                        fill
                        sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
                        className="object-cover"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
                        {f.name.slice(0, 2).toUpperCase()}
                      </span>
                    )}
                  </span>
                  <span>
                    <span className="block font-display text-base font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
                      {pickLocalized(f.name, f.name_de, locale)}
                    </span>
                    {n > 0 && (
                      <span className="block text-xs text-[var(--muted)] mt-0.5">
                        {n} {colorsLabel(n, t)}
                      </span>
                    )}
                  </span>
                </LocalizedLink>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
