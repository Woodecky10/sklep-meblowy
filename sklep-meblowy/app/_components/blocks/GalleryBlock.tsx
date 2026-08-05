import Image from "next/image";
import type { LocalizedGalleryContent } from "@/app/_lib/blocks";

export default function GalleryBlock({ content }: { content: LocalizedGalleryContent }) {
  const { heading, images, caption_align, columns } = content;
  if (images.length === 0) return null;

  const single = images.length === 1;
  // Masonry (CSS columns): każde zdjęcie w naturalnych proporcjach, nic nie
  // przycinane. Liczba kolumn dopasowana do liczby zdjęć — jedno zdjęcie
  // wypełnia szerokość (nie wisi w wąskiej kolumnie po lewej), dwa dają dwie
  // kolumny, trzy i więcej pełną siatkę. `columns` (z formularza) nadpisuje
  // ten auto-wybór, poza przypadkiem jednego zdjęcia. Naturalne proporcje
  // zachowuje `h-auto` — width/height poniżej to tylko zaczep proporcji dla
  // next/image (wymiary zdjęć z panelu nie są znane).
  const containerCls = single
    ? "max-w-4xl mx-auto"
    : columns === "2"
      ? "columns-1 sm:columns-2 gap-4"
      : columns === "3"
        ? "columns-1 sm:columns-2 md:columns-3 gap-4"
        : images.length === 2
          ? "columns-1 sm:columns-2 gap-4"
          : "columns-1 sm:columns-2 md:columns-3 gap-4";
  const capAlign = caption_align === "left" ? "text-left" : caption_align === "right" ? "text-right" : "text-center";

  return (
    <section className="max-w-7xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className={containerCls}>
        {images.map((img, i) => (
          <figure key={`${img.url}-${i}`} className={single ? "" : "mb-4 break-inside-avoid"}>
            {/* Podpis (jeśli jest) renderuje się jako widoczny figcaption, więc
                alt="" żeby czytnik ekranu nie czytał tego samego dwa razy. */}
            <Image
              src={img.url}
              alt=""
              width={1200}
              height={900}
              sizes={
                single
                  ? "(max-width: 896px) 100vw, 896px"
                  : "(max-width: 640px) 100vw, (max-width: 768px) 50vw, 400px"
              }
              className="w-full h-auto rounded-2xl"
            />
            {img.alt && (
              <figcaption className={`mt-2 text-sm text-[var(--muted)] font-sans ${capAlign}`}>
                {img.alt}
              </figcaption>
            )}
          </figure>
        ))}
      </div>
    </section>
  );
}
