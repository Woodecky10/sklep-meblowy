import StarRating from "./StarRating";
import { getLocale } from "@/app/_lib/i18n-server";
import { anonymizeAuthor, formatReviewDate } from "@/app/_lib/reviews-display";
import type { ProductReview } from "@/app/_lib/types";

export default async function ReviewList({ reviews }: { reviews: ProductReview[] }) {
  const locale = await getLocale();
  const de = locale === "de";
  const c = de
    ? {
        empty: "Für dieses Produkt gibt es noch keine Bewertungen. Seien Sie nach dem Kauf der Erste.",
        verified: "Verifizierter Kauf",
      }
    : {
        empty: "Ten produkt nie ma jeszcze opinii. Bądź pierwszy po zakupie.",
        verified: "Zweryfikowany zakup",
      };

  if (reviews.length === 0) {
    return (
      <p className="text-sm text-[var(--muted)] italic">
        {c.empty}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {reviews.map((r) => (
        <div
          key={r.id}
          className="pb-6 border-b border-[var(--border)] last:border-0 last:pb-0"
        >
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <StarRating value={r.rating} size={14} />
              <p className="font-sans text-sm font-semibold text-[var(--fg)]">
                {anonymizeAuthor(r.author_name, locale)}
              </p>
              <span className="inline-flex items-center gap-1 text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)]">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  aria-hidden
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
                {c.verified}
              </span>
            </div>
            <p className="text-xs text-[var(--muted)]">
              {formatReviewDate(r.created_at, locale)}
            </p>
          </div>
          {r.comment && (
            <p className="text-sm text-[var(--muted)] leading-relaxed whitespace-pre-wrap">
              {r.comment}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}
