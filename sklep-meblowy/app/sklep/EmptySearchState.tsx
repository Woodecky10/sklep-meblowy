import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import { searchKeyTokens } from "@/app/_lib/search-filter";
import { notCarriedLabel } from "@/app/_lib/search-vocabulary";
import type { Locale } from "@/app/_lib/i18n";
import type { MenuNode } from "@/app/_lib/category-tree";

type Kafelek = { slug: string; label: string };

// Pozycje, które nie są rodziną produktów — nie proponujemy ich klientowi,
// który właśnie nie znalazł tego, czego szukał. „Nasze realizacje" to galeria
// zrealizowanych zamówień, nie gałąź oferty.
const POMIJANE_KAFELKI = new Set(["z-produkcji"]);

// Kafelki to RODZINY PRODUKTÓW, a nie węzły najwyższego poziomu drzewa.
// Pomiar i zrzut z 2026-08-13: na najwyższym poziomie stoją dokładnie dwie
// pozycje — „Meble" (0 produktów, kryje pod sobą siedem rodzin) i „Nasze
// realizacje" — więc kafelki wprost z pierwszego poziomu dałyby klientowi
// wybór „Meble / Nasze realizacje", czyli nic. Dlatego węzeł, który ma dzieci,
// zastępujemy jego dziećmi; węzeł bez dzieci zostaje sam sobą.
// Filtrujemy PRZED rozwinięciem, żeby razem z „Naszymi realizacjami" zniknęły
// też ich podkategorie.
function rodzinyProduktow(nodes: MenuNode[]): Kafelek[] {
  return nodes
    .filter((n) => !POMIJANE_KAFELKI.has(n.slug))
    .flatMap((n) => (n.children.length > 0 ? n.children : [n]))
    .map((n) => ({ slug: n.slug, label: n.label }));
}

// Stan pustego wyniku na /sklep. Trzy przypadki, w tej kolejności:
//
//   1. fraza opisuje rzecz, której sklep nie prowadzi (szafa, komoda) →
//      mówimy to wprost, bo klient inaczej szuka dalej po pustych stronach,
//   2. fraza nie trafiła w nic innego → mówimy dla czego nie ma wyników,
//   3. brak frazy (zero wynika z filtrów) → dotychczasowa podpowiedź o filtrach.
//
// W przypadkach 1 i 2 pokazujemy kafelki kategorii, bo ślepy zaułek był
// najgorszą częścią starego komunikatu.
export default function EmptySearchState({
  query,
  categories,
  locale,
  labels,
}: {
  query: string | undefined;
  categories: MenuNode[];
  locale: Locale;
  labels: {
    emptyTitle: string;
    emptyHint: string;
    emptyNotCarried: string;
    emptySearchTitle: string;
    emptyCategoriesHint: string;
  };
}) {
  const fraza = query?.trim();
  if (!fraza) {
    return (
      <div className="text-center py-24 text-[var(--muted)]">
        <p className="font-display text-2xl mb-2">{labels.emptyTitle}</p>
        <p className="text-sm">{labels.emptyHint}</p>
      </div>
    );
  }

  // NOT_CARRIED sprawdzamy TYLKO tutaj, przy zerowym wyniku — dzięki temu
  // komunikat „nie prowadzimy X" nie może skłamać: gdyby sklep zaczął
  // sprzedawać X, fraza dałaby wyniki i ta gałąź w ogóle by się nie wykonała.
  const nieprowadzone = notCarriedLabel(searchKeyTokens(fraza), locale);
  const kafelki = rodzinyProduktow(categories);

  return (
    <div className="text-center py-16 text-[var(--muted)]">
      {/* break-words, bo w komunikacie siedzi fraza klienta: jedno długie słowo
          bez spacji (55 znaków w teście) wychodziło poza kontener na 390px. */}
      <p className="font-display text-2xl mb-2 text-[var(--fg)] break-words">
        {nieprowadzone
          ? `${labels.emptyNotCarried} ${nieprowadzone}.`
          : `${labels.emptySearchTitle} „${fraza}”`}
      </p>
      {kafelki.length > 0 && (
        <>
          <p className="text-sm mb-6">{labels.emptyCategoriesHint}</p>
          <div className="flex flex-wrap justify-center gap-3">
            {kafelki.map((c) => (
              <LocalizedLink
                key={c.slug}
                href={`/sklep?kategoria=${c.slug}`}
                className="px-5 py-2.5 rounded-full border border-[var(--border)] text-sm text-[var(--fg)] hover:border-[var(--color-navy)] hover:bg-[var(--surface)] transition-colors"
              >
                {c.label}
              </LocalizedLink>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
