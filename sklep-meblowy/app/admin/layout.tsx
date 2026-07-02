import type { Metadata } from "next";
import { requireAdmin } from "@/app/_lib/admin";
import { getNewOrderIssuesCount } from "@/app/_lib/order-issues-data";
import AdminShell from "./AdminShell";

export const metadata: Metadata = {
  title: "Panel admina",
  robots: { index: false, follow: false },
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireAdmin();
  const newIssues = await getNewOrderIssuesCount();

  return (
    <AdminShell userEmail={user.email ?? null} newIssues={newIssues}>
      {children}
    </AdminShell>
  );
}
