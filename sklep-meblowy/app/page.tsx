import Link from "next/link";
import type { Metadata } from "next";
import HomeHeroSlider, { type HeroSlide } from "./_components/layout/HomeHeroSlider";

export const metadata: Metadata = {
  title: "Meble Premium | Eleganckie Meble do Twojego Domu",
};

// Slajdy hero — docelowo zastąpimy odczytem z DB (admin panel CRUD).
// Na razie hardkod w kodzie — zmiana wymaga PR + deploy.
const HERO_SLIDES: HeroSlide[] = [
  {
    id: "kolekcja-2026",
    imageUrl:
      "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=2000&q=80",
    imageAlt: "Elegancka sofa w jasnym salonie premium",
    eyebrow: "Kolekcja 2026",
    title:
      'Meble, które <em class="not-italic text-[var(--color-gold)]">opowiadają</em> historię',
    subtitle:
      "Odkryj kolekcję mebli premium, stworzonych z myślą o ludziach, którzy cenią piękno, trwałość i niepowtarzalny styl.",
    ctaPrimary: { label: "Przeglądaj kolekcję", href: "/sklep" },
    ctaSecondary: { label: "Nowości", href: "/sklep?sortuj=newest" },
  },
  {
    id: "sypialnia-premium",
    imageUrl:
      "https://images.unsplash.com/photo-1505693314120-0d443867891c?w=2000&q=80",
    imageAlt: "Luksusowa sypialnia z tapicerowanym łóżkiem",
    eyebrow: "Sypialnia premium",
    title:
      'Sen, na który <em class="not-italic text-[var(--color-gold)]">zasługujesz</em>',
    subtitle:
      "Tapicerowane łóżka, kontynentale, materace i toppery — komfort dopracowany w każdym detalu.",
    ctaPrimary: { label: "Zobacz łóżka", href: "/sklep?kategoria=lozko-tapicerowane" },
    ctaSecondary: { label: "Materace", href: "/sklep?kategoria=materace" },
  },
  {
    id: "narozniki-i-sofy",
    imageUrl:
      "https://images.unsplash.com/photo-1567016432779-094069958ea5?w=2000&q=80",
    imageAlt: "Modułowy narożnik w nowoczesnym salonie",
    eyebrow: "Centrum salonu",
    title:
      'Narożniki, w których <em class="not-italic text-[var(--color-gold)]">rodzą się</em> wspomnienia',
    subtitle:
      "Modułowe narożniki w kształcie L i U oraz sofy 2- i 3-osobowe — szyte na zamówienie pod Twój salon.",
    ctaPrimary: { label: "Narożniki L", href: "/sklep?kategoria=naroznik-l" },
    ctaSecondary: { label: "Sofy", href: "/sklep?kategoria=sofa-3-osobowa" },
  },
];

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
      {/* Hero — slider z auto-rotacją (6s) i nawigacją (strzałki + kropki) */}
      <HomeHeroSlider slides={HERO_SLIDES} />

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
                <div className="relative aspect-[4/3] bg-stone-100 dark:bg-stone-800 rounded-2xl overflow-hidden mb-4">
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
