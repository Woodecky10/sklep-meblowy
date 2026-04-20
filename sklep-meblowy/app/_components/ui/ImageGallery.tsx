"use client";

import Image from "next/image";
import { useState } from "react";

export default function ImageGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  const list = images.length > 0 ? images : ["/placeholder.jpg"];

  return (
    <div className="flex flex-col gap-4">
      <div className="relative aspect-[4/5] bg-stone-100 dark:bg-stone-800 rounded-3xl overflow-hidden">
        <Image
          src={list[active]}
          alt={name}
          fill
          priority
          sizes="(max-width: 768px) 100vw, 50vw"
          className="object-cover"
        />
      </div>
      {list.length > 1 && (
        <div className="flex gap-3">
          {list.map((src, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`relative w-20 aspect-square rounded-xl overflow-hidden border-2 transition-colors ${
                i === active ? "border-[var(--color-gold)]" : "border-transparent"
              }`}
            >
              <Image src={src} alt={`${name} ${i + 1}`} fill className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
