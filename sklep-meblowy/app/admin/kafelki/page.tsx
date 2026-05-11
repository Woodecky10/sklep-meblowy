import { requireAdmin } from "@/app/_lib/admin";
import { getAllTiles } from "@/app/_lib/home-tiles";
import TilesEditor from "./TilesEditor";

export const metadata = { title: "Kafelki — Admin" };

export default async function AdminTilesPage() {
  await requireAdmin();
  const tiles = await getAllTiles();
  return <TilesEditor initialTiles={tiles} />;
}
