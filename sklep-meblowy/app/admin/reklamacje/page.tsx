import { requireAdmin } from "@/app/_lib/admin";
import { getAllOrderIssues } from "@/app/_lib/order-issues-data";
import ReklamacjeList from "./ReklamacjeList";

export const metadata = { title: "Reklamacje — Admin" };

export default async function AdminOrderIssuesPage() {
  await requireAdmin();
  const issues = await getAllOrderIssues();
  return <ReklamacjeList initialIssues={issues} />;
}
