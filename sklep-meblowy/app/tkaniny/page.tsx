import type { Metadata } from "next";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import { localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import { getEurRate } from "@/app/_lib/store-settings";
import FabricGroupSection from "./FabricGroupSection";

// Katalog tkanin (spec 2026-07-21): sekcje wg grup cenowych, kafelki tkanin
// linkują do /tkaniny/[slug]. Route statyczny — przykrywa dawną podstronę CMS
// o slugu "tkaniny" (slug zarezerwowany w pages.ts).
//
// Od 2026-07-30 sekcje są zwijane (spec 2026-07-30-tkaniny-grupy-rozwijanie):
// cały markup sekcji siedzi w FabricGroupSection, tutaj zostaje pobranie
// danych, metadane i nagłówek strony.

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
        <FabricGroupSection
          key={group.id}
          group={group}
          items={items}
          locale={locale}
          rate={rate}
        />
      ))}
    </div>
  );
}
