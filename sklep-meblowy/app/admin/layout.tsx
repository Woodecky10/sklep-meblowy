import type { Metadata } from "next";
import { requireAdmin } from "@/app/_lib/admin";
import { getNewOrderIssuesCount } from "@/app/_lib/order-issues-data";
import { getNewOrdersCount } from "@/app/_lib/orders";
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
  // Dwa niezależne liczniki — równolegle, żeby nie dokładać dwóch round-tripów
  // do każdej podstrony panelu.
  const [newIssues, newOrders] = await Promise.all([
    getNewOrderIssuesCount(),
    getNewOrdersCount(),
  ]);

  return (
    <AdminShell
      userEmail={user.email ?? null}
      newIssues={newIssues}
      newOrders={newOrders}
    >
      {children}
    </AdminShell>
  );
}
