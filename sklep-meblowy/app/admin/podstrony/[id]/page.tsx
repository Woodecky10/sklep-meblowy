import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createAdminClient } from "@/app/_lib/supabase/server";
import { requireAdmin } from "@/app/_lib/admin";
import { getPageAdmin } from "@/app/_lib/pages-server";
import {
  getPageBlocksAdmin,
  getProductsForBlockPicker,
} from "@/app/_lib/blocks-server";
import { getAllCollections } from "@/app/_lib/collections";
import { getCategories } from "@/app/_lib/categories";
import PageEditor from "./PageEditor";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const supabase = await createAdminClient();
  const { data } = await supabase.from("pages").select("title").eq("id", id).maybeSingle();
  return { title: data?.title ? `Podstrona: ${data.title}` : "Podstrona" };
}

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
