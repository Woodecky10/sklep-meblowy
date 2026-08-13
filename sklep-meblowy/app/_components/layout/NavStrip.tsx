import LocalizedLink from "../ui/LocalizedLink";
import type { MenuNode } from "@/app/_lib/category-tree";

export type NavStripPageLink = { id: string; href: string; label: string };

// Wspólne klasy wyzwalacza pozycji paska. py-3 wyznacza wysokość całego rzędu
// (kontener rzędu nie ma własnego paddingu) — dzięki temu dolna krawędź
// wyzwalacza pokrywa się z dolną krawędzią rzędu i między wyzwalaczem a panelem
// nie ma martwej strefy, w której hover by gasł.
const TRIGGER_CLS =
  "font-sans text-xs uppercase tracking-widest py-3 flex items-center whitespace-nowrap text-[var(--muted)] transition-colors";

const PANEL_BASE =
  "absolute top-full z-20 bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl p-3 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all";
// Megamenu (do 880 px) wyśrodkowane w OKNIE, nie pod swoją pozycją: panel tak
// szeroki, wyśrodkowany na skrajnie lewej pozycji, wychodził za lewą krawędź
// ekranu (przed przeniesieniem paska do drugiego rzędu ucinało 84 px przy
// 1285 px). left-0 right-0 + mx-auto liczy się względem rzędu, który jest
// pełnej szerokości, więc panel nie ucieka za krawędź przy żadnej liczbie
// pozycji. Wąskie panele zostają pod swoją pozycją — przy 220 px nie ma czego
// ucinać, a związek z pozycją czyta się lepiej.
const PANEL_WIDE = `${PANEL_BASE} left-0 right-0 mx-auto w-max max-w-[min(90vw,880px)] grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-x-6 gap-y-4`;
const PANEL_NARROW = `${PANEL_BASE} left-1/2 -translate-x-1/2 min-w-[220px]`;

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
// DRUGI RZĄD HEADERA, pełna szerokość kontenera. Wcześniej pasek dzielił jeden
// rząd z logo i wyszukiwarką i dostawał tylko resztkę miejsca w środku —
// ~475 px na 1232 px kontenera. Pięć pozycji potrzebowało 474 px, więc przy
// oknie 1280 px (ekran 2560 px przy skalowaniu 200%) brakowało jednego piksela
// i „Kontakt" spadał pod „Meble". Tu pasek ma całe 1232 px, czyli miejsce na
// ~12 pozycji — dodanie kategorii w panelu nie łamie już headera.
//
// Gdy pozycji byłoby jeszcze więcej, ZAWIJAJĄ SIĘ do kolejnego rzędu
// (flex-wrap) i header rośnie w dół — ale jako wyśrodkowany blok
// (justify-center), więc zawinięcie wygląda celowo, a nie jak sierota
// dociśnięta do lewej. Strona nigdy nie rozszerza się w prawo.
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
    // relative jest tu nośne: względem TEGO elementu (pełna szerokość okna)
    // pozycjonują się szerokie panele megamenu, więc nie mają jak wyjść za
    // krawędź. Kontener rzędu bez własnego paddingu w pionie — wysokość
    // wyznacza py-3 wyzwalaczy (patrz TRIGGER_CLS).
    <div className="hidden lg:block relative border-t border-[var(--border)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1">
          {nodes.map((root) => {
            // Megamenu (kolumny z nagłówkami) tylko wtedy, gdy jest co grupować.
            // Przy płaskiej gałęzi zostaje jedna kolumna — dokładnie dzisiejszy
            // wygląd, więc migracja nie zmienia menu, dopóki Ola nie pogłębi drzewa.
            const hasGrandchildren = root.children.some((c) => c.children.length > 0);
            return (
              // relative TYLKO przy wąskim panelu — szeroki kotwiczy się do
              // rzędu (pełna szerokość), więc pozycja nie może być kontekstem
              // pozycjonowania, bo panel wróciłby pod pozycję i znów ucinał.
              <div
                key={root.slug}
                className={`group shrink-0 ${hasGrandchildren ? "" : "relative"}`}
              >
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
                  <div className={hasGrandchildren ? PANEL_WIDE : PANEL_NARROW}>
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
    </div>
  );
}
