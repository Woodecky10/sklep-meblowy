import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Meble Premium | Eleganckie Meble do Twojego Domu",
};

const categories = [
  {
    name: "Sofy 3-osobowe",
    slug: "sofa-3-osobowa",
    description: "Komfort i elegancja w każdym salonie",
    bg: "bg-stone-100 dark:bg-stone-900",
    title: "text-stone-900 dark:text-stone-100",
    desc: "text-stone-700 dark:text-stone-300",
  },
  {
    name: "Łóżka tapicerowane",
    slug: "lozko-tapicerowane",
    description: "Sypialnia marzeń, sen doskonały",
    bg: "bg-slate-100 dark:bg-slate-900",
    title: "text-slate-900 dark:text-slate-100",
    desc: "text-slate-700 dark:text-slate-300",
  },
  {
    name: "Fotele",
    slug: "fotele",
    description: "Twój kąt relaksu i inspiracji",
    bg: "bg-amber-50 dark:bg-amber-950",
    title: "text-amber-950 dark:text-amber-50",
    desc: "text-amber-800 dark:text-amber-200",
  },
  {
    name: "Pufy",
    slug: "pufy",
    description: "Styl i wszechstronność w jednym",
    bg: "bg-rose-50 dark:bg-rose-950",
    title: "text-rose-950 dark:text-rose-50",
    desc: "text-rose-800 dark:text-rose-200",
  },
];

const featured = [
  {
    id: "1",
    name: "Sofa Velvet Midnight",
    price: 4299,
    category: "Sofa 3-osobowa",
    badge: "Bestseller",
  },
  {
    id: "2",
    name: "Łóżko Aurelia 180",
    price: 5899,
    category: "Łóżka tapicerowane",
    badge: "Nowość",
  },
  {
    id: "3",
    name: "Fotel Cashmere",
    price: 2199,
    category: "Fotele",
    badge: null,
  },
  {
    id: "4",
    name: "Pufa Porto Grande",
    price: 899,
    category: "Pufy",
    badge: "Nowość",
  },
];

export default function HomePage() {
  return (
    <>
      {/* Hero */}
      <section className="relative min-h-[80vh] flex items-center bg-[var(--color-navy)] overflow-hidden">
        <div
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage:
              "repeating-linear-gradient(45deg, #c9a84c 0, #c9a84c 1px, transparent 0, transparent 50%)",
            backgroundSize: "20px 20px",
          }}
        />
        <div className="relative max-w-7xl mx-auto px-6 py-24">
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-6">
            Kolekcja 2025
          </p>
          <h1 className="font-display text-5xl md:text-7xl font-bold text-white leading-tight max-w-2xl mb-8">
            Meble, które{" "}
            <em className="not-italic text-[var(--color-gold)]">opowiadają</em>{" "}
            historię
          </h1>
          <p className="text-white/60 text-lg max-w-lg mb-10 leading-relaxed">
            Odkryj kolekcję mebli premium, stworzonych z myślą o ludziach,
            którzy cenią piękno, trwałość i niepowtarzalny styl.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/sklep"
              className="inline-flex items-center gap-2 px-8 py-4 bg-[var(--color-gold)] text-[var(--color-navy)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold-light)] transition-colors"
            >
              Przeglądaj kolekcję
            </Link>
            <Link
              href="/sklep?kategoria=nowosci"
              className="inline-flex items-center gap-2 px-8 py-4 border border-white/30 text-white font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:border-[var(--color-gold)] hover:text-[var(--color-gold)] transition-colors"
            >
              Nowości
            </Link>
          </div>
        </div>
      </section>

      {/* Kategorie */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
            Kolekcje
          </p>
          <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
            Znajdź swój styl
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/sklep?kategoria=${cat.slug}`}
              className={`group ${cat.bg} rounded-2xl p-8 flex flex-col gap-3 hover:ring-2 hover:ring-[var(--color-gold)] transition-all`}
            >
              <span
                className={`font-display text-2xl font-bold ${cat.title} group-hover:text-[var(--color-gold)] transition-colors`}
              >
                {cat.name}
              </span>
              <span className={`text-sm ${cat.desc} leading-snug`}>
                {cat.description}
              </span>
              <span className="mt-auto text-xs font-sans uppercase tracking-widest text-[var(--color-gold)] flex items-center gap-1">
                Odkryj
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Polecane */}
      <section className="bg-[var(--card-bg)] border-y border-[var(--border)] py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-end justify-between mb-16">
            <div>
              <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
                Wybór redakcji
              </p>
              <h2 className="font-display text-4xl font-bold text-[var(--fg)]">
                Polecane produkty
              </h2>
            </div>
            <Link
              href="/sklep"
              className="hidden md:inline-flex text-sm font-sans uppercase tracking-widest text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
            >
              Wszystkie →
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {featured.map((p) => (
              <Link
                key={p.id}
                href={`/produkt/${p.id}`}
                className="group flex flex-col"
              >
                <div className="relative aspect-[4/5] bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden mb-4">
                  {p.badge && (
                    <span className="absolute top-4 left-4 z-10 px-3 py-1 bg-[var(--color-gold)] text-[var(--color-navy)] text-xs font-sans font-bold uppercase tracking-wider rounded-full">
                      {p.badge}
                    </span>
                  )}
                  <div className="absolute inset-0 flex items-center justify-center text-[var(--muted)] text-sm">
                    Zdjęcie produktu
                  </div>
                </div>
                <p className="text-xs font-sans uppercase tracking-widest text-[var(--muted)] mb-1">
                  {p.category}
                </p>
                <p className="font-display text-lg font-semibold text-[var(--fg)] group-hover:text-[var(--color-gold)] transition-colors mb-2">
                  {p.name}
                </p>
                <p className="font-sans font-bold text-[var(--fg)]">
                  {p.price.toLocaleString("pl-PL")} zł
                </p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Banner promocyjny */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="rounded-3xl bg-[var(--color-navy)] px-12 py-16 flex flex-col md:flex-row items-center justify-between gap-8">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
              Oferta limitowana
            </p>
            <h3 className="font-display text-3xl md:text-4xl font-bold text-white max-w-md">
              Do 30% taniej na wybrane modele
            </h3>
          </div>
          <Link
            href="/sklep?wyprzedaz=true"
            className="shrink-0 px-8 py-4 bg-[var(--color-gold)] text-[var(--color-navy)] font-sans font-semibold text-sm uppercase tracking-widest rounded-full hover:bg-[var(--color-gold-light)] transition-colors"
          >
            Skorzystaj z oferty
          </Link>
        </div>
      </section>
    </>
  );
}
