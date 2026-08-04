import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Pasek podkategorii nad siatką produktów. To NIE jest ozdoba: megamenu pokazuje
// tylko trzy poziomy (MENU_MAX_DEPTH), więc dla czwartego i głębszego to jedyna
// droga, którą klient tam dojdzie. Pusta lista dzieci → komponent nie renderuje
// nic (żadnego odstępu).
// Prop nazywa się `items`, NIE `children`: przekazanie `children` atrybutem
// łamie regułę lintera react/no-children-prop.
export default function CategoryChildren({
  items,
}: {
  items: { slug: string; label: string }[];
}) {
  if (items.length === 0) return null;

  return (
    <nav className="flex flex-wrap gap-2 mb-8">
      {items.map((c) => (
        <LocalizedLink
          key={c.slug}
          href={`/sklep?kategoria=${c.slug}`}
          className="px-4 py-2 rounded-full border border-[var(--border)] text-sm text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          {c.label}
        </LocalizedLink>
      ))}
    </nav>
  );
}
