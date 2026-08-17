"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import Image from "next/image";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useModal } from "@/app/_lib/useModal";
import { localizeHref, stripLocale, type Locale } from "@/app/_lib/i18n";
import { useClientLocale } from "@/app/_lib/useClientLocale";
import { getDictionary, type Dictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { useEurRate } from "@/app/_lib/rate-context";
import {
  normalizeSuggestResponse,
  type SearchSuggestion,
} from "@/app/_lib/search-suggest";

type Variant = "icon" | "inline";

// icon: kompaktowa lupka → otwiera modal (używana na mobile)
// inline: widoczny pasek wyszukiwania w headerze (desktop)
export default function SearchBox({ variant = "icon" }: { variant?: Variant }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useClientLocale();
  const rate = useEurRate();
  const t = getDictionary(locale);
  // Pod '/de' usePathname() zwraca '/de/sklep'. Porównujemy ścieżkę BEZ prefiksu
  // locale, inaczej cała logika "jesteśmy na /sklep" gubiła się pod DE.
  const isOnSklep = stripLocale(pathname ?? "/").pathname === "/sklep";

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  // Korekta literówki z API — niepusta ⇔ fraza klienta nie znalazła NICZEGO,
  // a poprawiona coś znalazła. `to` jest obecne tylko wtedy, gdy poprawkę wolno
  // zacytować klientowi; o tym decyduje serwer (canShowCorrection
  // w search-correction.ts), a nie ten komponent.
  const [correction, setCorrection] = useState<{
    from: string;
    to?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  // -1 = brak zaznaczonej, 0..n = zaznaczona sugestia (keyboard nav)
  const [highlighted, setHighlighted] = useState(-1);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  // Pending nawigacji do wyników/produktu: modal nie znika "w próżnię" —
  // pokazuje "Szukam..." i zamyka się dopiero po zatwierdzeniu nawigacji.
  const [isPending, startTransition] = useTransition();
  const wasPending = useRef(false);
  useEffect(() => {
    if (wasPending.current && !isPending) {
      setOpen(false);
      setSuggestionsOpen(false);
    }
    wasPending.current = isPending;
  }, [isPending]);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  // Sync wartości z URL na /sklep — wzorzec "adjusting state during render"
  // zamiast setState w efekcie. Klucz = pełne searchParams (nie samo q):
  // każda nawigacja w /sklep (paginacja, filtry) ma przywracać do inputa
  // aktualne q z URL, tak jak robił to dawny efekt z deps [pathname,
  // searchParams] — np. po ręcznym wyczyszczeniu pola i zmianie strony.
  const urlKey = isOnSklep ? searchParams.toString() : null;
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
        setCorrection(null);
        setLoading(false);
        setHighlighted(-1);
      }, 200);
      return () => clearTimeout(handle);
    }
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      // ⚠️ `v=2` PROSI O NOWY KSZTAŁT ODPOWIEDZI (obiekt z polami korekty)
      // i NIE JEST zbędne. Bez tego parametru endpoint oddaje gołą tablicę
      // podpowiedzi — celowo, żeby karta otwarta przez deploy (ze STARYM
      // bundlem, który wpuszczał do stanu wyłącznie tablicę, a obiekt zamieniał
      // na pustkę) nie zgasła na pustej rozwijce dla KAŻDEJ frazy, nie tylko
      // dla literówki. Pełne uzasadnienie stoi nad
      // suggestResponseBody w app/_lib/search-suggest.ts. Usunięcie tego
      // parametru = zdanie o korekcie znika, bo `correctedFrom` nie przychodzi.
      fetch(
        `/api/search/suggest?q=${encodeURIComponent(trimmed)}&loc=${locale}&v=2`
      )
        .then((r) => (r.ok ? r.json() : []))
        .then((data: unknown) => {
          if (cancelled) return;
          // ⚠️ ŁAGODNE ZEJŚCIE ZE STAREGO KSZTAŁTU. Odpowiedź jest dziś
          // obiektem `{ items, correctedFrom?, correctedTo? }`, ale karta
          // otwarta przed deployem odpytuje nowe API starym kodem i odwrotnie
          // (rollback, żądanie do starszego deploymentu) — normalizeSuggestResponse
          // przyjmuje gołą tablicę tak samo jak obiekt i na niczym nie rzuca.
          const { items, correctedFrom, correctedTo } =
            normalizeSuggestResponse(data);
          setSuggestions(items);
          setCorrection(
            correctedFrom ? { from: correctedFrom, to: correctedTo } : null
          );
          setHighlighted(-1);
        })
        .catch(() => {
          if (!cancelled) {
            setSuggestions([]);
            setCorrection(null);
          }
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
  }, [value, locale]);

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
      isOnSklep ? searchParams.toString() : ""
    );
    if (q) params.set("q", q);
    else params.delete("q");
    params.delete("strona");
    setSuggestionsOpen(false);
    startTransition(() => {
      router.push(localizeHref(`/sklep?${params.toString()}`, locale));
    });
  }

  function goToProduct(id: string) {
    setSuggestionsOpen(false);
    startTransition(() => {
      router.push(localizeHref(`/produkt/${id}`, locale));
    });
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
          aria-busy={isPending}
          className="flex items-center gap-2 w-full bg-[var(--bg)] border border-[var(--border)] rounded-full px-4 py-2 focus-within:border-[var(--color-gold)] transition-colors"
        >
          <SearchIcon className="text-[var(--muted)] shrink-0" size={18} />
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setSuggestionsOpen(true)}
            onKeyDown={onKeyDown}
            placeholder={t.search.placeholderInline}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--fg)] placeholder:text-[var(--muted)] min-w-0"
          />
          {value && (
            <button
              type="button"
              onClick={() => {
                setValue("");
                setSuggestions([]);
                setCorrection(null);
              }}
              aria-label={t.filter.clear}
              className="text-[var(--muted)] hover:text-[var(--fg)] text-xs shrink-0"
            >
              ✕
            </button>
          )}
          {isPending && (
            <span
              aria-hidden="true"
              className="w-2 h-2 rounded-full bg-[var(--color-gold)] animate-pulse shrink-0"
            />
          )}
        </form>

        {showDropdown && (
          <SuggestionsList
            suggestions={suggestions}
            correction={correction}
            loading={loading}
            highlighted={highlighted}
            onHover={setHighlighted}
            onSelect={goToProduct}
            t={t}
            locale={locale}
            rate={rate}
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
        aria-label={t.nav.search}
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
              aria-busy={isPending}
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
                placeholder={t.search.placeholderModal}
                className="flex-1 bg-transparent outline-none text-[var(--fg)] placeholder:text-[var(--muted)]"
              />
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    setValue("");
                    setSuggestions([]);
                    setCorrection(null);
                  }}
                  aria-label={t.filter.clear}
                  className="text-[var(--muted)] hover:text-[var(--fg)]"
                >
                  ✕
                </button>
              )}
              <button
                type="submit"
                className="px-4 py-1.5 rounded-full bg-[var(--color-navy)] text-white text-xs font-sans uppercase tracking-widest hover:bg-[var(--color-gold)] transition-colors"
              >
                {t.nav.search}
              </button>
            </form>

            {isPending && (
              <p className="mt-3 text-center text-sm font-sans text-white/90">
                {t.search.searching}
              </p>
            )}

            {showDropdown && (
              <SuggestionsList
                suggestions={suggestions}
                correction={correction}
                loading={loading}
                highlighted={highlighted}
                onHover={setHighlighted}
                onSelect={goToProduct}
                t={t}
                locale={locale}
                rate={rate}
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
  correction,
  loading,
  highlighted,
  onHover,
  onSelect,
  t,
  locale,
  rate,
  className,
}: {
  suggestions: SearchSuggestion[];
  correction: { from: string; to?: string } | null;
  loading: boolean;
  highlighted: number;
  onHover: (i: number) => void;
  onSelect: (id: string) => void;
  t: Dictionary;
  locale: Locale;
  rate: number;
  className?: string;
}) {
  if (loading && suggestions.length === 0) {
    return (
      <div className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-4 text-xs text-[var(--muted)] ${className ?? ""}`}>
        {t.search.searching}
      </div>
    );
  }
  if (suggestions.length === 0) return null;

  return (
    <div
      className={`bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl overflow-hidden ${className ?? ""}`}
    >
      {/* Zdanie o korekcie literówki. Stoi NAD listą i POZA <ul role="listbox">:
          `highlighted` indeksuje `suggestions`, więc gdyby ta linijka była
          pozycją listy, strzałki i Enter trafiałyby o jeden produkt obok.

          Dwa warianty, bo poprawką bywa RDZEŃ ze słownika ręcznego (`kanap`,
          `lozk`) albo prawdziwe, ale 3-znakowe słowo (`flo`, `mio`).
          ⚠️ O tym, który wariant, NIE decyduje ten komponent: `to` przychodzi
          dokładnie wtedy, gdy poprawkę wolno zacytować. Powtórzenie tej reguły
          tutaj dałoby dwa miejsca decydujące o tym samym.

          Teksty ze słownika /sklep (t.shop.*) — świadomie te same, co
          w zdaniu nad siatką produktów: klient, który z rozwijki przejdzie do
          wyników, ma zobaczyć tę samą informację tymi samymi słowami.

          break-words, bo w zdaniu siedzi fraza WPROST od klienta — jedno długie
          słowo bez spacji rozpycha wąską rozwijkę (ten sam wzorzec co
          w EmptySearchState.tsx i na /sklep). */}
      {correction && (
        <p className="px-4 pt-3 pb-2 text-xs text-[var(--muted)] break-words border-b border-[var(--border)]">
          {correction.to ? (
            <>
              {t.shop.correctedShowing}{" "}
              <span className="text-[var(--fg)] font-medium">
                „{correction.to}”
              </span>
            </>
          ) : (
            <>
              {t.shop.emptySearchTitle} „{correction.from}” —{" "}
              {t.shop.correctedSimilar}
            </>
          )}
        </p>
      )}
      <ul role="listbox">
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
                      {t.search.noImageShort}
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
                  {formatMoney(s.price, locale, rate)}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
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
