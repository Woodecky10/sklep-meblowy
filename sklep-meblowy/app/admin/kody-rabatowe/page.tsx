import { requireAdmin } from "@/app/_lib/admin";
import { getAllPromoCodes } from "@/app/_lib/promo";
import PromoEditor from "./PromoEditor";

export const metadata = { title: "Kody rabatowe — Admin" };

export default async function AdminPromoCodesPage() {
  await requireAdmin();
  const codes = await getAllPromoCodes();
  return <PromoEditor initialCodes={codes} />;
}
