import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getProduct } from "@/app/_lib/products";
import { getAllCategories } from "@/app/_lib/categories";
import ProductEditor from "./ProductEditor";

export const metadata = { title: "Edycja produktu — Admin" };

export default async function AdminProductEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [product, categories] = await Promise.all([
    getProduct(id),
    getAllCategories(),
  ]);
  if (!product) notFound();

  return <ProductEditor product={product} categories={categories} />;
}
