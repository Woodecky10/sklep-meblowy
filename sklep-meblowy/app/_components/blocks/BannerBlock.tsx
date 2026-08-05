import Image from "next/image";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { sanitizeRichHtml } from "@/app/_lib/product-html";
import type { LocalizedBannerContent } from "@/app/_lib/blocks";

// CTA: wewnętrzne ścieżki przez LocalizedLink (zachowuje /de), zewnętrzne <a>.
function Cta({ label, href }: { label: string; href: string }) {
  const cls =
    "inline-flex px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors";
  if (href.startsWith("/")) {
    return (
      <LocalizedLink href={href} className={cls}>
        {label}
      </LocalizedLink>
    );
  }
  return (
    <a href={href} rel="noopener noreferrer" className={cls}>
      {label}
    </a>
  );
}

export default function BannerBlock({ content }: { content: LocalizedBannerContent }) {
  const { heading, body, image_url, layout, cta_label, cta_href } = content;
  if (!heading && !body && !image_url) return null;

  const text = (
    <div className={layout === "background" ? "max-w-2xl mx-auto text-center" : ""}>
      {heading && (
        <h2
          className={`font-display text-4xl font-bold mb-6 ${
            layout === "background" ? "text-white" : "text-[var(--fg)]"
          }`}
        >
          {heading}
        </h2>
      )}
      {body && (
        <div
          className={`rich-text mb-8 ${layout === "background" ? "text-white [&_a]:text-white" : "text-[var(--muted)]"}`}
          dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(body) }}
        />
      )}
      {cta_label && cta_href && <Cta label={cta_label} href={cta_href} />}
    </div>
  );

  if (layout === "background") {
    return (
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="relative rounded-2xl overflow-hidden min-h-[380px] flex items-center justify-center px-6 py-16 bg-[var(--color-navy)]">
          {image_url && (
            <Image
              src={image_url}
              alt={heading ?? ""}
              fill
              sizes="(max-width: 1280px) 100vw, 1280px"
              className="object-cover"
            />
          )}
          <div className="absolute inset-0 bg-black/50" aria-hidden="true" />
          <div className="relative">{text}</div>
        </div>
      </section>
    );
  }

  if (layout === "center" || layout === "full") {
    const imgWrap = layout === "full" ? "w-full" : "max-w-3xl mx-auto";
    return (
      <section className="max-w-7xl mx-auto px-6 py-24">
        {image_url && (
          <div className={`${imgWrap} rounded-2xl overflow-hidden mb-10`}>
            {/* Naturalne proporcje — baner nie jest przycinany. Wymiary zdjęcia
                z panelu nie są znane, więc width/height to tylko zaczep na
                proporcje (wzorzec „Responsive images with a remote URL" z
                dokumentacji next/image); `h-auto` i tak oddaje realny kształt. */}
            <Image
              src={image_url}
              alt={heading ?? ""}
              width={1280}
              height={720}
              sizes={
                layout === "full"
                  ? "(max-width: 1280px) 100vw, 1280px"
                  : "(max-width: 768px) 100vw, 768px"
              }
              className="w-full h-auto"
            />
          </div>
        )}
        <div className="max-w-3xl mx-auto text-center">{text}</div>
      </section>
    );
  }

  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-10 md:gap-16 items-center">
        {image_url && (
          <div
            className={`rounded-2xl overflow-hidden ${
              layout === "right" ? "md:order-2" : ""
            }`}
          >
            {/* Naturalne proporcje — zdjęcie w banerze nie jest przycinane (jak
                w galerii). Wysokość dopasowuje się do zdjęcia; width/height to
                tylko zaczep na proporcje, bo wymiary z panelu nie są znane. */}
            <Image
              src={image_url}
              alt={heading ?? ""}
              width={1280}
              height={720}
              sizes="(max-width: 768px) 100vw, 584px"
              className="w-full h-auto"
            />
          </div>
        )}
        {text}
      </div>
    </section>
  );
}
