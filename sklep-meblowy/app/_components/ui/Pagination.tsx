import Link from "next/link";

type Props = {
  page: number;
  pages: number;
  searchParams: Record<string, string>;
};

export default function Pagination({ page, pages, searchParams }: Props) {
  if (pages <= 1) return null;

  function pageHref(p: number) {
    const params = new URLSearchParams({ ...searchParams, strona: String(p) });
    return `/sklep?${params.toString()}`;
  }

  return (
    <div className="flex items-center justify-center gap-2 mt-16">
      {page > 1 && (
        <Link
          href={pageHref(page - 1)}
          className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          ←
        </Link>
      )}
      {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
        <Link
          key={p}
          href={pageHref(p)}
          className={`w-10 h-10 flex items-center justify-center rounded-full text-sm font-sans transition-colors ${
            p === page
              ? "bg-[var(--color-navy)] text-white"
              : "border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)]"
          }`}
        >
          {p}
        </Link>
      ))}
      {page < pages && (
        <Link
          href={pageHref(page + 1)}
          className="w-10 h-10 flex items-center justify-center rounded-full border border-[var(--border)] text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          →
        </Link>
      )}
    </div>
  );
}
