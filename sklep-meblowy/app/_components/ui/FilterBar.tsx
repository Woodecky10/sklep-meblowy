"use client";

import { useRouter, useSearchParams } from "next/navigation";

const CATEGORIES = [
  { value: "", label: "Wszystkie" },
  { value: "kanapy", label: "Kanapy" },
  { value: "lozka", label: "Łóżka" },
  { value: "fotele", label: "Fotele" },
  { value: "pufy", label: "Pufy" },
];

const SORTS = [
  { value: "newest", label: "Najnowsze" },
  { value: "price_asc", label: "Cena: rosnąco" },
  { value: "price_desc", label: "Cena: malejąco" },
];

export default function FilterBar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const category = searchParams.get("kategoria") ?? "";
  const sort = searchParams.get("sortuj") ?? "newest";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("strona");
    router.push(`/sklep?${params.toString()}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 mb-10">
      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => update("kategoria", c.value)}
            className={`px-4 py-2 rounded-full text-xs font-sans uppercase tracking-widest transition-colors ${
              category === c.value
                ? "bg-[var(--color-navy)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className="ml-auto">
        <select
          value={sort}
          onChange={(e) => update("sortuj", e.target.value)}
          className="text-sm font-sans border border-[var(--border)] bg-[var(--card-bg)] text-[var(--fg)] rounded-full px-4 py-2 outline-none focus:border-[var(--color-gold)] cursor-pointer"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
