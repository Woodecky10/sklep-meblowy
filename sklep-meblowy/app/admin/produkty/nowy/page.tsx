import { requireAdmin } from "@/app/_lib/admin";
import {
  getCategories,
  getSections,
  groupCategoriesForSelect,
} from "@/app/_lib/categories";
import NewProductForm from "./NewProductForm";

export const metadata = { title: "Nowy produkt — Admin" };

export default async function NewProductPage() {
  await requireAdmin();
  // Tylko AKTYWNE kategorie (getCategories/getSections filtrują active),
  // pogrupowane po sekcjach do <optgroup> — czytelny wybór zamiast płaskiej
  // listy mieszającej aktywne i nieaktywne.
  const [sections, categories] = await Promise.all([getSections(), getCategories()]);
  return <NewProductForm sections={groupCategoriesForSelect(sections, categories)} />;
}
