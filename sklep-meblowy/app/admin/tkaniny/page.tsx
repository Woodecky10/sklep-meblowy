import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import { createAdminClient } from "@/app/_lib/supabase/server";
import FabricsEditor, { type FabricPickerProduct } from "./FabricsEditor";
import type { FabricPropertyDefRow } from "@/app/_lib/types";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const supabase = await createAdminClient();
  const [fabrics, groups, { data: productRows }, { data: propertyRows }] = await Promise.all([
    getAllFabrics(),
    getFabricPriceGroups(),
    // Picker „Meble w tej tkaninie": aktywne produkty z miniaturą, po nazwie.
    supabase
      .from("products")
      .select("id, name, images")
      .eq("is_active", true)
      .order("name", { ascending: true }),
    // Definicje cech: surowe wiersze (z `id`), bo panel je edytuje i usuwa.
    // Świadomie NIE getFabricPropertyDefs() — tamten cache jest pod sklep
    // i nie niesie `id`. Błąd (brak tabeli przed migracją 64) → pusta lista.
    supabase
      .from("fabric_property_defs")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);
  const pickerProducts: FabricPickerProduct[] = (
    (productRows ?? []) as { id: string; name: string; images: string[] | null }[]
  ).map((p) => ({ id: p.id, name: p.name, image: p.images?.[0] ?? null }));
  const propertyDefs = (propertyRows ?? []) as FabricPropertyDefRow[];
  return (
    <FabricsEditor
      initialFabrics={fabrics}
      groups={groups}
      propertyDefs={propertyDefs}
      pickerProducts={pickerProducts}
    />
  );
}
