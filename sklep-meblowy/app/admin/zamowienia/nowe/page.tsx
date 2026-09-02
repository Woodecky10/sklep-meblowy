import Link from "next/link";
import { requireAdmin } from "@/app/_lib/admin";
import { createAdminClient } from "@/app/_lib/supabase/server";
import ExternalOrderForm, { type ProductOption } from "./ExternalOrderForm";

export const metadata = { title: "Dodaj zamówienie — Admin" };

// Ręczne dodanie zamówienia spoza sklepu (Allegro, OLX, …) — spec 2026-09-02.
// Lista produktów idzie raz, w całości: picker filtruje w przeglądarce
// (filterBySearch), jak edytor zestawów. Tylko aktywne — nieaktywnego nikt
// już nie sprzedaje.
export default async function AdminNewExternalOrderPage() {
  await requireAdmin();

  const supabase = await createAdminClient();
  const { data: products } = await supabase
    .from("products")
    .select("id, name, price, sale_price, images, is_active")
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-2 text-sm">
        <Link
          href="/admin/zamowienia"
          className="text-[var(--muted)] hover:text-[var(--color-gold)] transition-colors"
        >
          ← Wszystkie zamówienia
        </Link>
      </div>
      <div>
        <h1 className="font-display text-3xl font-bold text-[var(--fg)]">Dodaj zamówienie</h1>
        <p className="text-sm text-[var(--muted)] mt-2 max-w-2xl">
          Zamówienie spoza sklepu (Allegro, OLX itp.). Cena to kwota z tamtego sklepu — może
          się różnić od naszej. Po zapisaniu zamówienie ma status „Opłacone (zewn.)”; gdy
          przestawisz je na „W realizacji”, klient dostanie mail „Dziękujemy za zamówienie”.
        </p>
      </div>
      <ExternalOrderForm products={(products ?? []) as ProductOption[]} />
    </div>
  );
}
