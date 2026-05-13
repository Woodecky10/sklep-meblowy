import { requireAdmin } from "@/app/_lib/admin";
import {
  getAllFeaturedAdmin,
  getAvailableProductsForFeatured,
} from "@/app/_lib/featured";
import FeaturedEditor from "./FeaturedEditor";

export const metadata = { title: "Polecane — Admin" };

export default async function AdminFeaturedPage() {
  await requireAdmin();
  const [featured, available] = await Promise.all([
    getAllFeaturedAdmin(),
    getAvailableProductsForFeatured(),
  ]);
  return <FeaturedEditor initialFeatured={featured} availableProducts={available} />;
}
