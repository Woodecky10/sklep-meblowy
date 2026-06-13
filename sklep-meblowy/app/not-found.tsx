import Link from "next/link";
import { getSections, getCategories } from "@/app/_lib/categories";
import { getLocale } from "@/app/_lib/i18n-server";

// Globalny 404 — renderowany gdy URL nie pasuje do żadnej trasy
// albo gdy w page.tsx wywołamy notFound() (np. produkt usunięty, zamówienie
// nie istnieje). Root layout (TopBar + Navbar + Footer) jest zachowany.
//
// Async bo pobieramy aktywne kategorie z DB żeby pokazać "top sekcje".
// Klient który trafi na zepsuty link od razu widzi gdzie może iść.
export default async function NotFound() {
  const locale = await getLocale();
  const [sections, categories] = await Promise.all([
    getSections(locale),
    getCategories(locale),
  ]);

  // Bierzemy do 4 kategorii z pierwszej sekcji (zazwyczaj "Salon" / "Sypialnia")
  // jako quick-links. Jeśli brak sekcji (świeży deploy bez setupu), pokażemy
  // tylko CTA do sklepu.
  const firstSection = sections[0];
  const quickCategories = firstSection
    ? categories.filter((c) => c.group_slug === firstSection.slug).slice(0, 4)
    : [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-24 md:py-32 text-center">
      <p className="font-display text-[120px] md:text-[160px] font-bold leading-none text-[var(--color-gold)] tracking-tight">
        404
      </p>

      <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold-text)] mb-3 mt-4">
        Strona nie znaleziona
      </p>
      <h1 className="font-display text-3xl md:text-4xl font-bold text-[var(--fg)] mb-6">
        Hmm, ta strona zniknęła jak ostatnia sztuka w wyprzedaży
      </h1>
      <p className="text-[var(--muted)] mb-10 max-w-xl mx-auto leading-relaxed">
        Link mógł się zdezaktualizować albo produkt został zdjęty z oferty.
        Wróć na stronę główną albo przejrzyj sklep — na pewno znajdziemy coś
        ciekawego.
      </p>

      <div className="flex flex-wrap items-center justify-center gap-3 mb-16">
        <Link
          href="/"
          className="inline-flex px-8 py-3.5 bg-[var(--color-navy)] text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold)] transition-colors"
        >
          Strona główna
        </Link>
        <Link
          href="/sklep"
          className="inline-flex px-8 py-3.5 border border-[var(--border)] text-[var(--fg)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
        >
          Przeglądaj sklep
        </Link>
      </div>

      {quickCategories.length > 0 && (
        <div className="border-t border-[var(--border)] pt-10">
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--muted)] mb-5">
            Popularne kategorie
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            {quickCategories.map((cat) => (
              <Link
                key={cat.slug}
                href={`/sklep?kategoria=${cat.slug}`}
                className="px-5 py-2 text-sm font-sans border border-[var(--border)] rounded-full text-[var(--fg)] hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
              >
                {cat.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
