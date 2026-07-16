"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { normalizeSearchText } from "@/app/_lib/search-normalize";
import DeleteProductButton from "./DeleteProductButton";
import ToggleProductActiveButton from "./ToggleProductActiveButton";

// Lekka projekcja z serwera — bez pełnego JSON-a wariantów (stock i liczba
// wariantów policzone w page, żeby nie wysyłać zbędnych danych do klienta).
export type AdminProductRow = {
  id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  variantCount: number;
  thumb: string | null;
  isActive: boolean;
};

function productsWord(n: number): string {
  return n === 1 ? "produkt" : n < 5 ? "produkty" : "produktów";
}

// Lista produktów z filtrem na żywo. Filtr działa w przeglądarce — wszystkie
// produkty i tak są załadowane na tę stronę (bez paginacji), więc zawężanie
// przy każdej literze jest natychmiastowe, bez podróży na serwer.
export default function ProductsList({ products }: { products: AdminProductRow[] }) {
  const [query, setQuery] = useState("");
  const q = normalizeSearchText(query);
  const visible = q
    ? products.filter(
        (p) =>
          normalizeSearchText(p.name).includes(q) ||
          normalizeSearchText(p.category).includes(q)
      )
    : products;

  return (
    <div className="flex flex-col gap-4">
      {/* data-guard-ignore: wpisywanie frazy to nie edycja danych — nie może
          uzbrajać guardu niezapisanych zmian (jak szukajka w zamówieniach). */}
      <div data-guard-ignore className="relative max-w-lg">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Szukaj: nazwa lub kategoria…"
          aria-label="Szukaj produktu"
          className="w-full px-4 py-2.5 pr-10 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl text-sm text-[var(--fg)] focus:outline-none focus:border-[var(--color-gold)] transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Wyczyść wyszukiwanie"
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--fg)] transition-colors"
          >
            ✕
          </button>
        )}
      </div>

      <p className="text-sm text-[var(--muted)]">
        {q
          ? `${visible.length} z ${products.length} ${products.length === 1 ? "produktu" : "produktów"}`
          : `Łącznie: ${products.length} ${productsWord(products.length)}`}
      </p>

      {visible.length === 0 ? (
        <div className="p-8 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl text-center text-[var(--muted)]">
          Brak produktów dla &bdquo;{query.trim()}&rdquo;.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((p) => (
            <li
              key={p.id}
              className="flex items-center gap-4 p-3 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl hover:border-[var(--color-gold)] transition-colors"
            >
              <div className="relative w-20 h-20 shrink-0 bg-stone-100 dark:bg-stone-800 rounded-lg overflow-hidden">
                {p.thumb ? (
                  <Image
                    src={p.thumb}
                    alt={p.name}
                    fill
                    sizes="80px"
                    className="object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-xs text-[var(--muted)]">
                    brak
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="font-display text-base font-semibold text-[var(--fg)] truncate">
                  {p.name}
                  {!p.isActive && (
                    <span className="ml-2 align-middle px-2 py-0.5 text-[10px] font-sans uppercase tracking-widest rounded bg-stone-200 dark:bg-stone-800 text-stone-600 dark:text-stone-400">
                      ukryty
                    </span>
                  )}
                </p>
                <p className="text-xs text-[var(--muted)] mt-0.5">
                  {p.category} · {p.price.toFixed(2)} zł · stock: {p.stock}
                  {p.variantCount > 0 &&
                    ` · ${p.variantCount} wariant${p.variantCount === 1 ? "" : p.variantCount < 5 ? "y" : "ów"}`}
                </p>
              </div>

              <Link
                href={`/admin/produkty/${p.id}`}
                className="shrink-0 px-4 py-2 text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] border border-[var(--color-gold)] rounded-lg hover:bg-[var(--color-gold)] hover:text-[var(--bg)] transition-colors"
              >
                Edytuj
              </Link>
              <ToggleProductActiveButton productId={p.id} isActive={p.isActive} />
              <DeleteProductButton productId={p.id} productName={p.name} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
