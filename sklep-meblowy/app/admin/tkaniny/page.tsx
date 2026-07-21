import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { createAdminClient } from "@/app/_lib/supabase/server";
import FabricsEditor, { type FabricPickerProduct } from "./FabricsEditor";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const supabase = await createAdminClient();
  const [fabrics, groups, { data: productRows }] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    // Picker „Meble w tej tkaninie": aktywne produkty z miniaturą, po nazwie.
    supabase
      .from("products")
      .select("id, name, images")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);
  const pickerProducts: FabricPickerProduct[] = (
    (productRows ?? []) as { id: string; name: string; images: string[] | null }[]
  ).map((p) => ({ id: p.id, name: p.name, image: p.images?.[0] ?? null }));
  return (
    <FabricsEditor
      initialFabrics={fabrics}
      groups={groups}
      pickerProducts={pickerProducts}
    />
  );
}
