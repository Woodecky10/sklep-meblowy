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
    // Picker do zdjęć z produkcji: tylko aktywne, po nazwie (wzorzec zestawów).
    supabase
      .from("products")
      .select("id, name")
      .eq("is_active", true)
      .order("name", { ascending: true }),
  ]);
  return (
    <FabricsEditor
      initialFabrics={fabrics}
      groups={groups}
      pickerProducts={(productRows ?? []) as FabricPickerProduct[]}
    />
  );
}
