"use client";

import { useState, type ReactNode } from "react";
import { getDictionary } from "@/app/_lib/dictionaries";
import type { Locale } from "@/app/_lib/i18n";

// Przełącznik „Wszystkie opinie" / „Tylko zdjęcia" na /opinie.
//
// Oba widoki przychodzą jako props, a nie są tu budowane: lista opinii ma
// zostać SERWEROWA (ReviewCard renderuje cytaty bez JS), a ten komponent
// odpowiada wyłącznie za to, który z dwóch gotowych poddrzew jest widoczny.
// Ten sam wzorzec, co ProductCarousel z serwerowymi kartami w środku.
//
// Wołający renderuje przełącznik TYLKO wtedy, gdy jest co pokazać w galerii —
// zakładka prowadząca do pustej siatki byłaby zaproszeniem donikąd.
export default function ReviewsViewSwitch({
  locale,
  children,
  gallery,
}: {
  locale: Locale;
  children: ReactNode;
  gallery: ReactNode;
}) {
  const t = getDictionary(locale);
  const [tryb, setTryb] = useState<"opinie" | "zdjecia">("opinie");

  const przycisk = (wartosc: "opinie" | "zdjecia", etykieta: string) => {
    const aktywny = tryb === wartosc;
    return (
      <button
        type="button"
        onClick={() => setTryb(wartosc)}
        aria-pressed={aktywny}
        className={`px-5 py-2.5 rounded-full font-sans text-xs uppercase tracking-widest transition-colors cursor-pointer ${
          aktywny
            ? "bg-[var(--color-gold)] text-[var(--color-navy)]"
            : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
        }`}
      >
        {etykieta}
      </button>
    );
  };

  return (
    <>
      <div className="flex flex-wrap gap-3 mb-8">
        {przycisk("opinie", t.reviewsPage.tabAll)}
        {przycisk("zdjecia", t.reviewsPage.tabPhotos)}
      </div>
      {tryb === "opinie" ? children : gallery}
    </>
  );
}
