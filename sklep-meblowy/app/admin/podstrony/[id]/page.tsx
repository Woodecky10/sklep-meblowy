import { notFound } from "next/navigation";
import { requireAdmin } from "@/app/_lib/admin";
import { getPageAdmin } from "@/app/_lib/pages-server";
import {
  getPageBlocksAdmin,
  getProductsForBlockPicker,
} from "@/app/_lib/blocks-server";
import { getAllCollections } from "@/app/_lib/collections";
import { getCategories } from "@/app/_lib/categories";
import PageEditor from "./PageEditor";

export default async function AdminPageEdit({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireAdmin();
  const { id } = await params;
  const [page, blocks, products, collections, categories] = await Promise.all([
    getPageAdmin(id),
    getPageBlocksAdmin(id),
    getProductsForBlockPicker(),
    getAllCollections(),
    getCategories(),
  ]);
  if (!page) notFound();
  return (
    <PageEditor
      initialPage={page}
      initialBlocks={blocks}
      picker={{
        products,
        collections: collections.map((c) => ({ slug: c.slug, label: c.label })),
        categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
      }}
    />
  );
}
