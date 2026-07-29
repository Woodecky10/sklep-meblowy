"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import LocalizedLink from "../ui/LocalizedLink";
import { countFittingNavItems } from "@/app/_lib/nav-overflow";

export type NavStripSection = {
  slug: string;
  label: string;
  categories: { slug: string; label: string }[];
};

export type NavStripPageLink = { id: string; href: string; label: string };

type StripItem =
  | { kind: "section"; key: string; label: string; href: string; categories: { slug: string; label: string }[] }
  | { kind: "page"; key: string; label: string; href: string };

// gap-6 między pozycjami paska — ta sama wartość musi być w klasach nav i tutaj,
// bo arytmetyka zwijania liczy odstępy jawnie.
const GAP_PX = 24;

// Wspólne klasy wyzwalacza. Ruler (linijka pomiarowa) używa DOKŁADNIE tych
// samych klas co realna pozycja, bo inaczej zmierzone szerokości nie zgadzałyby
// się z rzeczywistymi.
const TRIGGER_CLS =
  "font-sans text-xs uppercase tracking-widest flex items-center h-24 whitespace-nowrap";
const DROPDOWN_CLS =
  "absolute top-full left-1/2 -translate-x-1/2 min-w-[220px] max-h-[70vh] overflow-y-auto bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all";

function Chevron() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

