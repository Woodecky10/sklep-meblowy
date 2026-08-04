import LocalizedLink from "../ui/LocalizedLink";
import type { MenuNode } from "@/app/_lib/category-tree";

export type NavStripPageLink = { id: string; href: string; label: string };

// Wspólne klasy wyzwalacza pozycji paska. BEZ h-24: przy zawijaniu do drugiego
// rzędu pozycje wysokie na całą wysokość headera dałyby pasek na ~190 px.
const TRIGGER_CLS =
  "font-sans text-xs uppercase tracking-widest py-2 flex items-center whitespace-nowrap text-[var(--muted)] transition-colors";
const PANEL_CLS =
  "absolute top-full left-1/2 -translate-x-1/2 z-20 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all";

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

// Pasek nawigacji desktopowej: korzenie drzewa kategorii + linki do podstron.
//
// Poziom 1 = pozycja paska, poziom 2 = nagłówek kolumny, poziom 3 = linki pod
// nagłówkiem. Głębsze poziomy są odcięte w menuProjection (MENU_MAX_DEPTH)
// i dostępne paskiem dzieci na stronie kategorii — panel rozwijany ma skończoną
// wysokość i przy głębokim drzewie zrobiłby się nieczytelny.
//
// Gdy pozycji jest więcej, niż mieści się w szerokości kontenera, ZAWIJAJĄ SIĘ
// do kolejnego rzędu (flex-wrap) i header rośnie w dół — strona nigdy nie
// rozszerza się w prawo.
//
// Czysty CSS, zero JS: brak przeskoku po hydracji i brak CLS.
export default function NavStrip({
  nodes,
  pageLinks,
  labels,
}: {
  nodes: MenuNode[];
  pageLinks: NavStripPageLink[];
  labels: { allInSection: string };
}) {
  return (
    // min-w-0 jest tu nośne: bez niego kontener nie może zwężyć się poniżej
    // szerokości treści, więc nic by się nie zawinęło.
    <div className="hidden lg:flex items-center flex-1 justify-center min-w-0">
      <nav className="flex flex-wrap items-center justify-start gap-x-6 gap-y-1">
        {nodes.map((root) => {
          // Megamenu (kolumny z nagłówkami) tylko wtedy, gdy jest co grupować.
          // Przy płaskiej gałęzi zostaje jedna kolumna — dokładnie dzisiejszy
          // wygląd, więc migracja nie zmienia menu, dopóki Ola nie pogłębi drzewa.
          const hasGrandchildren = root.children.some((c) => c.children.length > 0);
          return (
            <div key={root.slug} className="relative group shrink-0">
              {/* Sam nagłówek pozycji jest klikalny — prowadzi do listingu
                  całego poddrzewa. Hover otwiera panel z podkategoriami. */}
              <LocalizedLink
                href={`/sklep?kategoria=${root.slug}`}
                className={`${TRIGGER_CLS} gap-1 group-hover:text-[var(--color-gold)]`}
              >
                {root.label}
                <Chevron />
              </LocalizedLink>

              {root.children.length > 0 && (
                <div
                  className={`${PANEL_CLS} ${
                    hasGrandchildren
                      ? "grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-4 w-max max-w-[min(90vw,880px)]"
                      : "min-w-[220px]"
                  }`}
                >
                  <LocalizedLink
                    href={`/sklep?kategoria=${root.slug}`}
                    className={`block px-3 py-2 text-sm text-[var(--color-gold)] hover:bg-[var(--bg)] transition-colors border-b border-[var(--border)] font-medium ${
                      hasGrandchildren ? "col-span-full" : "mb-1"
                    }`}
                  >
                    {labels.allInSection} {root.label.toLowerCase()}
                  </LocalizedLink>

                  {root.children.map((child) => (
                    <div key={child.slug} className="min-w-0">
                      <LocalizedLink
                        href={`/sklep?kategoria=${child.slug}`}
                        className={
                          child.children.length > 0
                            ? "block px-3 py-1.5 text-xs font-sans uppercase tracking-widest text-[var(--color-gold-text)] hover:text-[var(--color-gold)] transition-colors"
                            : "block px-3 py-2.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                        }
                      >
                        {child.label}
                      </LocalizedLink>
                      {child.children.map((grand) => (
                        <LocalizedLink
                          key={grand.slug}
                          href={`/sklep?kategoria=${grand.slug}`}
                          className="block px-3 py-1.5 text-sm text-[var(--fg)] hover:bg-[var(--bg)] hover:text-[var(--color-gold)] transition-colors"
                        >
                          {grand.label}
                        </LocalizedLink>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {/* Podstrony z menu (admin: /admin/podstrony) — zawijają się razem
            z kategoriami, bez osobnego limitu. */}
        {pageLinks.map((item) => (
          <div key={item.id} className="shrink-0">
            <LocalizedLink
              href={item.href}
              className={`${TRIGGER_CLS} hover:text-[var(--color-gold)]`}
            >
              {item.label}
            </LocalizedLink>
          </div>
        ))}
      </nav>
    </div>
  );
}
