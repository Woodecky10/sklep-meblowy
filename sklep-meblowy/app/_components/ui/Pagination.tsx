import LocalizedLink from "./LocalizedLink";
import { DEFAULT_LOCALE, type Locale } from "@/app/_lib/i18n";
import { getDictionary } from "@/app/_lib/dictionaries";

type Props = {
  page: number;
  pages: number;
  searchParams: Record<string, string>;
  locale?: Locale;
  basePath?: string;
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

export default function Pagination({ page, pages, searchParams, locale = DEFAULT_LOCALE, basePath = "/sklep" }: Props) {
  if (pages <= 1) return null;

  const t = getDictionary(locale);

  function pageHref(p: number) {
    const params = new URLSearchParams({ ...searchParams, strona: String(p) });
    return `${basePath}?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-16">
      {page > 1 && (
        <LocalizedLink
          href={pageHref(page - 1)}
          aria-label={t.pagination.prev}
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
            aria-label={`${t.pagination.page} ${item}`}
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
          aria-label={t.pagination.next}
          className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          →
        </LocalizedLink>
      )}
    </div>
  );
}
