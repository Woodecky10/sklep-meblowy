import { sanitizeRichHtml } from "@/app/_lib/product-html";
import type { LocalizedTextContent } from "@/app/_lib/blocks";

export default function TextBlock({ content }: { content: LocalizedTextContent }) {
  if (!content.body) return null;
  return (
    <section className="max-w-3xl mx-auto px-6 py-16">
      <div
        className="rich-text text-[var(--fg)]"
        dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(content.body) }}
      />
    </section>
  );
}
