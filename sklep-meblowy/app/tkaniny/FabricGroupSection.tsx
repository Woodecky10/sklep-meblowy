import { pickLocalized, type Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";
import { formatMoney } from "@/app/_lib/money";
import { colorsLabel, fabricsLabel } from "@/app/_lib/fabric-labels";
import LocalizedLink from "@/app/_components/ui/LocalizedLink";
import type { Fabric, FabricPriceGroup } from "@/app/_lib/types";

// Jedna zwijana sekcja grupy cenowej na /tkaniny.
//
// Serwerowo, ZERO JavaScriptu — rozwijanie stoi na natywnym <details>, tak jak
// w app/sklep/CollectionIntro.tsx. Dlaczego tak, a nie komponent kliencki:
// - kafelki zostaja w HTML takze zwiniete, wiec wszystkie linki do
//   /tkaniny/[slug] sa w zrodle strony (linkowanie wewnetrzne dla Google),
// - <summary> daje obsluge klawiatury i role dla czytnikow ekranu bez naszego
//   kodu (Enter/Space, focus),
// - <details> BEZ atrybutu `name` nie tworzy akordeonu, czyli sekcje sa
//   niezalezne i klient moze miec otwarte wszystkie naraz — ustalenie z
//   2026-07-30. Nie dodawac `name`, bo to zmieni zachowanie na akordeon.
//
// Cena za brak JS: nie ma plynnej animacji rozsuwania. Swiadomie akceptowane.

// Ile probek pokazujemy w zwinietym nagloweku.
const PREVIEW_COUNT = 5;

// Pierwsze zdjecie sposrod kolorow tkaniny (kolory bez zdjecia pomijamy).
function fabricThumb(f: Fabric): string | undefined {
  return (f.colors ?? []).map((c) => f.color_images?.[c]).find(Boolean);
}

export default function FabricGroupSection({
  group,
  items,
  locale,
  rate,
}: {
  group: FabricPriceGroup;
  items: Fabric[];
  locale: Locale;
  rate: number;
}) {
  const t = getDictionary(locale);
  const groupName = pickLocalized(group.name, group.name_de, locale);
  const surchargeLabel =
    group.surcharge > 0
      ? `+${formatMoney(group.surcharge, locale, rate)}`
      : t.fabrics.groupNoSurcharge;

  return (
    <details
      data-testid="fabric-group"
      className="group mb-6 border-b border-[var(--border)] pb-6"
    >
      <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-gold)] [&::-webkit-details-marker]:hidden">
        <h2 className="font-display text-2xl font-bold text-[var(--fg)]">{groupName}</h2>
        <span className="font-sans text-sm font-semibold text-[var(--color-gold-text)]">
          {surchargeLabel}
        </span>
        <span data-testid="fabric-group-count" className="font-sans text-sm text-[var(--muted)]">
          {items.length} {fabricsLabel(items.length, t)}
        </span>

        {/* Podglad probek — TYLKO w stanie zwinietym. Po rozwinieciu dublowalby
            pierwsze kafelki siatki, dlatego group-open:hidden. aria-hidden, bo
            to dekoracja: te same tkaniny sa nizej jako linki z nazwami. */}
        <span
          data-testid="fabric-group-preview"
          aria-hidden="true"
          className="ml-auto flex items-center gap-1.5 group-open:hidden"
        >
          {items.slice(0, PREVIEW_COUNT).map((f) => {
            const thumb = fabricThumb(f);
            return (
              <span
                key={f.id}
                className="block h-10 w-10 overflow-hidden rounded-md border border-[var(--border)] bg-[var(--bg)]"
              >
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
                ) : (
                  <span className="flex h-full w-full items-center justify-center text-[10px] text-[var(--muted)]">
                    {f.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
            );
          })}
        </span>

        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
          className="shrink-0 text-[var(--muted)] transition-transform group-open:rotate-180"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </summary>

      <div className="mt-6 grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-5">
        {items.map((f) => {
          const thumb = fabricThumb(f);
          const n = (f.colors ?? []).length;
          return (
            <LocalizedLink
              key={f.id}
              href={`/tkaniny/${f.slug}`}
              className="group/tile flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card-bg)] p-4 transition-colors hover:border-[var(--color-gold)]"
            >
              <span className="relative block aspect-square overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg)]">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={thumb}
                    alt={pickLocalized(f.name, f.name_de, locale)}
                    loading="lazy"
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                ) : (
                  <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
                    {f.name.slice(0, 2).toUpperCase()}
                  </span>
                )}
              </span>
              <span>
                <span className="block font-display text-base font-semibold text-[var(--fg)] transition-colors group-hover/tile:text-[var(--color-gold)]">
                  {pickLocalized(f.name, f.name_de, locale)}
                </span>
                {n > 0 && (
                  <span className="mt-0.5 block text-xs text-[var(--muted)]">
                    {n} {colorsLabel(n, t)}
                  </span>
                )}
              </span>
            </LocalizedLink>
          );
        })}
      </div>
    </details>
  );
}
