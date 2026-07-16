import { requireAdmin } from "@/app/_lib/admin";
import { getAllBundlesAdmin } from "@/app/_lib/bundles-server";
import { createAdminClient } from "@/app/_lib/supabase/server";
import BundlesEditor, { type PickerProduct } from "./BundlesEditor";

export const metadata = { title: "Zestawy — Admin" };

export default async function AdminZestawyPage() {
  await requireAdmin();

  const supabase = await createAdminClient();
  const [bundles, { data: products }] = await Promise.all([
    getAllBundlesAdmin(),
    supabase
      .from("products")
      .select("id, name, price, sale_price, images, is_active")
      .order("name", { ascending: true }),
  ]);

  return (
    <div className="p-6 lg:p-10 max-w-5xl">
      <h1 className="font-display text-3xl font-bold text-[var(--fg)] mb-2">Zestawy</h1>
      <p className="text-sm text-[var(--muted)] mb-8">
        Połącz 2 lub więcej mebli (np. fotel + narożnik) w zestaw z rabatem.
        Klient zobaczy ofertę zestawu na kartach tych produktów.
      </p>
      <BundlesEditor
        bundles={bundles}
        products={((products ?? []) as PickerProduct[]).filter((p) => p.is_active)}
      />
    </div>
  );
}
