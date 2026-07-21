import type { Metadata } from "next";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { pickLocalized, localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import { formatMoney } from "@/app/_lib/money";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Fabric } from "@/app/_lib/types";

// Katalog tkanin (spec 2026-07-21): sekcje wg grup cenowych, kafelki tkanin
// linkują do /tkaniny/[slug]. Route statyczny — przykrywa dawną podstronę CMS
// o slugu "tkaniny" (slug zarezerwowany w pages.ts).

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

// Polska liczba mnoga: 1 kolor / 2-4 kolory / 5+ kolorów (12-14 → "kolorów").
function colorsLabel(n: number, t: ReturnType<typeof getDictionary>): string {
  if (n === 1) return t.fabrics.colorsOne;
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 >= 2 && d10 <= 4 && !(d100 >= 12 && d100 <= 14)) return t.fabrics.colorsFew;
  return t.fabrics.colorsMany;
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
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={thumb} alt={pickLocalized(f.name, f.name_de, locale)} loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
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
