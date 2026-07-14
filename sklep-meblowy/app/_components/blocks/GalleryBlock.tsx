import Image from "next/image";
import type { LocalizedGalleryContent } from "@/app/_lib/blocks";

export default function GalleryBlock({ content }: { content: LocalizedGalleryContent }) {
  const { heading, images } = content;
  if (images.length === 0) return null;
  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {images.map((img, i) => (
          <div key={`${img.url}-${i}`} className="relative aspect-square rounded-2xl overflow-hidden">
            <Image src={img.url} alt={img.alt ?? ""} fill className="object-cover" />
          </div>
        ))}
      </div>
    </section>
  );
}
