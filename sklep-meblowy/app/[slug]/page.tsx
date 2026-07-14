import type { Metadata } from "next";
import { Fragment } from "react";
import { notFound } from "next/navigation";
import { getLocale } from "@/app/_lib/i18n-server";
import { localizePath } from "@/app/_lib/i18n";
import { alternatesFor } from "@/app/_lib/sitemap-i18n";
import {
  PAGE_SLUG_RE,
  localizePageMeta,
  pageHasDe,
  canViewPage,
} from "@/app/_lib/pages";
import { getPageBySlug } from "@/app/_lib/pages-server";
import { getPageBlocks } from "@/app/_lib/blocks-server";
import {
  localizeBlock,
  isSystemBlockType,
  type LocalizedContentBlock,
} from "@/app/_lib/blocks";
import { getIsAdmin } from "@/app/_lib/admin";
import ContentBlock from "@/app/_components/blocks/ContentBlock";

// Pierwszy top-level dynamiczny segment: statyczne trasy (sklep, koszyk,
// (legal) itd.) mają pierwszeństwo — tu trafiają tylko nieznane slugi.
// /de/<slug> działa automatycznie (proxy stripLocale jest prefiksowe).

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  if (!PAGE_SLUG_RE.test(slug)) return {};
  const [page, locale] = await Promise.all([getPageBySlug(slug), getLocale()]);
  if (!page) return {};
  // Szkic: metadata (tytuł/opis) tylko dla admina — anonim dostaje pusty
  // head, zanim strona zrobi notFound() (bez wycieku treści do źródła 404).
  if (!page.published && !(await getIsAdmin())) return {};
  const meta = localizePageMeta(page, locale);
  const plPath = `/${page.slug}`;
  return {
    title: meta.title,
    description: meta.seoDescription ?? undefined,
    // Szkic nigdy nie trafia do indeksu (podgląd admina renderuje się z 200).
    ...(page.published ? {} : { robots: { index: false, follow: false } }),
    alternates: {
      canonical: localizePath(plPath, locale),
      languages: alternatesFor(plPath, { hasDe: pageHasDe(page) }).languages,
    },
    openGraph: { locale: locale === "de" ? "de_DE" : "pl_PL" },
  };
}

export default async function PodstronaPage({ params }: Props) {
  const { slug } = await params;
  if (!PAGE_SLUG_RE.test(slug)) notFound();
  const [page, locale] = await Promise.all([getPageBySlug(slug), getLocale()]);
  if (!page) notFound();
  const isDraftPreview = !page.published;
  // Short-circuit: auth sprawdzamy tylko dla szkiców (opublikowane bez kosztu).
  if (isDraftPreview && !canViewPage(page.published, await getIsAdmin())) {
    notFound();
  }

  const blocks = (await getPageBlocks(page.id))
    .map((b) => localizeBlock(b, locale))
    .filter(
      (b): b is LocalizedContentBlock =>
        b !== null && b.visible && !isSystemBlockType(b.type)
    );
  const meta = localizePageMeta(page, locale);

  return (
    <div className="pb-8">
      {isDraftPreview && (
        <div className="max-w-7xl mx-auto px-6 pt-6">
          <p className="inline-flex px-4 py-2 rounded-full text-xs font-sans uppercase tracking-widest bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            Szkic — widoczny tylko dla administratora
          </p>
        </div>
      )}
      <header className="max-w-7xl mx-auto px-6 pt-16 text-center">
        <h1 className="font-display text-4xl md:text-5xl font-bold text-[var(--fg)]">
          {meta.title}
        </h1>
      </header>
      {blocks.map((b) => (
        <Fragment key={b.id}>
          <ContentBlock block={b} locale={locale} />
        </Fragment>
      ))}
    </div>
  );
}
