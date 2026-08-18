import type { Metadata } from "next";
import { requireAdmin } from "@/app/_lib/admin";
import { getNewOrderIssuesCount } from "@/app/_lib/order-issues-data";
import { getNewOrdersCount } from "@/app/_lib/orders";
import { getNewSampleOrdersCount } from "@/app/_lib/samples";
import { getPendingReviewsCount } from "@/app/_lib/reviews-admin";
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
  // Cztery niezależne liczniki — równolegle, żeby nie dokładać round-tripów
  // do każdej podstrony panelu.
  const [newIssues, newOrders, newSamples, newReviews] = await Promise.all([
    getNewOrderIssuesCount(),
    getNewOrdersCount(),
    getNewSampleOrdersCount(),
    getPendingReviewsCount(),
  ]);

  return (
    <AdminShell
      userEmail={user.email ?? null}
      newIssues={newIssues}
      newOrders={newOrders}
      newSamples={newSamples}
      newReviews={newReviews}
    >
      {children}
    </AdminShell>
  );
}
