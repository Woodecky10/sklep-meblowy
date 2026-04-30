import { requireAdmin } from "@/app/_lib/admin";
import { getSyncLog } from "./actions";
import BaseLinkerSyncPanel from "./BaseLinkerSyncPanel";

export const metadata = { title: "BaseLinker — Admin" };

export default async function AdminBaseLinkerPage() {
  await requireAdmin();
  const logs = await getSyncLog(20);

  return <BaseLinkerSyncPanel initialLogs={logs} />;
}
