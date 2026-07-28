import {
  getAllHomeBlocksAdmin,
  getProductsForBlockPicker,
} from "@/app/_lib/blocks-server";
import { getAllTrustItems } from "@/app/_lib/trust-items";
import { getAllSiteTexts } from "@/app/_lib/site-texts";
import { getAllCollections } from "@/app/_lib/collections";
import { getCategories } from "@/app/_lib/categories";
import { COMPANY } from "@/app/_lib/company";
import BlocksEditor from "./BlocksEditor";
import { getTopBarSettingsForAdmin } from "./actions";

// Panel admina jest PL-only. Guard admina w layoucie; akcje wołają requireAdmin().
export default async function AdminHomePageSettings() {
  const [blocks, trustItems, siteTexts, products, collections, categories, topBar] =
    await Promise.all([
      getAllHomeBlocksAdmin(),
      getAllTrustItems(),
      getAllSiteTexts(),
      getProductsForBlockPicker(),
      getAllCollections(),
      getCategories(),
      getTopBarSettingsForAdmin(),
    ]);
  return (
    <BlocksEditor
      initialBlocks={blocks}
      initialTrustItems={trustItems}
      initialSiteTexts={siteTexts}
      initialTopBar={topBar}
      contactDefaults={{ phone: COMPANY.phone ?? "", email: COMPANY.email }}
      picker={{
        products,
        collections: collections.map((c) => ({ slug: c.slug, label: c.label })),
        categories: categories.map((c) => ({ slug: c.slug, label: c.label })),
      }}
    />
  );
}
