import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics, getFabricPriceGroups } from "@/app/_lib/fabrics";
import FabricsEditor from "./FabricsEditor";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const [fabrics, groups] = await Promise.all([getAllFabrics(), getFabricPriceGroups()]);
  return <FabricsEditor initialFabrics={fabrics} groups={groups} />;
}
