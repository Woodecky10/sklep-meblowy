import { getAllHomeSections } from "@/app/_lib/home-sections";
import HomeSectionsEditor from "./HomeSectionsEditor";

// Panel admina jest PL-only. Guard admina jest w layoucie admina;
// każda akcja dodatkowo woła requireAdmin().
export default async function AdminHomePageSettings() {
  const sections = await getAllHomeSections();
  return <HomeSectionsEditor initialSections={sections} />;
}
