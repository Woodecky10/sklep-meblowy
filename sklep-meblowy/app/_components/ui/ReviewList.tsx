import StarRating from "./StarRating";
import { getLocale } from "@/app/_lib/i18n-server";
import type { ProductReview } from "@/app/_lib/types";

function formatDate(iso: string, de: boolean): string {
  try {
    return new Date(iso).toLocaleDateString(de ? "de-DE" : "pl-PL", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

// Zastąp pełne imię i nazwisko formą "Anna K." — zgodne z RODO (minimalizacja danych).
function anonymize(name: string | null | undefined, de: boolean): string {
  if (!name) return de ? "Kunde" : "Klient";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0];
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0] ?? "";
  return `${first} ${lastInitial}.`;
}

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
                {anonymize(r.author_name, de)}
              </p>
              <span className="inline-flex items-center gap-1 text-[10px] font-sans uppercase tracking-widest text-[var(--color-gold)]">
                <svg
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
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
              {formatDate(r.created_at, de)}
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
