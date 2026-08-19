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

      {/* Opinia może mieć do 2000 znaków (limit w app/opinia/[token]/actions.ts),
          a selectHomepageReviews (reviews-display.ts) filtruje tylko DOLNY
          próg długości — górnego nie ma. Slajdy w ProductCarousel rozciągają
          się do najwyższego elementu rzędu, a na lg kolumna ma
          basis-[calc(25%-1.5rem)], więc jedna długa opinia zrobiłaby ze
          wszystkich kart wąskie, bardzo wysokie słupy tekstu. line-clamp-6
          obcina wizualnie na home — pełna treść jest zawsze dostępna na
          /opinie, do której prowadzi przycisk pod sliderem.

          ⚠️ Rozciąganie (`flex-1`) MUSI siedzieć na opakowaniu, a nie na tym
          samym elemencie co `line-clamp-6`. Na jednym elemencie flex rozciąga
          pudełko do wysokości najwyższej karty w rzędzie (zmierzone: 176 px
          przy 6 liniach × 26 px = 156 px), więc pod wielokropkiem zostaje
          miejsce i przeglądarka dorysowuje SIÓDMĄ linię: czytelnik widzi
          „…w zapowiedziany… / oknie.". Dodatkowo flex blokifikuje
          `display: -webkit-box` do `flow-root`, więc wymuszanie displayu
          niczego nie ratuje. Opakowanie rośnie, cytat obcina się na sześciu
          liniach. */}
      <div className="flex-1">
        <blockquote className="whitespace-pre-wrap leading-relaxed text-[var(--fg)] line-clamp-6">
          {review.comment}
        </blockquote>
      </div>

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
