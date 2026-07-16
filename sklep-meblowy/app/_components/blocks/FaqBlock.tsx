"use client";

import { useState } from "react";
import type { LocalizedFaqContent } from "@/app/_lib/blocks";

export default function FaqBlock({ content }: { content: LocalizedFaqContent }) {
  const { heading, items } = content;
  const [open, setOpen] = useState<Set<number>>(() => new Set());
  if (items.length === 0) return null;

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  }

  return (
    <section className="max-w-3xl mx-auto px-6 py-24">
      {heading && (
        <div className="text-center mb-16">
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">{heading}</h2>
        </div>
      )}
      <div className="border-t border-[var(--border)]">
        {items.map((item, i) => {
          const isOpen = open.has(i);
          return (
            <div key={i} className="border-b border-[var(--border)]">
              <button
                type="button"
                onClick={() => toggle(i)}
                aria-expanded={isOpen}
                className="w-full flex items-center justify-between gap-4 py-5 text-left"
              >
                <span className="font-display text-lg md:text-xl font-semibold text-[var(--fg)]">
                  {item.question}
                </span>
                <svg
                  width="16" height="16" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className={`shrink-0 text-[var(--muted)] transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {isOpen && (
                <p className="pb-5 whitespace-pre-wrap leading-relaxed text-[var(--muted)]">
                  {item.answer}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
