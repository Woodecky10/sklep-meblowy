import { notFound } from "next/navigation";
import Image from "next/image";
import type { Metadata } from "next";
import { getBundleBySlug } from "@/app/_lib/bundles-server";
import { getLocale } from "@/app/_lib/i18n-server";
import { getDictionary } from "@/app/_lib/dictionaries";
import BundleConfigurator from "@/app/_components/ui/BundleConfigurator";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Prosta strona zestawu (spec 2026-07-16): nazwa + opis, składniki z linkami
// do kart, konfigurator opcji obu mebli i dodanie do koszyka. Zdjęcia =
// zdjęcia składników. 404 gdy zestaw nieaktywny/niekompletny.

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const locale = await getLocale();
  const bundle = await getBundleBySlug(slug, locale);
  if (!bundle) return {};
  return {
    title: bundle.name,
    description: bundle.description ?? undefined,
  };
}

export default async function ZestawPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const locale = await getLocale();
  const t = getDictionary(locale);
  const bundle = await getBundleBySlug(slug, locale);
  if (!bundle) notFound();

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-2">
        {t.bundle.badge}
      </p>
      <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-4">{bundle.name}</h1>
      {bundle.description && (
        <p className="text-[var(--muted)] mb-10 max-w-2xl">{bundle.description}</p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        {/* Składniki — zdjęcia + linki do kart produktów */}
        <div className="flex flex-col gap-6">
          {bundle.components.map((p) => (
            <LocalizedLink
              key={p.id}
              href={`/produkt/${p.id}`}
              className="flex gap-4 items-center p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:border-[var(--color-gold)] transition-colors"
            >
              {p.images?.[0] && (
                <Image
                  src={p.images[0]}
                  alt={p.name}
                  width={112}
                  height={112}
                  className="w-28 h-28 rounded-xl object-cover"
                />
              )}
              <div>
                <p className="font-display text-lg font-semibold text-[var(--fg)]">{p.name}</p>
                <p className="text-sm text-[var(--muted)]">{p.description?.slice(0, 120)}</p>
              </div>
            </LocalizedLink>
          ))}
        </div>

        {/* Konfigurator + cena */}
        <div className="lg:sticky lg:top-40 self-start">
          <BundleConfigurator bundle={bundle} />
        </div>
      </div>
    </div>
  );
}
