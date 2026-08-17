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
//   1. fraza opisuje rzecz, której sklep nie prowadzi (szafa, komoda), i jest
//      JEDYNYM zawężeniem → mówimy to wprost, bo klient inaczej szuka dalej
//      po pustych stronach,
//   2. fraza nie trafiła w nic innego → mówimy dla czego nie ma wyników,
//   3. brak frazy (zero wynika z filtrów) → dotychczasowa podpowiedź o filtrach.
//
// W przypadkach 1 i 2 pokazujemy kafelki kategorii, bo ślepy zaułek był
// najgorszą częścią starego komunikatu.
export default function EmptySearchState({
  query,
  categories,
  hasOtherFilters,
  locale,
  labels,
}: {
  query: string | undefined;
  categories: MenuNode[];
  // Czy poza frazą zawęża wynik cokolwiek jeszcze — patrz warunek gałęzi 1.
  hasOtherFilters: boolean;
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

  // NOT_CARRIED sprawdzamy TYLKO przy zerowym wyniku I TYLKO wtedy, gdy fraza
  // jest jedynym zawężeniem — oba warunki są potrzebne, żeby komunikat „nie
  // prowadzimy X" nie mógł skłamać. Sam zerowy wynik nie wystarcza: zero bierze
  // się też z frazy RAZEM z filtrem, więc „?kategoria=sofy&q=stół" trafiłoby
  // tutaj także wtedy, gdy stoły są w katalogu. Przy aktywnym filtrze spadamy
  // do przypadku 2, który niczego o asortymencie nie twierdzi.
  // Przy samej frazie gwarancja jest domknięta: gdyby sklep sprzedawał X,
  // fraza dałaby wyniki i tej gałęzi nikt by nie wykonał.
  const nieprowadzone = hasOtherFilters
    ? null
    : notCarriedLabel(searchKeyTokens(fraza), locale);
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
