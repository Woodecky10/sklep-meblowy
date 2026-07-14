import type { LocalizedReviewsContent } from "@/app/_lib/blocks";

export default function ReviewsBlock({ content }: { content: LocalizedReviewsContent }) {
  const { heading, items } = content;
  if (items.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {items.map((item, i) => (
          <figure
            key={i}
            className="bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl p-6 flex flex-col gap-4"
          >
            <span aria-hidden="true" className="font-display text-5xl leading-none text-[var(--color-gold)]">
              „
            </span>
            <blockquote className="whitespace-pre-wrap leading-relaxed text-[var(--fg)] flex-1">
              {item.quote}
            </blockquote>
            {item.author && (
              <figcaption className="text-sm text-[var(--muted)]">— {item.author}</figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
