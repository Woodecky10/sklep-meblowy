import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getProduct, getRelatedProducts } from "@/app/_lib/products";
import { getCategoryLabel } from "@/app/_lib/categories";
import ImageGallery from "@/app/_components/ui/ImageGallery";
import ProductActions from "@/app/_components/ui/ProductActions";
import ProductCard from "@/app/_components/ui/ProductCard";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) return { title: "Produkt nie znaleziony" };
  return {
    title: product.name,
    description: product.description,
    openGraph: {
      images: product.images?.[0] ? [{ url: product.images[0] }] : [],
    },
  };
}

export default async function ProduktPage({ params }: Props) {
  const { id } = await params;
  const product = await getProduct(id);
  if (!product) notFound();

  const related = await getRelatedProducts(product.id, product.category);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs font-sans text-[var(--muted)] mb-12 uppercase tracking-widest">
        <a href="/" className="hover:text-[var(--color-gold)] transition-colors">Dom</a>
        <span>/</span>
        <a href="/sklep" className="hover:text-[var(--color-gold)] transition-colors">Sklep</a>
        <span>/</span>
        <a
          href={`/sklep?kategoria=${product.category}`}
          className="hover:text-[var(--color-gold)] transition-colors"
        >
          {getCategoryLabel(product.category) ?? product.category}
        </a>
        <span>/</span>
        <span className="text-[var(--fg)] normal-case tracking-normal">{product.name}</span>
      </nav>

      {/* Główna sekcja */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 mb-24">
        <ImageGallery images={product.images} name={product.name} />

        <div className="flex flex-col gap-8">
          <div>
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-3">
              {getCategoryLabel(product.category) ?? product.category}
            </p>
            <h1 className="font-display text-4xl font-bold text-[var(--fg)] leading-tight mb-4">
              {product.name}
            </h1>
            <p className="font-sans text-3xl font-bold text-[var(--fg)]">
              {product.price.toLocaleString("pl-PL")} zł
            </p>
          </div>

          <p className="text-[var(--muted)] leading-relaxed">{product.description}</p>

          <div className="flex items-center gap-2 text-sm text-[var(--muted)]">
            <span
              className={`w-2 h-2 rounded-full ${product.stock > 0 ? "bg-green-500" : "bg-red-400"}`}
            />
            {product.stock > 5
              ? "Dostępny"
              : product.stock > 0
              ? `Ostatnie ${product.stock} szt.`
              : "Wyprzedany"}
          </div>

          <ProductActions product={product} />

          <div className="border-t border-[var(--border)] pt-6 text-sm text-[var(--muted)] space-y-2">
            <p>✓ Darmowa dostawa od 2000 zł</p>
            <p>✓ Zwrot do 30 dni</p>
            <p>✓ Gwarancja 2 lata</p>
          </div>
        </div>
      </div>

      {/* Podobne produkty */}
      {related.length > 0 && (
        <section>
          <div className="mb-10">
            <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
              Zobacz też
            </p>
            <h2 className="font-display text-3xl font-bold text-[var(--fg)]">
              Podobne produkty
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
            {related.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
