import { requireAdmin } from "@/app/_lib/admin";
import { getAllInquiries } from "@/app/_lib/inquiries";
import InquiriesList from "./InquiriesList";

export const metadata = { title: "Zapytania — Admin" };

export default async function AdminInquiriesPage() {
  await requireAdmin();
  const inquiries = await getAllInquiries();
  return <InquiriesList initialInquiries={inquiries} />;
}
