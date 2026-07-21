import LocalizedLink from "@/app/_components/ui/LocalizedLink";

// Sekcja „Meble w tej tkaninie" na stronie tkaniny: siatka kafelków wybranych
// produktów (główne zdjęcie + nazwa) → /produkt/[id]. Server component (bez
// interakcji). Wygląd jak kafelki katalogu /tkaniny.
export default function FabricFeaturedProducts({
  products,
}: {
  products: { id: string; name: string; image: string | null }[];
}) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
      {products.map((p) => (
        <LocalizedLink
          key={p.id}
          href={`/produkt/${p.id}`}
          className="group flex flex-col gap-3"
        >
          <span className="relative block aspect-[4/3] rounded-2xl overflow-hidden border border-[var(--border)] bg-[var(--bg)]">
            {p.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={p.image}
                alt=""
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              />
            ) : (
              <span className="absolute inset-0 flex items-center justify-center text-xs text-[var(--muted)]">
                {p.name.slice(0, 2).toUpperCase()}
              </span>
            )}
          </span>
          <span className="font-sans text-sm text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors">
            {p.name}
          </span>
        </LocalizedLink>
      ))}
    </div>
  );
}
