import Link from "next/link";
import Image from "next/image";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import type { Product } from "@/app/_lib/types";

export const metadata = { title: "Produkty — Admin" };

export default async function AdminProduktyPage() {
  await requireAdmin();
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("products")
    .select("*")
    .order("name", { ascending: true });

  const products = (data ?? []) as Product[];

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="font-sans text-xs uppercase tracking-[0.3em] text-[var(--color-gold)] mb-2">
          Mollien
        </p>
        <h1 className="font-display text-4xl font-bold text-[var(--fg)]">
          Produkty
        </h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl leading-relaxed">
          Edytuj wyświetlane nazwy wariantów i przypisuj zdjęcia per wariant.
          Same dane produktu (cena, opis, kategoria, stock) edytujesz w
          BaseLinkerze — synchronizacja z BL nie nadpisze tu twoich zmian.
        </p>
      </div>

      {products.length === 0 ? (
        <div className="text-center py-16 text-[var(--muted)] border border-dashed border-[var(--border)] rounded-2xl">
          <p className="font-display text-base">
            Brak produktów. Wgraj je w BaseLinkerze i kliknij „Synchronizuj
            teraz" w sekcji BaseLinker.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const image = p.images?.[0];
            const variantsCount = p.variants?.combinations.length ?? 0;
            return (
              <Link
                key={p.id}
                href={`/admin/produkty/${p.id}`}
                className="group flex gap-3 p-4 bg-[var(--card-bg)] border border-[var(--border)] rounded-2xl hover:border-[var(--color-gold)] transition-colors"
              >
                <div className="relative w-20 h-20 shrink-0 rounded-xl overflow-hidden bg-stone-100 dark:bg-stone-800">
                  {image ? (
                    <Image
                      src={image}
                      alt=""
                      fill
                      sizes="80px"
                      className="object-cover"
                    />
                  ) : null}
                </div>
                <div className="flex-1 min-w-0 flex flex-col">
                  <p className="font-display text-sm font-semibold text-[var(--fg)] line-clamp-2 group-hover:text-[var(--color-gold)] transition-colors">
                    {p.name}
                  </p>
                  <p className="text-xs text-[var(--muted)] mt-1">
                    {p.price.toLocaleString("pl-PL")} zł
                    {variantsCount > 0 && (
                      <>
                        {" "}
                        ·{" "}
                        <span className="text-[var(--color-gold)] font-semibold">
                          {variantsCount}{" "}
                          {variantsCount === 1
                            ? "wariant"
                            : variantsCount < 5
                            ? "warianty"
                            : "wariantów"}
                        </span>
                      </>
                    )}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
