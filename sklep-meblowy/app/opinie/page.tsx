import type { Metadata } from "next";
import { getAllApprovedReviews } from "../_lib/reviews";
import { getLocale } from "../_lib/i18n-server";
import { getDictionary } from "../_lib/dictionaries";
import { localizePath } from "../_lib/i18n";
import { alternatesFor } from "../_lib/sitemap-i18n";
import { baseOpenGraph } from "../_lib/seo-og";
import ReviewCard from "../_components/ui/ReviewCard";
import ReviewsGallery from "../_components/ui/ReviewsGallery";
import ReviewsViewSwitch from "../_components/ui/ReviewsViewSwitch";
import { groupReviewPhotosByProduct } from "../_lib/reviews-gallery";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = getDictionary(locale);
  return {
    title: t.reviewsPage.heading,
    description: t.reviewsPage.metaDescription,
    alternates: {
      canonical: localizePath("/opinie", locale),
      languages: alternatesFor("/opinie", { hasDe: true }).languages,
    },
    // openGraph nadpisuje się W CAŁOŚCI — sam `locale` gubi og:image
    // i og:site_name z layoutu. Patrz seo-og.ts.
    openGraph: baseOpenGraph(locale),
  };
}

// Wszystkie zatwierdzone opinie, najnowsze pierwsze — także niskie oceny.
// Filtr `rating >= 4` obowiązuje WYŁĄCZNIE na stronie głównej (12 slotów);
// tutaj ukrywanie krytyki byłoby złamaniem wymogu z dyrektywy Omnibus.
export default async function OpiniePage() {
  const locale = await getLocale();
  const t = getDictionary(locale);
  const reviews = await getAllApprovedReviews(locale);
  const grupyZdjec = groupReviewPhotosByProduct(reviews);

  // Lista opinii zostaje SERWEROWA — przełącznik dostaje ją jako dzieci,
  // zamiast budować ją po stronie klienta.
  const lista = (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {reviews.map((r) => (
        <ReviewCard key={r.id} review={r} locale={locale} wariant="pelna" />
      ))}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="max-w-3xl mb-12">
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3">
          {t.reviewsPage.eyebrow}
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)] mb-4">
          {t.reviewsPage.heading}
        </h1>
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          {t.reviewsPage.intro}
        </p>
      </div>

      {reviews.length === 0 ? (
        <p className="text-sm text-[var(--muted)] italic">{t.reviewsPage.empty}</p>
      ) : grupyZdjec.length === 0 ? (
        // Żadna opinia nie ma zdjęć — przełącznik prowadziłby do pustej siatki,
        // więc strona wygląda dokładnie jak przed dodaniem galerii.
        lista
      ) : (
        <ReviewsViewSwitch
          locale={locale}
          gallery={<ReviewsGallery groups={grupyZdjec} locale={locale} />}
        >
          {lista}
        </ReviewsViewSwitch>
      )}
    </div>
  );
}