// Pasek nawigacji desktopowej, który zwija nadmiar pozycji do dropdownu
// „Więcej" na podstawie ZMIERZONEGO miejsca — dzięki temu dodanie kolejnej
// grupy kategorii w panelu nie wypycha ikon (koszyk!) za krawędź strony.
//
// Do pierwszego pomiaru renderujemy wszystkie pozycje: taki sam HTML leci z
// serwera (linki widoczne dla Google) i nie ma przeskoku treści przy hydracji.
export default function NavStrip({
  sections,
  pageLinks,
  labels,
}: {
  sections: NavStripSection[];
  pageLinks: NavStripPageLink[];
  labels: { allInSection: string; more: string };
}) {
  const items: StripItem[] = [
    ...sections.map((s) => ({
      kind: "section" as const,
      key: `s:${s.slug}`,
      label: s.label,
      href: `/sklep?sekcja=${s.slug}`,
      categories: s.categories,
    })),
    ...pageLinks.map((p) => ({
      kind: "page" as const,
      key: `p:${p.id}`,
      label: p.label,
      href: p.href,
    })),
  ];

  const wrapRef = useRef<HTMLDivElement>(null);
  const rulerItemsRef = useRef<(HTMLSpanElement | null)[]>([]);
  const rulerMoreRef = useRef<HTMLSpanElement>(null);
  // null = brak pomiaru → pokazujemy wszystko (parytet z HTML-em z serwera).
  const [visibleCount, setVisibleCount] = useState<number | null>(null);

  const measure = useCallback(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const available = wrap.clientWidth;
    // 0 = pasek schowany (poniżej lg) albo layout jeszcze nie policzony.
    // Nie zwijamy na podstawie takiego pomiaru.
    if (available <= 0) return;

    const widths = rulerItemsRef.current.map((el) => el?.offsetWidth ?? 0);
    if (widths.length === 0 || widths.some((w) => w <= 0)) return;

    setVisibleCount(
      countFittingNavItems(
        widths,
        available,
        GAP_PX,
        rulerMoreRef.current?.offsetWidth ?? 0
      )
    );
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;

    // Pierwszy pomiar po dociągnięciu fontów — inaczej szerokości zmierzone
    // fontem systemowym są inne niż finalne i pasek zwija się zbyt agresywnie
    // (albo zbyt mało).
    let cancelled = false;
    const first = () => {
      if (!cancelled) measure();
    };
    if (typeof document !== "undefined" && document.fonts?.status !== "loaded") {
      document.fonts.ready.then(first).catch(first);
    } else {
      first();
    }

    const ro = new ResizeObserver(() => measure());
    ro.observe(wrap);
    return () => {
      cancelled = true;
      ro.disconnect();
    };
  }, [measure]);

  const shown = visibleCount === null ? items.length : visibleCount;
  const hidden = items.slice(shown);

  return (
    <div
      ref={wrapRef}
      className="hidden lg:flex items-center flex-1 justify-center min-w-0 relative"
    >
      {/* Linijka pomiarowa — niewidoczna kopia WSZYSTKICH pozycji plus przycisku
          „Więcej". Bez niej nie da się zmierzyć pozycji już schowanych, więc
          pasek nigdy by się nie rozwinął po powiększeniu okna. position:absolute
          + visibility:hidden: nie wpływa na layout, ale ma mierzalne wymiary
          (display:none by ich nie miał). */}
      <div
        aria-hidden
        className="absolute left-0 top-0 flex items-center gap-6 pointer-events-none"
        style={{ visibility: "hidden" }}
      >
        {items.map((item, i) => (
          <span
            key={item.key}
            ref={(el) => {
              rulerItemsRef.current[i] = el;
            }}
            className={`${TRIGGER_CLS} ${item.kind === "section" ? "gap-1" : ""}`}
          >
            {item.label}
            {item.kind === "section" && <Chevron />}
          </span>
        ))}
        <span ref={rulerMoreRef} className={`${TRIGGER_CLS} gap-1`}>
          {labels.more}
          <Chevron />
        </span>
      </div>

      <nav className="flex items-center gap-6 min-w-0">
        {items.slice(0, shown).map((item) =>
          item.kind === "section" ? (
            <div key={item.key} className="relative group shrink-0">
              {/* Sam HEADER sekcji jest klikalny — prowadzi do /sklep?sekcja=<slug>
                  pokazując WSZYSTKIE produkty z sekcji. Hover otwiera dropdown
                  z sub-kategoriami dla precyzyjniejszego filtra. */}
              <LocalizedLink
                href={item.href}
                className={`${TRIGGER_CLS} gap-1 text-[var(--muted)] group-hover:text-[var(--color-gold)] transition-colors`}
              >
                {item.label}
                <Chevron />
              </LocalizedLink>
              <div className={DROPDOWN_CLS}>
                <LocalizedLink
                  href={item.href}
                  className="block px-5 py-2.5 text-sm text-[var(--color-gold)] hover:bg-[var(--bg)] transition-colors border-b border-[var(--border)] mb-1 font-medium"
                >
                  {labels.allInSection} {item.label.toLowerCase()}
                </LocalizedLink>
                {item.categories.map((c) => (
                  <LocalizedLink
                    key={c.slug}
                    href={`/sklep?kategoria=${c.slug}`}
                    className="block px-5 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    {c.label}
                  </LocalizedLink>
                ))}
              </div>
            </div>
          ) : (
            <div key={item.key} className="shrink-0">
              <LocalizedLink
                href={item.href}
                className={`${TRIGGER_CLS} text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors`}
              >
                {item.label}
              </LocalizedLink>
            </div>
          )
        )}

        {/* Nadmiar — jeden dropdown „Więcej" dla grup i podstron. Sekcje
            zachowują w nim swoje kategorie, żeby zwinięcie nie odcinało
            nawigacji w głąb. */}
        {hidden.length > 0 && (
          <div className="relative group shrink-0">
            <button
              type="button"
              className={`${TRIGGER_CLS} gap-1 text-[var(--muted)] group-hover:text-[var(--color-gold)] transition-colors`}
            >
              {labels.more}
              <Chevron />
            </button>
            <div className={DROPDOWN_CLS}>
              {hidden.map((item) =>
                item.kind === "section" ? (
                  <div key={item.key} className="mb-1 last:mb-0">
                    <LocalizedLink
                      href={item.href}
                      className="block px-5 py-2.5 text-sm text-[var(--color-gold)] hover:bg-[var(--bg)] transition-colors font-medium"
                    >
                      {item.label}
                    </LocalizedLink>
                    {item.categories.map((c) => (
                      <LocalizedLink
                        key={c.slug}
                        href={`/sklep?kategoria=${c.slug}`}
                        className="block pl-8 pr-5 py-2 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                      >
                        {c.label}
                      </LocalizedLink>
                    ))}
                  </div>
                ) : (
                  <LocalizedLink
                    key={item.key}
                    href={item.href}
                    className="block px-5 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                  >
                    {item.label}
                  </LocalizedLink>
                )
              )}
            </div>
          </div>
        )}
      </nav>
    </div>
  );
}
