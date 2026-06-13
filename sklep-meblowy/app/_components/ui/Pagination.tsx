import LocalizedLink from "./LocalizedLink";

type Props = {
  page: number;
  pages: number;
  searchParams: Record<string, string>;
};

// Okienkowanie: zawsze 1 i ostatnia + bieżąca ±2, reszta jako "…".
// Bez tego przy dużym katalogu renderowały się WSZYSTKIE strony, rozbijając
// layout (audyt 2026-06-11 LOW).
function pageWindow(page: number, pages: number): (number | "ellipsis")[] {
  const delta = 2;
  const items: (number | "ellipsis")[] = [];
  for (let p = 1; p <= pages; p++) {
    if (p === 1 || p === pages || (p >= page - delta && p <= page + delta)) {
      items.push(p);
    } else if (items[items.length - 1] !== "ellipsis") {
      items.push("ellipsis");
    }
  }
  return items;
}

export default function Pagination({ page, pages, searchParams }: Props) {
  if (pages <= 1) return null;

  function pageHref(p: number) {
    const params = new URLSearchParams({ ...searchParams, strona: String(p) });
    return `/sklep?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-16">
      {page > 1 && (
        <LocalizedLink
          href={pageHref(page - 1)}
          aria-label="Poprzednia strona"
          className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          ←
        </LocalizedLink>
      )}
      {pageWindow(page, pages).map((item, i) =>
        item === "ellipsis" ? (
          <span
            key={`e${i}`}
            className="w-10 h-10 flex items-center justify-center text-sm text-[var(--muted)]"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <LocalizedLink
            key={item}
            href={pageHref(item)}
            aria-label={`Strona ${item}`}
            aria-current={item === page ? "page" : undefined}
            className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-sans transition-colors ${
              item === page
                ? "bg-[var(--color-navy)] text-white"
                : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
            }`}
          >
            {item}
          </LocalizedLink>
        )
      )}
      {page < pages && (
        <LocalizedLink
          href={pageHref(page + 1)}
          aria-label="Następna strona"
          className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          →
        </LocalizedLink>
      )}
    </div>
  );
}
