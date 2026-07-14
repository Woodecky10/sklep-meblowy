import {
  getAllHomeBlocksAdmin,
  getProductsForBlockPicker,
} from "@/app/_lib/blocks-server";
import { getAllTrustItems } from "@/app/_lib/trust-items";
import { getAllSiteTexts } from "@/app/_lib/site-texts";
import { getAllCollections } from "@/app/_lib/collections";
import { getCategories } from "@/app/_lib/categories";
import BlocksEditor from "./BlocksEditor";

// Panel admina jest PL-only. Guard admina w layoucie; akcje wołają requireAdmin().
export default async function AdminHomePageSettings() {
  const [blocks, trustItems, siteTexts, products, collections, categories] =
    await Promise.all([
      getAllHomeBlocksAdmin(),
      getAllTrustItems(),
      getAllSiteTexts(),
      getProductsForBlockPicker(),
      getAllCollections(),
      getCategories(),
    ]);
  return (
    <BlocksEditor
      initialBlocks={blocks}
      initialTrustItems={trustItems}
      initialSiteTexts={siteTexts}
      picker={{
        products,
        collections: collections.map((c) => ({ slug: c.slug, label: c.label })),
        categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
      }}
    />
  );
}
