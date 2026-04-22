"use client";

import { useEffect, useRef, useState } from "react";
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

type Props = {
  colors: string[];
  materials: string[];
};

export default function FilterBar({ colors, materials }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const category = searchParams.get("kategoria") ?? "";
  const sort = searchParams.get("sortuj") ?? "newest";
  const inStockOnly = searchParams.get("dostepne") === "1";
  const selectedColors = (searchParams.get("kolor") ?? "").split(",").filter(Boolean);
  const selectedMaterials = (searchParams.get("material") ?? "").split(",").filter(Boolean);

  const [priceMin, setPriceMin] = useState(searchParams.get("cena_od") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("cena_do") ?? "");

  // Debounce na cenie — odpalanie nawigacji co 500 ms po ostatnim wpisaniu
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (priceMin) params.set("cena_od", priceMin);
      else params.delete("cena_od");
      if (priceMax) params.set("cena_do", priceMax);
      else params.delete("cena_do");

      const currentMin = searchParams.get("cena_od") ?? "";
      const currentMax = searchParams.get("cena_do") ?? "";
      if (priceMin === currentMin && priceMax === currentMax) return;

      params.delete("strona");
      router.push(`/sklep?${params.toString()}`);
    }, 500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [priceMin, priceMax, router, searchParams]);

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    params.delete("strona");
    router.push(`/sklep?${params.toString()}`);
  }

  function toggleMulti(key: string, current: string[], value: string) {
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    update(key, next.join(","));
  }

  const hasAdvancedFilters =
    inStockOnly ||
    selectedColors.length > 0 ||
    selectedMaterials.length > 0 ||
    priceMin !== "" ||
    priceMax !== "";

  function clearAll() {
    const params = new URLSearchParams();
    if (category) params.set("kategoria", category);
    if (sort && sort !== "newest") params.set("sortuj", sort);
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    setPriceMin("");
    setPriceMax("");
    router.push(`/sklep?${params.toString()}`);
  }

  return (
    <div className="mb-10 space-y-5">
      <div className="flex flex-wrap items-center gap-3">
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

      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 pt-4 border-t border-[var(--border)]">
        <label className="flex items-center gap-2 text-sm text-[var(--fg)] cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => update("dostepne", e.target.checked ? "1" : "")}
            className="h-4 w-4 accent-[var(--color-gold)] cursor-pointer"
          />
          Tylko dostępne
        </label>

        <div className="flex items-center gap-2 text-sm text-[var(--fg)]">
          <span className="text-[var(--muted)]">Cena:</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="od"
            value={priceMin}
            onChange={(e) => setPriceMin(e.target.value)}
            className="w-20 px-2 py-1 text-sm border border-[var(--border)] bg-[var(--card-bg)] rounded outline-none focus:border-[var(--color-gold)]"
          />
          <span className="text-[var(--muted)]">—</span>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="do"
            value={priceMax}
            onChange={(e) => setPriceMax(e.target.value)}
            className="w-20 px-2 py-1 text-sm border border-[var(--border)] bg-[var(--card-bg)] rounded outline-none focus:border-[var(--color-gold)]"
          />
          <span className="text-[var(--muted)]">zł</span>
        </div>

        {hasAdvancedFilters && (
          <button
            onClick={clearAll}
            className="ml-auto text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
          >
            Wyczyść filtry
          </button>
        )}
      </div>

      {colors.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mr-1">
            Kolor:
          </span>
          {colors.map((c) => {
            const active = selectedColors.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleMulti("kolor", selectedColors, c)}
                className={`px-3 py-1 rounded-full text-xs font-sans capitalize transition-colors ${
                  active
                    ? "bg-[var(--color-gold)] text-white"
                    : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                }`}
              >
                {c}
              </button>
            );
          })}
        </div>
      )}

      {materials.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mr-1">
            Materiał:
          </span>
          {materials.map((m) => {
            const active = selectedMaterials.includes(m);
            return (
              <button
                key={m}
                onClick={() => toggleMulti("material", selectedMaterials, m)}
                className={`px-3 py-1 rounded-full text-xs font-sans capitalize transition-colors ${
                  active
                    ? "bg-[var(--color-gold)] text-white"
                    : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                }`}
              >
                {m}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
