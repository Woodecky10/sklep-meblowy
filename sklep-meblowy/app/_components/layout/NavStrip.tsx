import LocalizedLink from "../ui/LocalizedLink";

export type NavStripSection = {
  slug: string;
  label: string;
  categories: { slug: string; label: string }[];
};

export type NavStripPageLink = { id: string; href: string; label: string };

// Wspólne klasy wyzwalacza pozycji paska. BEZ h-24: przy zawijaniu do drugiego
// rzędu pozycje wysokie na całą wysokość headera dałyby pasek na ~190 px.
const TRIGGER_CLS =
  "font-sans text-xs uppercase tracking-widest py-2 flex items-center whitespace-nowrap text-[var(--muted)] transition-colors";
const DROPDOWN_CLS =
  "absolute top-full left-1/2 -translate-x-1/2 z-20 min-w-[220px] bg-[var(--card-bg)] border border-[var(--border)] rounded-xl shadow-2xl py-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible group-focus-within:opacity-100 group-focus-within:visible transition-all";

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

// Pasek nawigacji desktopowej: grupy kategorii + linki do podstron.
//
// Gdy pozycji jest więcej, niż mieści się w szerokości kontenera, ZAWIJAJĄ SIĘ
// do kolejnego rzędu (flex-wrap) i header rośnie w dół — strona nigdy nie
// rozszerza się w prawo. Wcześniej pozycje były `shrink-0` w kontenerze bez
// `min-w-0`, więc nadmiar wypływał poza wiersz i był obcinany przez
// `overflow-x: clip`, zabierając ze sobą ikony (łącznie z koszykiem).
//
// Czysty CSS, zero JS: brak przeskoku po hydracji i brak CLS.
export default function NavStrip({
  sections,
  pageLinks,
  labels,
}: {
  sections: NavStripSection[];
  pageLinks: NavStripPageLink[];
  labels: { allInSection: string };
}) {
  return (
    // min-w-0 jest tu nośne: bez niego kontener nie może zwężyć się poniżej
    // szerokości treści, więc nic by się nie zawinęło.
    <div className="hidden lg:flex items-center flex-1 justify-center min-w-0">
      {/* justify-start, NIE center: przy zawinięciu każdy rząd startuje z tej
          samej linii co pierwsza pozycja u góry. Przy center rzędy centrowałyby
          się niezależnie i dolny „wisiał" w środku. Sam pasek pozostaje
          wyśrodkowany, dopóki mieści się w jednym rzędzie — wtedy jego szerokość
          to max-content, a centruje go justify-center rodzica. */}
      <nav className="flex flex-wrap items-center justify-start gap-x-6 gap-y-1">
        {sections.map((section) => (
          <div key={section.slug} className="relative group shrink-0">
            {/* Sam HEADER sekcji jest klikalny — prowadzi do /sklep?sekcja=<slug>
                pokazując WSZYSTKIE produkty z sekcji. Hover otwiera dropdown
                z sub-kategoriami dla precyzyjniejszego filtra. */}
            <LocalizedLink
              href={`/sklep?sekcja=${section.slug}`}
              className={`${TRIGGER_CLS} gap-1 group-hover:text-[var(--color-gold)]`}
            >
              {section.label}
              <Chevron />
            </LocalizedLink>
            <div className={DROPDOWN_CLS}>
              <LocalizedLink
                href={`/sklep?sekcja=${section.slug}`}
                className="block px-5 py-2.5 text-sm text-[var(--color-gold)] hover:bg-[var(--bg)] transition-colors border-b border-[var(--border)] mb-1 font-medium"
              >
                {labels.allInSection} {section.label.toLowerCase()}
              </LocalizedLink>
              {section.categories.map((c) => (
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
        ))}

        {/* Podstrony z menu (admin: /admin/podstrony) — zawijają się razem z
            grupami, bez osobnego limitu. */}
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
