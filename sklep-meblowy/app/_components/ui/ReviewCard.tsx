import StarRating from "./StarRating";
import LocalizedLink from "./LocalizedLink";
import { anonymizeAuthor, formatReviewDate } from "@/app/_lib/reviews-display";
import type { Locale } from "@/app/_lib/i18n";
import type { PublicReview } from "@/app/_lib/reviews";

// Karta jednej opinii — komponent SERWEROWY (zero JS na kliencie). Renderuje
// się także wewnątrz ProductCarousel, który jest kliencki: serwerowe dzieci
// klienta to ten sam wzorzec, co ProductCard w karuzeli produktów.
//
// ⚠️ PublicReview importowane WYŁĄCZNIE jako `import type` — reviews.ts wciąga
// ./supabase/server (a przez to next/headers), więc import wartościowy
// wsysałby serwerowy moduł do drzewa klienckiego karuzeli.
//
// h-full + flex-col: embla nie wyrównuje wysokości slajdów, a cytaty mają
// różne długości. Bez tego karty w jednym rzędzie mają różne wysokości.
export default function ReviewCard({
  review,
  locale,
}: {
  review: PublicReview;
  locale: Locale;
}) {
  const author = anonymizeAuthor(review.author_name, locale);
  const de = locale === "de";
  return (
    <figure
      data-review-card
      className="h-full flex flex-col gap-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6"
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <StarRating value={review.rating} size={14} />
        <span className="text-xs text-[var(--muted)]">
          {formatReviewDate(review.created_at, locale)}
        </span>
      </div>

      <blockquote className="flex-1 whitespace-pre-wrap leading-relaxed text-[var(--fg)]">
        {review.comment}
      </blockquote>

      <figcaption className="text-sm text-[var(--muted)]">
        <span className="font-semibold text-[var(--fg)]">{author}</span>
        <span className="mx-1.5">·</span>
        <span>{de ? "Verifizierter Kauf" : "Zweryfikowany zakup"}</span>
      </figcaption>

      {review.product_name && (
        <LocalizedLink
          href={`/produkt/${review.product_id}`}
          className="text-sm font-sans text-[var(--color-gold-text)] hover:underline"
        >
          {review.product_name}
        </LocalizedLink>
      )}
    </figure>
  );
}
