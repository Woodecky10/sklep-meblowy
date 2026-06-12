"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useModal } from "@/app/_lib/useModal";
import type { SearchSuggestion } from "@/app/api/search/suggest/route";

type Variant = "icon" | "inline";

// icon: kompaktowa lupka → otwiera modal (używana na mobile)
// inline: widoczny pasek wyszukiwania w headerze (desktop)
export default function SearchBox({ variant = "icon" }: { variant?: Variant }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  // -1 = brak zaznaczonej, 0..n = zaznaczona sugestia (keyboard nav)
  const [highlighted, setHighlighted] = useState(-1);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Sync wartości z URL na /sklep — wzorzec "adjusting state during render"
  // zamiast setState w efekcie. Klucz = pełne searchParams (nie samo q):
  // każda nawigacja w /sklep (paginacja, filtry) ma przywracać do inputa
  // aktualne q z URL, tak jak robił to dawny efekt z deps [pathname,
  // searchParams] — np. po ręcznym wyczyszczeniu pola i zmianie strony.
  const urlKey = pathname === "/sklep" ? searchParams.toString() : null;
  const [prevUrlKey, setPrevUrlKey] = useState(urlKey);
  if (urlKey !== prevUrlKey) {
    setPrevUrlKey(urlKey);
    if (urlKey !== null) setValue(searchParams.get("q") ?? "");
  }

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // a11y: scroll-lock tła + focus-trap gdy otwarty modal wyszukiwarki (icon).
  // Escape obsługuje useModal (działa też gdy focus jest na przycisku, nie
  // tylko na inpucie). Własna keyboard-nav sugestii (onKeyDown) zostaje.
  useModal(open, { containerRef: modalRef, trapFocus: true, onClose: close });

  // Debounce 200ms + fetch sugestii. Puste value czyści sugestie po tym
  // samym debounce (asynchronicznie — bez setState w ciele efektu); bez
  // czyszczenia stare podpowiedzi migały przy ponownym wpisywaniu, a
  // loading potrafił utknąć na true.
  useEffect(() => {
    const trimmed = value.trim();
    if (trimmed.length < 1) {
      const handle = setTimeout(() => {
        setSuggestions([]);
        setLoading(false);
        setHighlighted(-1);
      }, 200);
      return () => clearTimeout(handle);
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      fetch(`/api/search/suggest?q=${encodeURIComponent(trimmed)}`)
        .then((r) => (r.ok ? r.json() : []))
        .then((data: SearchSuggestion[]) => {
          if (cancelled) return;
          setSuggestions(Array.isArray(data) ? data : []);
          setHighlighted(-1);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 200);
    // cancelled na poziomie efektu — wcześniej flaga żyła w closure setTimeout
    // i jej cleanup był wyrzucany, więc anulowanie fetcha nigdy nie działało.
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value]);

  // Click outside zamyka dropdown (tylko dla inline)
  useEffect(() => {
    if (variant !== "inline" || !suggestionsOpen) return;
    function onClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [variant, suggestionsOpen]);

  function submit(e?: React.FormEvent) {
    e?.preventDefault();
    // Jeśli klawisz Enter z zaznaczoną sugestią → idź do produktu
    if (highlighted >= 0 && highlighted < suggestions.length) {
      goToProduct(suggestions[highlighted].id);
      return;
    }
    const q = value.trim();
    const params = new URLSearchParams(
      pathname === "/sklep" ? searchParams.toString() : ""
    );
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("strona");
    router.push(`/sklep?${params.toString()}`);
    setOpen(false);
    setSuggestionsOpen(false);
  }

  function goToProduct(id: string) {
    router.push(`/produkt/${id}`);
    setOpen(false);
    setSuggestionsOpen(false);
  }

  function close() {
    setOpen(false);
    setSuggestionsOpen(false);
    setValue(searchParams.get("q") ?? "");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      if (variant === "icon") close();
      else setSuggestionsOpen(false);
      return;
    }
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSuggestionsOpen(true);
      setHighlighted((h) => (h + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h <= 0 ? suggestions.length - 1 : h - 1));
    }
  }

  const showDropdown =
    suggestionsOpen &&
    value.trim().length > 0 &&
    (loading || suggestions.length > 0);

  // ============================================================
  // Wariant inline — pasek wpięty bezpośrednio w header
  // ============================================================
  if (variant === "inline") {
    return (
      <div ref={containerRef} className="relative w-full max-w-md">
        <form
          onSubmit={submit}
          className="flex items-center gap-2 w-full bg-[var(--bg)] border border-[var(--border)] rounded-full px-4 py-2 focus-within:border-[var(--color-gold)] transition-colors"
        >
          <SearchIcon className="text-[var(--muted)] shrink-0" size={18} />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={onKeyDown}
            placeholder="Szukaj mebli…"
            className="flex-1 bg-transparent outline-none text-sm text-[var(--fg)] placeholder:text-[var(--muted)] min-w-0"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                setSuggestions([]);
                inputRef.current?.focus();
              }}
              aria-label="Wyczyść"
              className="text-[var(--muted)] hover:text-[var(--fg)] text-xs shrink-0"
            >
              ✕
            </button>
          )}
        </form>

        {showDropdown && (
          <SuggestionsList
            suggestions={suggestions}
            loading={loading}
            highlighted={highlighted}
            onHover={setHighlighted}
            onSelect={goToProduct}
            className="absolute top-full left-0 right-0 mt-2 z-50"
          />
        )}
      </div>
    );
  }

  // ============================================================
  // Wariant icon — ikonka otwierająca modal (mobile)
  // ============================================================
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Szukaj"
        className="w-10 h-10 flex items-center justify-center text-[var(--fg)] hover:text-[var(--color-gold)] transition-colors"
      >
        <SearchIcon size={20} />
      </button>

      {open && (
        <div
          ref={modalRef}
          className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-6"
          onClick={close}
        >
          <div className="w-full max-w-2xl" onClick={(e) => e.stopPropagation()}>
            <form
              onSubmit={submit}
              className="bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl flex items-center gap-3 px-5 py-4"
            >
              <SearchIcon className="text-[var(--muted)]" size={22} />
              <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setSuggestionsOpen(true);
                }}
                onFocus={() => setSuggestionsOpen(true)}
                onKeyDown={onKeyDown}
                placeholder="Szukaj produktów…"
                className="flex-1 bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setValue("");
                    setSuggestions([]);
                  }}
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

            {showDropdown && (
              <SuggestionsList
                suggestions={suggestions}
                loading={loading}
                highlighted={highlighted}
                onHover={setHighlighted}
                onSelect={goToProduct}
                className="mt-2"
              />
            )}
          </div>
        </div>
      )}
    </>
  );
}

