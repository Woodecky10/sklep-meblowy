import { requireAdmin } from "@/app/_lib/admin";
import { getAllCategories } from "@/app/_lib/categories";
import NewProductForm from "./NewProductForm";

export const metadata = { title: "Nowy produkt — Admin" };

export default async function NewProductPage() {
  await requireAdmin();
  const categories = await getAllCategories();
  return (
    <NewProductForm
      categories={categories.map((c) => ({ slug: c.slug, label: c.label }))}
    />
  );
}
