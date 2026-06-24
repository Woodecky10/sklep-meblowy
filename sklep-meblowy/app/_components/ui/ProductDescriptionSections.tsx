"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductDescriptionSection } from "@/app/_lib/types";

// Sekcje text przekazywane TUTAJ mają już sanityzowane body (server-side
// w page.tsx). Nie importujemy sanitizera tutaj — żeby isomorphic-dompurify
// (które ciągnie jsdom + html-encoding-sniffer + @exodus/bytes ESM-only)
// nie wpadało w SSR-of-client-component bundle na Vercelu. Lokalny build
// wybacza ten ESM/CJS mismatch, runtime Vercela nie.

// Opis produktu na karcie — kombinacja text (akordeony z importu) i image
// (kontekstowe zdjęcia wstawione przez admina między text sekcjami).
//
// Text sekcje są domyślnie ZWINIĘTE (oprócz pierwszej) — akordeony.
// Image sekcje są ZAWSZE widoczne (nie ma sensu chować obrazka za klik).
//
// Layout: prosta lista — sekcje renderują się w kolejności array. Image
// sekcje wstawiają się między text akordeonami w pełnej szerokości.
export default function ProductDescriptionSections({
  sections,
}: {
  sections: ProductDescriptionSection[];
}) {
  // Indeks pierwszej text sekcji — będzie domyślnie otwarty
  const firstTextIdx = sections.findIndex((s) => s.kind === "text");
  const [openIndexes, setOpenIndexes] = useState<Set<number>>(
    () => (firstTextIdx >= 0 ? new Set([firstTextIdx]) : new Set())
  );

  function toggle(idx: number) {
    setOpenIndexes((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  if (sections.length === 0) return null;

  return (
    <div className="max-w-4xl flex flex-col gap-3">
      {sections.map((section, idx) => {
        if (section.kind === "image") {
          return <ImageSection key={idx} section={section} />;
        }
        const isOpen = openIndexes.has(idx);
        return (
          <TextSection
            key={idx}
            title={section.title}
            body={section.body}
            isOpen={isOpen}
            onToggle={() => toggle(idx)}
          />
        );
      })}
    </div>
  );
}

function TextSection({
  title,
  body,
  isOpen,
  onToggle,
}: {
  title: string;
  body: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-t border-b border-[var(--border)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="w-full flex items-center justify-between gap-4 py-5 text-left hover:text-[var(--color-gold)] transition-colors"
      >
        <span className="font-display text-lg md:text-xl font-semibold text-[var(--fg)]">
          {title}
        </span>
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${
            isOpen ? "rotate-180" : ""
          }`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {isOpen && (
        <div
          className="product-description pb-6 text-[var(--fg)] leading-relaxed"
          // body jest już sanityzowany na serwerze (w page.tsx) przed
          // przekazaniem tutaj. Nie wywołujemy DOMPurify w client bundle.
          dangerouslySetInnerHTML={{ __html: body }}
        />
      )}
    </div>
  );
}

function ImageSection({
  section,
}: {
  section: Extract<ProductDescriptionSection, { kind: "image" }>;
}) {
  return (
    <figure className="flex flex-col gap-2">
      <div className="relative aspect-[16/9] w-full bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden">
        <Image
          src={section.image_url}
          alt={section.image_alt}
          fill
          sizes="(max-width: 768px) 100vw, 800px"
          className="object-cover"
        />
      </div>
      {section.caption && (
        <figcaption className="text-sm text-[var(--muted)] text-center italic px-4">
          {section.caption}
        </figcaption>
      )}
    </figure>
  );
}