// ============================================================
// SuggestionsList — dropdown z miniaturkami, reused dla obu wariantów
// ============================================================

function SuggestionsList({
  suggestions,
  loading,
  highlighted,
  onHover,
  onSelect,
  className,
}: {
  suggestions: SearchSuggestion[];
  loading: boolean;
  highlighted: number;
  onHover: (i: number) => void;
  onSelect: (id: string) => void;
  className?: string;
}) {
  if (loading && suggestions.length === 0) {
    return (
      <div className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-4 text-xs text-[var(--muted)] ${className ?? ""}`}>
        Szukam…
      </div>
    );
  }
  if (suggestions.length === 0) return null;

  return (
    <ul
      className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden ${className ?? ""}`}
      role="listbox"
    >
      {suggestions.map((s, i) => {
        const active = i === highlighted;
        return (
          <li key={s.id} role="option" aria-selected={active}>
            <button
              type="button"
              // MouseDown zamiast onClick — onClick zostaje zablokowany
              // gdy input traci focus przed wystąpieniem click. MouseDown
              // odpala się przed blur.
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(s.id);
              }}
              onMouseEnter={() => onHover(i)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                active ? "bg-[var(--bg)]" : "hover:bg-[var(--bg)]"
              }`}
            >
              <div className="relative w-12 h-12 shrink-0 rounded-lg overflow-hidden bg-stone-100 dark:bg-stone-800">
                {s.image ? (
                  <Image
                    src={s.image}
                    alt=""
                    fill
                    sizes="48px"
                    className="object-cover"
                  />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-[10px] text-[var(--muted)]">
                    brak
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--fg)] truncate">{s.name}</p>
                <p className="text-xs text-[var(--muted)]">
                  {s.category}
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--fg)] shrink-0">
                {s.price.toLocaleString("pl-PL")} zł
              </p>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================
// SVG ikonka lupy (reused)
// ============================================================
function SearchIcon({ size = 20, className }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  );
}
