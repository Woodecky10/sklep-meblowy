import { requireAdmin } from "@/app/_lib/admin";
import { getCategories } from "@/app/_lib/categories";
import { flattenForSelect } from "@/app/_lib/category-tree";
import NewProductForm from "./NewProductForm";

export const metadata = { title: "Nowy produkt — Admin" };

export default async function NewProductPage() {
  await requireAdmin();
  // Tylko WIDOCZNE gałęzie (getCategories filtruje efektywną widoczność),
  // pogrupowane po korzeniu do <optgroup>. HTML nie zna zagnieżdżonych
  // optgroup, więc głębsze poziomy dostają wcięcie w etykiecie opcji.
  const categories = await getCategories();
  return <NewProductForm groups={flattenForSelect(categories)} />;
}
