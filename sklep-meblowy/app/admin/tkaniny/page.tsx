import { requireAdmin } from "@/app/_lib/admin";
import { getAllFabrics } from "@/app/_lib/fabrics";
import FabricsEditor from "./FabricsEditor";

export const metadata = { title: "Tkaniny — Admin" };

export default async function AdminFabricsPage() {
  await requireAdmin();
  const fabrics = await getAllFabrics();
  return <FabricsEditor initialFabrics={fabrics} />;
}
