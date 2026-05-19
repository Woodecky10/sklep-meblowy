"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const SORTS = [
  { value: "newest", label: "Najnowsze" },
  { value: "price_asc", label: "Cena: rosnąco" },
  { value: "price_desc", label: "Cena: malejąco" },
];

export type FilterBarSection = {
  slug: string;
  label: string;
  categories: { slug: string; label: string }[];
};

type Props = {
  colors: string[];
  materials: string[];
  sections?: FilterBarSection[];
};

type DropdownKey = "category" | "color" | "material" | "price" | "sort" | null;

export default function FilterBar({ colors, materials, sections = [] }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const category = searchParams.get("kategoria") ?? "";
  const sort = searchParams.get("sortuj") ?? "newest";
  const inStockOnly = searchParams.get("dostepne") === "1";
  const selectedColors = (searchParams.get("kolor") ?? "").split(",").filter(Boolean);
  const selectedMaterials = (searchParams.get("material") ?? "").split(",").filter(Boolean);

  const [priceMin, setPriceMin] = useState(searchParams.get("cena_od") ?? "");
  const [priceMax, setPriceMax] = useState(searchParams.get("cena_do") ?? "");
  const [openDropdown, setOpenDropdown] = useState<DropdownKey>(null);

  const containerRef = useRef<HTMLDivElement>(null);

  // Click-outside zamyka dropdown
  useEffect(() => {
    if (!openDropdown) return;
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [openDropdown]);

  // Escape zamyka dropdown
  useEffect(() => {
    if (!openDropdown) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenDropdown(null);
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [openDropdown]);

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

  function toggleDropdown(key: Exclude<DropdownKey, null>) {
    setOpenDropdown(openDropdown === key ? null : key);
  }

  const activeCategory = sections
    .flatMap((s) => s.categories)
    .find((c) => c.slug === category);

  const priceActive = priceMin !== "" || priceMax !== "";
  const categoryCount = category ? 1 : 0;
  const priceCount = priceActive ? 1 : 0;

  const totalActiveFilters =
    categoryCount +
    selectedColors.length +
    selectedMaterials.length +
    priceCount +
    (inStockOnly ? 1 : 0);

  const activeSort = SORTS.find((s) => s.value === sort) ?? SORTS[0];

  function clearAll() {
    const params = new URLSearchParams();
    const q = searchParams.get("q");
    if (q) params.set("q", q);
    if (sort && sort !== "newest") params.set("sortuj", sort);
    setPriceMin("");
    setPriceMax("");
    setOpenDropdown(null);
    router.push(`/sklep?${params.toString()}`);
  }

  return (
    <div ref={containerRef} className="mb-10 relative">
      {/* Pasek filtrów. Na mobile: horizontal scroll (overflow-x-auto), żeby
          nie wieszały się na 3 linie. Na desktop: flex-wrap z gap. */}
      <div className="flex items-center gap-2 overflow-x-auto md:overflow-x-visible md:flex-wrap pb-2 md:pb-0 -mx-1 px-1 scrollbar-thin">
        {sections.length > 0 && (
          <FilterPill
            label="Kategoria"
            count={categoryCount}
            open={openDropdown === "category"}
            onClick={() => toggleDropdown("category")}
          />
        )}
        {colors.length > 0 && (
          <FilterPill
            label="Kolor"
            count={selectedColors.length}
            open={openDropdown === "color"}
            onClick={() => toggleDropdown("color")}
          />
        )}
        {materials.length > 0 && (
          <FilterPill
            label="Materiał"
            count={selectedMaterials.length}
            open={openDropdown === "material"}
            onClick={() => toggleDropdown("material")}
          />
        )}
        <FilterPill
          label="Cena"
          count={priceCount}
          open={openDropdown === "price"}
          onClick={() => toggleDropdown("price")}
        />

        {/* Toggle switch zamiast checkboxa w pillu */}
        <ToggleSwitch
          label="Dostępne od ręki"
          checked={inStockOnly}
          onChange={(v) => update("dostepne", v ? "1" : "")}
        />

        {totalActiveFilters > 0 && (
          <button
            onClick={clearAll}
            className="shrink-0 px-3 py-2 text-xs font-sans uppercase tracking-widest text-[var(--muted)] hover:text-red-500 transition-colors inline-flex items-center gap-1.5"
          >
            <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
            Wyczyść ({totalActiveFilters})
          </button>
        )}

        {/* Sort pill — po prawej, ten sam styl co inne. Specjalny pill bo
            dropdown ma checkmark + zamykanie po kliknięciu. */}
        <div className="ml-auto shrink-0">
          <SortPill
            current={activeSort.label}
            open={openDropdown === "sort"}
            onClick={() => toggleDropdown("sort")}
          />
        </div>
      </div>

      {/* Dropdown panels — z animacją slide-fade */}
      {openDropdown === "category" && (
        <DropdownPanel align="left">
          <button
            onClick={() => {
              update("kategoria", "");
              setOpenDropdown(null);
            }}
            className={`mb-3 px-3 py-1.5 rounded-full text-xs font-sans uppercase tracking-widest transition-colors ${
              category === ""
                ? "bg-[var(--color-navy)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
            }`}
          >
            Wszystkie kategorie
          </button>
          {sections.map((section) => (
            <div key={section.slug} className="mb-3 last:mb-0">
              <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mb-1.5">
                {section.label}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {section.categories.map((c) => (
                  <button
                    key={c.slug}
                    onClick={() => {
                      update("kategoria", c.slug);
                      setOpenDropdown(null);
                    }}
                    className={`px-3 py-1.5 rounded-full text-xs font-sans transition-colors ${
                      category === c.slug
                        ? "bg-[var(--color-navy)] text-white"
                        : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </DropdownPanel>
      )}

      {openDropdown === "color" && (
        <DropdownPanel align="left">
          <div className="flex flex-wrap gap-1.5">
            {colors.map((c) => {
              const active = selectedColors.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleMulti("kolor", selectedColors, c)}
                  className={`px-3 py-1.5 rounded-full text-xs font-sans capitalize transition-colors ${
                    active
                      ? "bg-[var(--color-gold)] text-white"
                      : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </DropdownPanel>
      )}

      {openDropdown === "material" && (
        <DropdownPanel align="left">
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m) => {
              const active = selectedMaterials.includes(m);
              return (
                <button
                  key={m}
                  onClick={() => toggleMulti("material", selectedMaterials, m)}
                  className={`px-3 py-1.5 rounded-full text-xs font-sans capitalize transition-colors ${
                    active
                      ? "bg-[var(--color-gold)] text-white"
                      : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                  }`}
                >
                  {m}
                </button>
              );
            })}
          </div>
        </DropdownPanel>
      )}

      {openDropdown === "price" && (
        <DropdownPanel align="left">
          <p className="text-[10px] font-sans uppercase tracking-widest text-[var(--muted)] mb-2">
            Zakres cenowy
          </p>
          <div className="flex items-center gap-2 text-sm text-[var(--fg)]">
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="od"
              value={priceMin}
              onChange={(e) => setPriceMin(e.target.value)}
              className="w-24 px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--bg)] rounded-full outline-none focus:border-[var(--color-gold)]"
            />
            <span className="text-[var(--muted)]">—</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              placeholder="do"
              value={priceMax}
              onChange={(e) => setPriceMax(e.target.value)}
              className="w-24 px-3 py-1.5 text-sm border border-[var(--border)] bg-[var(--bg)] rounded-full outline-none focus:border-[var(--color-gold)]"
            />
            <span className="text-[var(--muted)]">zł</span>
          </div>
        </DropdownPanel>
      )}

      {openDropdown === "sort" && (
        <DropdownPanel align="right">
          <div className="flex flex-col gap-0.5 min-w-[180px]">
            {SORTS.map((s) => {
              const active = sort === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => {
                    update("sortuj", s.value);
                    setOpenDropdown(null);
                  }}
                  className={`flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm font-sans transition-colors ${
                    active
                      ? "bg-[var(--bg)] text-[var(--color-gold)] font-semibold"
                      : "text-[var(--fg)] hover:bg-[var(--bg)]"
                  }`}
                >
                  {s.label}
                  {active && (
                    <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
        </DropdownPanel>
      )}

      {/* Chipsy aktywnych filtrów — wizualne podsumowanie z X do usunięcia */}
      {totalActiveFilters > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 mt-3">
          {activeCategory && (
            <ActiveChip
              label={`Kategoria: ${activeCategory.label}`}
              onRemove={() => update("kategoria", "")}
            />
          )}
          {selectedColors.map((c) => (
            <ActiveChip
              key={`color-${c}`}
              label={`Kolor: ${c}`}
              onRemove={() => toggleMulti("kolor", selectedColors, c)}
            />
          ))}
          {selectedMaterials.map((m) => (
            <ActiveChip
              key={`material-${m}`}
              label={`Materiał: ${m}`}
              onRemove={() => toggleMulti("material", selectedMaterials, m)}
            />
          ))}
          {priceActive && (
            <ActiveChip
              label={`Cena: ${priceMin || "0"}–${priceMax || "∞"} zł`}
              onRemove={() => {
                setPriceMin("");
                setPriceMax("");
              }}
            />
          )}
          {inStockOnly && (
            <ActiveChip
              label="Dostępne od ręki"
              onRemove={() => update("dostepne", "")}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Pomocnicze komponenty
// ============================================================

function FilterPill({
  label,
  count,
  open,
  onClick,
}: {
  label: string;
  count: number;
  open: boolean;
  onClick: () => void;
}) {
  const active = count > 0;
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-sans uppercase tracking-widest transition-all whitespace-nowrap ${
        active
          ? "bg-[var(--color-navy)] text-white border border-[var(--color-navy)] shadow-sm"
          : open
            ? "border border-[var(--color-gold)] text-[var(--color-gold)]"
            : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
      }`}
    >
      {label}
      {count > 0 && (
        <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold bg-[var(--color-gold)] text-[var(--color-navy)]">
          {count}
        </span>
      )}
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

function SortPill({
  current,
  open,
  onClick,
}: {
  current: string;
  open: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-expanded={open}
      className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-full text-xs font-sans transition-all whitespace-nowrap ${
        open
          ? "border border-[var(--color-gold)] text-[var(--color-gold)]"
          : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
      }`}
    >
      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M3 6h18M6 12h12M10 18h4" />
      </svg>
      <span className="text-[var(--muted)] uppercase tracking-widest">Sortuj:</span>
      <span className="font-medium">{current}</span>
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

function ToggleSwitch({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`shrink-0 flex items-center gap-2.5 px-4 py-2 rounded-full text-xs font-sans uppercase tracking-widest transition-all whitespace-nowrap ${
        checked
          ? "bg-[var(--color-navy)] text-white border border-[var(--color-navy)] shadow-sm"
          : "border border-[var(--border)] text-[var(--muted)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
      }`}
    >
      <span
        className={`relative inline-block w-7 h-4 rounded-full transition-colors ${
          checked ? "bg-[var(--color-gold)]" : "bg-[var(--border)]"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${
            checked ? "translate-x-3" : "translate-x-0"
          }`}
        />
      </span>
      {label}
    </button>
  );
}

function DropdownPanel({
  children,
  align,
}: {
  children: React.ReactNode;
  align: "left" | "right";
}) {
  return (
    <div
      className={`absolute top-full z-30 mt-2 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl shadow-2xl animate-dropdown-in max-w-[90vw] ${
        align === "right" ? "right-0" : "left-0 right-0 md:right-auto md:max-w-2xl"
      }`}
    >
      {children}
    </div>
  );
}

function ActiveChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 pl-3 pr-1.5 py-1 rounded-full text-xs font-sans bg-[var(--card-bg)] border border-[var(--border)] text-[var(--fg)]">
      {label}
      <button
        onClick={onRemove}
        aria-label={`Usuń filtr: ${label}`}
        className="w-4 h-4 rounded-full bg-[var(--bg)] border border-[var(--border)] flex items-center justify-center text-[var(--muted)] hover:bg-red-50 hover:border-red-300 hover:text-red-500 dark:hover:bg-red-950 dark:hover:border-red-900 transition-colors"
      >
        <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="3">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </span>
  );
}
