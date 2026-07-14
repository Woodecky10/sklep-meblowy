import { getAllHomeSections } from "@/app/_lib/home-sections";
import { getAllTrustItems } from "@/app/_lib/trust-items";
import { getAllSiteTexts } from "@/app/_lib/site-texts";
import HomeSectionsEditor from "./HomeSectionsEditor";

// Panel admina jest PL-only. Guard admina w layoucie; akcje wołają requireAdmin().
export default async function AdminHomePageSettings() {
  const [sections, trustItems, siteTexts] = await Promise.all([
    getAllHomeSections(),
    getAllTrustItems(),
    getAllSiteTexts(),
  ]);
  return (
    <HomeSectionsEditor
      initialSections={sections}
      initialTrustItems={trustItems}
      initialSiteTexts={siteTexts}
    />
  );
}
