"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";

type Variant = "icon" | "inline";

// icon: kompaktowa lupka → otwiera modal (używana na mobile)
// inline: widoczny pasek wyszukiwania w headerze (desktop)
export default function SearchBox({ variant = "icon" }: { variant?: Variant }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (pathname === "/sklep") {
      setValue(searchParams.get("q") ?? "");
    }
  }, [pathname, searchParams]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    const q = value.trim();
    const params = new URLSearchParams(
      pathname === "/sklep" ? searchParams.toString() : ""
    );
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("strona");
    router.push(`/sklep?${params.toString()}`);
    setOpen(false);
  }

  function close() {
    setOpen(false);
    setValue(searchParams.get("q") ?? "");
  }

  // Wariant inline — pasek wpięty bezpośrednio w header
  if (variant === "inline") {
    return (
      <form
        onSubmit={submit}
        className="flex items-center gap-2 w-full max-w-md bg-[var(--bg)] border border-[var(--border)] rounded-full px-4 py-2 focus-within:border-[var(--color-gold)] transition-colors"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[var(--muted)] shrink-0"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Szukaj mebli…"
          className="flex-1 bg-transparent outline-none text-sm text-[var(--fg)] placeholder:text-[var(--muted)] min-w-0"
        />
        {value && (
          <button
            type="button"
            onClick={() => setValue("")}
            aria-label="Wyczyść"
            className="text-[var(--muted)] hover:text-[var(--fg)] text-xs shrink-0"
          >
            ✕
          </button>
        )}
      </form>
    );
  }

  // Wariant icon — ikonka otwierająca modal (mobile)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Szukaj"
        className="w-10 h-10 flex items-center justify-center text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="11" cy="11" r="7" />
          <path d="M21 21l-4.3-4.3" />
        </svg>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-6"
          onClick={close}
        >
          <form
            onSubmit={submit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl flex items-center gap-3 px-5 py-4"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-[var(--muted)]"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M21 21l-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") close();
              }}
              placeholder="Szukaj produktów…"
              className="flex-1 bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]"
            />
            {value && (
              <button
                type="button"
                onClick={() => setValue("")}
                aria-label="Wyczyść"
                className="text-[var(--muted)] hover:text-[var(--fg)]"
              >
                ✕
              </button>
            )}
            <button
              type="submit"
              className="px-4 py-1.5 rounded-full bg-[var(--color-navy)] text-white text-xs font-sans uppercase tracking-widest hover:bg-[var(--color-gold)] transition-colors"
            >
              Szukaj
            </button>
          </form>
        </div>
      )}
    </>
  );
}
